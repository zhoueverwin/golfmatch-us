# Supabase Migration Plan: Free → Pro

**Source project ref:** `tylrhszuzpebehzlahfq` (free tier, region: <fill in>)
**Source URL:** `https://tylrhszuzpebehzlahfq.supabase.co`
**Target project ref:** `<NEW_REF>` (Pro tier, region: <pick same region as source to minimise latency churn>)
**Target URL:** `https://<NEW_REF>.supabase.co`

This plan is written so an AI executor can run it end-to-end. Every step has (a) the command to run, (b) the verification check, and (c) the rollback. **Do not skip the verification checks** — they catch the silent-failure modes that hit Supabase migrations.

---

## 0. Scope snapshot (what we are moving)

Captured from the live source project on plan-creation day:

- **Public schema:** 40 tables, ~110 functions, ~45 triggers.
- **RLS state:** 39/40 tables have RLS enabled. `public.disposable_email_domains` has RLS **disabled** (advisor flagged it). Decide before migration: keep disabled or enable + add policies.
- **Auth:** 4 rows in `public.profiles`, which 1:1 with `auth.users` via `handle_new_user` trigger. Auth providers in use (verify in Dashboard → Auth → Providers): email/password, phone OTP, Google OAuth, Apple Sign-In.
- **Storage buckets** (7):
  | Bucket | Public |
  |---|---|
  | `admin-assets` | true |
  | `blog-images` | true |
  | `kyc-verification` | **false** (sensitive) |
  | `message-media` | true |
  | `post-media` | true |
  | `profile-pictures` | true |
  | `user-uploads` | true |
- **Edge Functions** (3):
  | Slug | verify_jwt | Notes |
  |---|---|---|
  | `revenuecat-webhook` | false | RevenueCat calls it; URL is registered in RC dashboard |
  | `didit-webhook` | false | Didit calls it; URL is registered in Didit dashboard |
  | `create-didit-session` | true | Called by the app |
- **Edge Function env vars to recreate:**
  - `DIDIT_API_KEY`
  - `DIDIT_WEBHOOK_SECRET`
  - `DIDIT_WORKFLOW_ID`
  - `REVENUECAT_WEBHOOK_SECRET`
  - (`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` are injected automatically by the platform — **do not set manually**, they'll auto-bind to the new project.)
- **Installed extensions** (must be enabled on target before restoring): `pg_net` (extensions schema), `pg_trgm` (public), `pgcrypto` (extensions), `pg_stat_statements` (extensions), `supabase_vault` (vault), `uuid-ossp` (extensions). Plus the always-installed defaults (`plpgsql`).
- **pg_cron jobs:** none.
- **Vault secrets:** none.
- **Local migration files** (5 baseline + 6 applied since): see `supabase/migrations/`. These reproduce most but not all of the live DB — the live DB has drift from manual SQL applied via MCP (`20260512123807`…`20260515032528`). The pg_dump approach in §3 captures the *current state*, not the migration history, which is what we want for a like-for-like copy.

**Drift warning:** because the live DB has been changed both via local migrations and via direct MCP-applied SQL, **do not** try to migrate by running `supabase db push` against the new project. That will diverge. Use `pg_dump` of the live source as the source of truth.

---

## 1. Prep work (do before touching any DB)

### 1.1 Create the Pro project
- Supabase Dashboard → New project → choose **Pro plan** and the **same region** as the source.
- Set a strong DB password and store it in 1Password.
- Record: project ref, anon key, service_role key, JWT secret, DB connection string (pooler + direct).

### 1.2 Match Postgres major version
Source is Postgres 17 (per `supabase/config.toml: major_version = 17`). When creating the new project, confirm Dashboard → Settings → Database → Postgres version is also 17. Mismatched majors will break `pg_dump` restore.

### 1.3 Install tooling locally
```bash
brew install postgresql@17     # provides pg_dump 17 / pg_restore 17
which pg_dump && pg_dump --version   # must say 17.x
npm i -g supabase@latest       # CLI for edge functions
supabase --version             # should be >= 1.200
```

### 1.4 Capture connection strings into env vars (don't paste passwords inline)
```bash
# Source — copy from old Dashboard → Settings → Database → Connection string → URI (direct, not pooler)
export SRC_DB="postgresql://postgres:<SRC_PWD>@db.tylrhszuzpebehzlahfq.supabase.co:5432/postgres"
# Target
export DST_DB="postgresql://postgres:<DST_PWD>@db.<NEW_REF>.supabase.co:5432/postgres"
export SRC_REF="tylrhszuzpebehzlahfq"
export DST_REF="<NEW_REF>"
```

### 1.5 Freeze the source (production cutover only)
If this is a real cutover (not a dry run):
- Put the mobile app into maintenance mode, OR temporarily restrict the source's network in Dashboard → Database → Network restrictions so writes can't land mid-dump.
- For dry runs, skip this — just accept that a tiny delta of writes will be lost.

---

## 2. Dry-run rehearsal (mandatory — do this once before the real cutover)

Do everything in §3–§9 against the new Pro project **without** the freeze, with a fake app build pointing at the new URL. Verify all features:
- Sign up / sign in (email, phone OTP, Google, Apple).
- KYC submission (Didit) — webhook delivery.
- RevenueCat purchase sandbox — webhook delivery.
- Chat sending, push notifications via `pg_net` trigger.
- Daily recommendations RPC, profile views, likes/matches flow.

If the rehearsal passes, snapshot the new project (Dashboard → Database → Backups → take backup) before re-doing it for production cutover.

---

## 3. Database migration

### 3.1 Enable extensions on the target (before restoring)

Run via Dashboard SQL editor on the target, OR via psql:

```sql
-- Match the source's installed_version set
CREATE EXTENSION IF NOT EXISTS "uuid-ossp"        WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "pgcrypto"         WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "pg_net"           WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "pg_trgm"          WITH SCHEMA public;
-- supabase_vault is auto-installed on project creation; verify only.
```

**Verify:** `SELECT extname, extversion FROM pg_extension ORDER BY 1;` — should include all of the above.

### 3.2 Dump the source

We use three dumps so we can restore selectively and survive failures:

```bash
# (a) Roles only — captures custom roles + grants (rarely customised, but cheap insurance)
pg_dump "$SRC_DB" --no-owner --no-privileges \
  --schema=auth --schema=storage --schema=public --schema=vault --schema=extensions \
  --schema-only -f dump_schema.sql

# (b) Data dump for the schemas we actually care about
pg_dump "$SRC_DB" --no-owner --no-privileges \
  --data-only --disable-triggers \
  --schema=auth --schema=storage --schema=public \
  -f dump_data.sql

# (c) Combined sanity dump (for diffing only — not for restore)
pg_dump "$SRC_DB" --no-owner --no-privileges -f dump_full.sql
```

**Why `--disable-triggers` on data:** your triggers fire side-effects (push notifications via `pg_net`, match creation, notification rows). Loading data with triggers live would fire thousands of phantom notifications and possibly self-deadlock on FKs.

**Verify dump sizes** are non-trivial:
```bash
wc -l dump_schema.sql dump_data.sql dump_full.sql
```

### 3.3 Patch the schema dump for known pitfalls

Before restoring, open `dump_schema.sql` and:

1. **Strip `CREATE SCHEMA`/`CREATE EXTENSION` for schemas Supabase already provisions.** Search for and delete (or comment) any lines that re-create:
   - `CREATE SCHEMA auth;` `CREATE SCHEMA storage;` `CREATE SCHEMA extensions;` `CREATE SCHEMA vault;` `CREATE SCHEMA graphql;` `CREATE SCHEMA realtime;`
   - `CREATE EXTENSION` lines (we did them in 3.1).
2. **Strip role creation.** Lines like `CREATE ROLE supabase_admin ...` — delete. The target already has these.
3. **Strip Supabase-managed function bodies** that conflict on restore:
   - Anything in schemas `auth.*`, `storage.*`, `realtime.*`, `vault.*` whose definition matches what Supabase ships. Keep only **your own** auth/storage triggers — most importantly the `auth.users` → `public.handle_new_user` trigger.
4. **`pg_net` URLs baked into triggers.** Search for `net.http_post` and any string containing `tylrhszuzpebehzlahfq.supabase.co`. The `trigger_send_push_notification` (and any other webhook-firing trigger) likely embeds the old Edge Function URL. Replace `tylrhszuzpebehzlahfq` with `$DST_REF` literally in the SQL before restore.

Run this check after editing:
```bash
grep -n "tylrhszuzpebehzlahfq" dump_schema.sql dump_data.sql
# Expected: no matches. If any remain, fix before restore.
```

### 3.4 Restore schema to target

```bash
psql "$DST_DB" -v ON_ERROR_STOP=1 -f dump_schema.sql 2>&1 | tee restore_schema.log
```

**Verify:**
- `grep -i "error" restore_schema.log` — must be empty (or only "already exists" for benign objects you decided to ignore).
- `psql "$DST_DB" -c "\dt public.*"` shows all 40 tables.
- `psql "$DST_DB" -c "SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON p.pronamespace=n.oid WHERE n.nspname='public';"` — should be in the same ballpark as source (~110, ignoring pg_trgm built-ins).

### 3.5 Restore data to target

```bash
psql "$DST_DB" -v ON_ERROR_STOP=1 -c "SET session_replication_role = replica;"
psql "$DST_DB" -v ON_ERROR_STOP=1 -f dump_data.sql 2>&1 | tee restore_data.log
psql "$DST_DB" -v ON_ERROR_STOP=1 -c "SET session_replication_role = DEFAULT;"
```

`session_replication_role = replica` disables all user triggers and FKs for the load — paired with `--disable-triggers` on dump, this is belt-and-braces. Reset it after.

**Verify row counts match source** for every table — script it:

```sql
-- Run on BOTH source and target, diff the outputs
SELECT schemaname, relname, n_live_tup
FROM pg_stat_user_tables
WHERE schemaname IN ('public','auth','storage')
ORDER BY 1,2;
```

Any non-zero diff (excluding monotonic counters that may have advanced) → investigate before proceeding.

### 3.6 Re-create / verify auth-schema triggers

The critical one is `handle_new_user` on `auth.users` (created in `supabase/migrations/00000000000002_auth_user_triggers.sql`). Confirm:

```sql
SELECT tgname FROM pg_trigger WHERE tgrelid = 'auth.users'::regclass AND NOT tgisinternal;
-- Expect: on_auth_user_created (or whatever your migration named it)
```

If missing, run `supabase/migrations/00000000000002_auth_user_triggers.sql` against the target.

### 3.7 Reset sequences (defensive)

After data load, sequences can be stale, causing PK collisions on the next insert.

```sql
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT s.relname AS seq, n.nspname AS schema, t.relname AS tbl, a.attname AS col
    FROM pg_class s
    JOIN pg_depend d ON d.objid = s.oid
    JOIN pg_class t ON d.refobjid = t.oid
    JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = d.refobjsubid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE s.relkind = 'S' AND n.nspname = 'public'
  LOOP
    EXECUTE format('SELECT setval(%L, COALESCE((SELECT MAX(%I) FROM %I.%I), 1));',
      r.schema||'.'||r.seq, r.col, r.schema, r.tbl);
  END LOOP;
END$$;
```

### 3.8 Decide on the `disposable_email_domains` advisor

The source has RLS disabled on this table. Pick one:
- **Keep as-is** (table is read-only reference data, exposure acceptable): no action.
- **Lock it down**:
  ```sql
  ALTER TABLE public.disposable_email_domains ENABLE ROW LEVEL SECURITY;
  CREATE POLICY "read-only for everyone" ON public.disposable_email_domains
    FOR SELECT USING (true);
  ```
Document the choice in the PR description.

---

## 4. Realtime publication

Realtime tables aren't part of `pg_dump`'s logical-replication state.

```sql
-- On target: list current publication
SELECT * FROM pg_publication_tables WHERE pubname = 'supabase_realtime';
```

Compare against source (same query). For each table that appears on source but not target:
```sql
ALTER PUBLICATION supabase_realtime ADD TABLE public.<table_name>;
```

Mobile app uses realtime for chats & messages at minimum (see `realtime_select_policies_user_likes_matches` migration). Confirm `messages`, `chats`, `user_likes`, `matches` are present.

---

## 5. Storage migration

`pg_dump` moves the `storage.objects` rows (the metadata) but **not the actual file bytes** in object storage. Files must be copied separately.

### 5.1 Recreate buckets on target

Dashboard → Storage → Create bucket, exactly matching:
| Bucket | Public |
|---|---|
| `admin-assets` | true |
| `blog-images` | true |
| `kyc-verification` | **false** |
| `message-media` | true |
| `post-media` | true |
| `profile-pictures` | true |
| `user-uploads` | true |

### 5.2 Storage RLS policies

Already restored by the schema dump (storage policies live in `storage.policies`). Verify:
```sql
SELECT bucket_id, name, definition FROM storage.policies ORDER BY 1,2;
```

### 5.3 Copy object bytes

The simplest reliable path is the official `supabase-storage-migrate` script, but a portable approach using the Supabase CLI + service_role keys:

```bash
# For each bucket, use rclone with two S3-compatible remotes, OR a Node script
# that lists from source and uploads to target. Example skeleton:
node scripts/copy-storage.mjs \
  --src-url "https://$SRC_REF.supabase.co" --src-key "$SRC_SERVICE_KEY" \
  --dst-url "https://$DST_REF.supabase.co" --dst-key "$DST_SERVICE_KEY" \
  --bucket admin-assets
# repeat for each bucket
```

`scripts/copy-storage.mjs` (the executor should write this if not present) iterates `supabase.storage.from(b).list()` with pagination, downloads via `.download()`, uploads via `.upload(path, blob, { upsert: true })`. Critical:
- preserve the full key/path (including subfolders),
- preserve content-type (read from `list()` metadata),
- copy in batches of ~20 with a small concurrency limit to avoid rate limits.

**Verify per-bucket:**
```bash
# Object count parity
psql "$SRC_DB" -c "SELECT bucket_id, count(*) FROM storage.objects GROUP BY 1 ORDER BY 1;"
psql "$DST_DB" -c "SELECT bucket_id, count(*) FROM storage.objects GROUP BY 1 ORDER BY 1;"
```
Spot-check 3–5 random URLs from each public bucket in a browser.

---

## 6. Edge Functions

### 6.1 Link the CLI to the new project
```bash
cd /Users/apple/golfmatch-global
supabase login    # if not already
supabase link --project-ref "$DST_REF"
```

### 6.2 Set secrets on target

```bash
supabase secrets set \
  DIDIT_API_KEY="<value from old project>" \
  DIDIT_WEBHOOK_SECRET="<value>" \
  DIDIT_WORKFLOW_ID="<value>" \
  REVENUECAT_WEBHOOK_SECRET="<value>"
```

Pull these from old project: Dashboard (old) → Edge Functions → Secrets. **Do not** set `SUPABASE_URL` / `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` — Supabase auto-injects these and they'll already point to the new project.

### 6.3 Deploy

```bash
supabase functions deploy revenuecat-webhook   --no-verify-jwt
supabase functions deploy didit-webhook        --no-verify-jwt
supabase functions deploy create-didit-session # verify_jwt stays true (default)
```

The `--no-verify-jwt` flag mirrors the source config (verify_jwt=false for both webhooks).

**Verify:**
```bash
supabase functions list   # all 3 status=ACTIVE
curl -i "https://$DST_REF.supabase.co/functions/v1/revenuecat-webhook"  # 400/401 is fine (means it's reachable); 404 is bad
curl -i "https://$DST_REF.supabase.co/functions/v1/didit-webhook"
```

---

## 7. Auth provider re-config

Auth config is per-project and is **not** part of the DB dump. Recreate on the new project Dashboard → Authentication → Providers:

- **Email**: enable; copy confirm/reset templates from old project's `Auth → Email templates`.
- **Phone**: enable; re-enter Twilio (or whichever SMS provider) creds.
- **Google OAuth**: copy Client ID + Secret from old project. **Update the authorized redirect URI** in Google Cloud Console to `https://$DST_REF.supabase.co/auth/v1/callback`. Keep the old one until cutover succeeds.
- **Apple Sign-In**: same — update the Services ID's "Return URL" in Apple Developer to the new project's callback. Re-paste the team ID, key ID, and `.p8` key.
- **JWT secret / additional claims**: Settings → API → JWT Secret. If you've embedded the old JWT secret anywhere (very unlikely in this codebase but check), update.
- **Site URL / additional redirect URLs**: copy verbatim from old project's `Auth → URL Configuration`.

**Verify:** sign in once with each provider on the dry-run build.

---

## 8. External webhook re-registration

Two third-party services call your edge functions directly. They need pointing at the new URLs **at cutover time**:

- **RevenueCat** → Project → Integrations → Webhooks: change URL to
  `https://$DST_REF.supabase.co/functions/v1/revenuecat-webhook`
  and rotate `REVENUECAT_WEBHOOK_SECRET` if you change it.
- **Didit** → Console → Webhooks: change URL to
  `https://$DST_REF.supabase.co/functions/v1/didit-webhook`.

Keep the old webhook configured in parallel for ~24h after cutover so in-flight events double-deliver to old (idempotent) and new — `revenuecat_webhook_events` table is idempotency-keyed by event id, so duplicate delivery is safe.

---

## 9. Client app cutover

### 9.1 Update `.env` locally
```
EXPO_PUBLIC_SUPABASE_URL=https://<NEW_REF>.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=<new anon key>
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=<same value if you reused the OAuth client>
```

### 9.2 Update EAS secrets
```bash
eas secret:list                      # see what's there
eas secret:delete --name EXPO_PUBLIC_SUPABASE_URL
eas secret:delete --name EXPO_PUBLIC_SUPABASE_ANON_KEY
eas secret:create --scope project --name EXPO_PUBLIC_SUPABASE_URL --value "https://<NEW_REF>.supabase.co"
eas secret:create --scope project --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value "<new anon key>"
```

### 9.3 Rebuild & smoke-test
```bash
export TMPDIR="$HOME/.metro-tmp"
npx expo run:ios --device
```
Hit the golden paths: sign in (each provider), open feed, send a message, swipe a recommendation, view profile, submit KYC, complete a sandbox purchase.

### 9.4 Ship a production update
For a hotfix-grade rollout, prefer an OTA via `eas update` if your code path doesn't touch native (URL change does **not** touch native — it's read from `.env`/runtime). Verify the OTA channel matches the deployed build.

---

## 10. Cutover-day runbook (compressed)

Once the dry run is green:

1. **T-30m**: Announce maintenance. Disable new signups via Dashboard → Authentication → Settings (toggle "Allow new users to sign up") on the **old** project.
2. **T-15m**: Final `pg_dump` of source (§3.2). Restore data only into target (§3.5) — schema is already there from the dry run, but `TRUNCATE` the public tables first to avoid duplicates:
   ```sql
   -- Generate truncate statement
   SELECT 'TRUNCATE TABLE ' || string_agg(format('%I.%I', schemaname, tablename), ', ') || ' RESTART IDENTITY CASCADE;'
   FROM pg_tables WHERE schemaname='public';
   ```
   Run that output, then re-load data.
3. **T-10m**: Re-run sequence reset (§3.7). Re-sync any storage objects created since the dry-run snapshot (diff `storage.objects` row counts and copy only the deltas).
4. **T-5m**: Flip webhooks (RevenueCat, Didit) to the new project.
5. **T-0**: Publish the OTA / submit the app build. Re-enable signups on **new** project.
6. **T+5m**: Watch `mcp__supabase__get_logs` on the new project (api, edge, postgres). Run `gstack /canary` or manual smoke.
7. **T+24h**: If green, decommission old webhooks, then pause (don't delete!) the old project. Keep it paused for 14 days as an emergency rollback.

---

## 11. Rollback strategy

If anything is irrecoverable within 1h of cutover:
1. Point `EXPO_PUBLIC_SUPABASE_URL` / `_ANON_KEY` back to the old project via `eas update` (no rebuild needed if the keys were the only change).
2. Repoint RevenueCat / Didit webhooks back to the old project.
3. Re-enable signups on the old project, disable on the new.
4. Accept the loss of any writes that landed on the new project during the failed cutover (likely zero if you held maintenance mode).

The old project must remain paused-but-restorable for at least 14 days post-cutover before you finally delete it.

---

## 12. Post-cutover cleanup

- Delete the `_didit_debug` table if it was only for debugging the integration (`public._didit_debug` has 20 rows — verify it's not load-bearing first).
- Re-evaluate `disposable_email_domains` RLS (§3.8) if you postponed.
- Enable PITR (Pro-only feature) in Dashboard → Database → Backups → Point in Time Recovery.
- Set up Database Webhooks UI parity if you used any (the source doesn't appear to — only `pg_net` triggers).
- Update `supabase/.temp/` / `supabase/config.toml` `project_id` if you rename the linked project locally.

---

## 13. Acceptance checklist (must all be ✅ before deleting old project)

- [ ] All 40 public tables present on target with matching row counts.
- [ ] `auth.users` count matches.
- [ ] `handle_new_user` trigger present on `auth.users` and tested with a fresh signup.
- [ ] All 7 storage buckets present with matching object counts and the `kyc-verification` bucket is **private**.
- [ ] 3 edge functions deployed and reachable; each responds to a curl ping with a non-404 status.
- [ ] RevenueCat sandbox purchase fires the new webhook and writes to `revenuecat_webhook_events`.
- [ ] Didit verification flow end-to-end completes against the new webhook.
- [ ] Push notification trigger (`trigger_send_push_notification`) fires `net.http_post` against the **new** project URL (verify by inspecting trigger body on target).
- [ ] Realtime: messages/chats/user_likes/matches subscribe and receive live events on the mobile app.
- [ ] Sign-in succeeds for: email, phone, Google, Apple.
- [ ] No advisor warnings on target except the documented `disposable_email_domains` decision.
- [ ] Supabase project paused, not deleted, for the first 14 days.
