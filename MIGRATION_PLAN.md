# Supabase Migration Plan: Tokyo → US-East (Virginia)

**Source project ref:** `bvnwjrxdrbvctesfmedn` (Pro tier, region: `ap-northeast-1` / Tokyo)
**Source URL:** `https://bvnwjrxdrbvctesfmedn.supabase.co`
**Target project ref:** `situfkpgyziruiusiykd` (Pro tier, region: `us-east-2` / Ohio — the app is US-only, so we deliberately want US-East for latency; us-east-2 picked over us-east-1 for materially better recent reliability)
**Target URL:** `https://<NEW_REF>.supabase.co`

This plan is written so an AI executor can run it end-to-end. Every step has (a) the command to run, (b) the verification check, and (c) the rollback. **Do not skip the verification checks** — they catch the silent-failure modes that hit Supabase migrations.

**Region-move-specific risks** (vs. the original Free → Pro draft this evolved from):
- All public storage URLs change hostname (project ref is in the hostname). Any URL persisted in `messages`, `posts`, `post_media`, push notification payloads, etc. will 404 once the old project is paused. We rewrite in place — see §5.4.
- Auth provider redirect URIs (`/auth/v1/callback`) change hostname. Google + Apple consoles must list both old and new during transition.
- Edge function URLs change hostname → Didit + RevenueCat webhook URLs must be updated in their dashboards.
- Realtime websocket reconnects during cutover will look like a transient network blip to any open app. Acceptable; the SDK auto-reconnects.

---

## 0. Scope snapshot (what we are moving)

Captured from the live source project on **2026-05-22**:

- **Postgres:** 17.6, db timezone = `UTC` (not `Asia/Tokyo` — good, region move doesn't shift any cron semantics).
- **Public schema:** ~70 tables (full list via `mcp__supabase__list_tables` — do not rely on a count here; verify before dumping).
- **Views in public:** `kyc_review_queue` (1).
- **RLS state:** verify with `get_advisors` against the target post-restore. Source has known advisor on `public.disposable_email_domains` (RLS disabled — read-only reference data; either keep or enable + add `FOR SELECT USING (true)`).
- **Auth:** ~4 rows in `public.profiles`, 1:1 with `auth.users` via `handle_new_user` trigger. Providers in use (verify in Dashboard → Auth → Providers): email/password, phone OTP, Google OAuth, Apple Sign-In.
- **Storage buckets** (**8** — was 7 in the original draft; `post-images` is the addition):
  | Bucket | Public | File size limit | MIME restrictions |
  |---|---|---|---|
  | `admin-assets` | true | – | – |
  | `blog-images` | true | 5 MB | image/jpeg, png, webp, gif |
  | `kyc-verification` | **false** (sensitive) | 10 MB | image/jpeg, png, webp |
  | `message-media` | true | – | – |
  | `post-images` | true | 10 MB | image/png, jpeg, gif, webp, svg+xml |
  | `post-media` | true | – | – |
  | `profile-pictures` | true | – | – |
  | `user-uploads` | true | – | – |

  Total objects: ~38 (~46 MB). Tiny — physical copy will take minutes, not hours.
- **Edge Functions** (**5** — was 3 in the original draft; `admin-tools` and `request-kyc-review` are the additions):
  | Slug | verify_jwt | Notes |
  |---|---|---|
  | `revenuecat-webhook` | false | RevenueCat calls it; URL is registered in RC dashboard |
  | `didit-webhook` | false | Didit calls it; URL is registered in Didit dashboard |
  | `create-didit-session` | true | Called by the app |
  | `admin-tools` | false | Admin dashboard HTML calls it |
  | `request-kyc-review` | true | Called by the app's KYC manual-review escape hatch |
- **Edge Function env vars to recreate:**
  - `DIDIT_API_KEY`
  - `DIDIT_WEBHOOK_SECRET`
  - `DIDIT_WORKFLOW_ID`
  - `REVENUECAT_WEBHOOK_SECRET`
  - Any admin-tools / request-kyc-review secrets (inspect Dashboard → Edge Functions → Secrets on the source — anything not in the auto-injected `SUPABASE_*` set needs recreating).
  - (`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` are injected automatically by the platform — **do not set manually**, they'll auto-bind to the new project.)
- **Installed extensions** (must be enabled on target before restoring): `postgis 3.3.7` (in `extensions`), `pg_net 0.20.0` (in `extensions`), `pg_trgm 1.6` (in `public`), `pgcrypto 1.3` (in `extensions`), `pg_stat_statements 1.11` (in `extensions`), `pg_cron 1.6.4` (in `pg_catalog`), `supabase_vault 0.3.1` (in `vault`), `uuid-ossp 1.1` (in `extensions`). Plus the always-installed defaults (`plpgsql`). **PostGIS and pg_cron are new vs. the original draft — do not skip them, they are load-bearing for distance scoring and the daily snapshot job respectively.**
- **pg_cron jobs:** **1** (was "none" in the original draft):
  - `compute_yesterday_snapshot` — `30 0 * * *` (UTC) — runs `SELECT public.compute_daily_snapshot((CURRENT_DATE - 1)::date);`
  - **NB:** `pg_dump` does not capture rows in the `cron` schema. Must be re-registered manually on target (§3.9).
- **Realtime publication (`supabase_realtime`)** — 7 public tables: `matches`, `messages`, `notifications`, `post_reactions`, `profile_views`, `profiles`, `user_likes`. Also the per-day partitions under `supabase_realtime_messages_publication` in the `realtime` schema (these are managed by the platform and rebuilt automatically).
- **Vault secrets:** none.
- **Local migration files:** 49 applied migrations (latest: `20260522123114 setup_review_account_helper`). Drift from MCP-applied SQL is present — **use `pg_dump`, not `supabase db push`**.

**Drift warning:** because the live DB has been changed both via local migrations and via direct MCP-applied SQL, **do not** try to migrate by running `supabase db push` against the new project. That will diverge. Use `pg_dump` of the live source as the source of truth.

---

## 1. Prep work (do before touching any DB)

### 1.1 Create the Pro project
- Supabase Dashboard → New project → choose **Pro plan** and region **`us-east-2` (Ohio)**. The app is US-only (`golfmatchdating.us.com`, US App Store, `app_config.app_version.ios.store_url` is `apps.apple.com/us/`) — we want the database next to the user base. The original "same region" guidance no longer applies; this *is* the region move. us-east-2 picked over us-east-1 because us-east-1 has the heaviest historical outage rate of any AWS region; us-east-2 has the same latency profile (~5 ms delta) with a cleaner record.
- Set a strong DB password and store it in 1Password.
- Record: project ref, anon key, service_role key, JWT secret, DB connection string (pooler + direct).
- After creation, in Dashboard → Database → Extensions, toggle on: **PostGIS**, **pg_cron**, **pg_net**, **pg_stat_statements** (most are on by default — verify). Toggling pg_cron via the Dashboard is more reliable than `CREATE EXTENSION` from SQL.

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

**Use the pooler for both source and target.** The direct DB hostnames resolve only over IPv6 — most local machines don't have IPv6 outbound, and the pooler is mandatory in that case anyway. Pooler hostname format depends on when the project was provisioned:
- Older projects: `aws-0-<region>.pooler.supabase.com`
- Newer projects (post-2025 infra rollout): `aws-1-<region>.pooler.supabase.com`

For *this* migration, target lives on `aws-1`. Always try both if the first errors with `Tenant or user not found`.

```bash
# Source (Tokyo, older tenant) — pooler session mode (port 5432) for compatibility with pg_dump
export SRC_DB="postgresql://postgres.bvnwjrxdrbvctesfmedn:<SRC_PWD>@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres"
# Target (Ohio, newer tenant)
export DST_DB="postgresql://postgres.situfkpgyziruiusiykd:sa25965313..@aws-1-us-east-2.pooler.supabase.com:5432/postgres"
export SRC_REF="bvnwjrxdrbvctesfmedn"
export DST_REF="situfkpgyziruiusiykd"
```

Prefer the `PGPASSWORD` env var over inlining the password in the URI to keep it out of `ps`/process listings.

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
CREATE EXTENSION IF NOT EXISTS "postgis"          WITH SCHEMA extensions;
-- pg_cron MUST be enabled via Dashboard → Database → Extensions toggle, not pure SQL.
-- After the Dashboard toggle, this is a no-op confirmation:
CREATE EXTENSION IF NOT EXISTS "pg_cron";
-- supabase_vault is auto-installed on project creation; verify only.
```

**Why PostGIS matters here:** the `profiles` table has a `home_location` geography column (added in migration `00000000000010_profiles_home_location`), the `search_profiles_within_radius` RPC depends on PostGIS operators, and a state-centroid trigger writes to it on every profile update. A restore without PostGIS will fail on the first `geography` column it touches.

**Why pg_cron matters here:** the `compute_yesterday_snapshot` job rolls up `daily_snapshots`. Without it, the analytics table silently stops accumulating rows after cutover — won't break the app, but you'll discover it weeks later when reporting goes flat.

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
4. **`pg_net` URLs baked into triggers.** Search for `net.http_post` and any string containing `bvnwjrxdrbvctesfmedn.supabase.co`. The `trigger_send_push_notification` / `send_push_notification` function (added in migration `add_send_push_notification_function`) embeds the old Edge Function URL. Replace `bvnwjrxdrbvctesfmedn` with `$DST_REF` literally in the SQL before restore.

Run this check after editing:
```bash
grep -n "bvnwjrxdrbvctesfmedn" dump_schema.sql dump_data.sql
# Expected: no matches. If any remain, fix before restore.
```

### 3.4 Restore schema to target

```bash
psql "$DST_DB" -v ON_ERROR_STOP=1 -f dump_schema.sql 2>&1 | tee restore_schema.log
```

**Verify:**
- `grep -i "error" restore_schema.log` — must be empty (or only "already exists" for benign objects you decided to ignore).
- `psql "$DST_DB" -c "\dt public.*"` shows all ~70 tables (run the same `\dt public.*` against `$SRC_DB` and diff the lists).
- `psql "$DST_DB" -c "SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON p.pronamespace=n.oid WHERE n.nspname='public';"` — should match source within a small delta (ignoring pg_trgm/extension-installed built-ins).

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

### 3.8 Re-register pg_cron jobs (not captured by pg_dump)

`pg_dump` skips the `cron` schema. Re-create the job(s) manually on target:

```sql
-- Verify the function exists first
SELECT proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND proname='compute_daily_snapshot';

-- Register the job
SELECT cron.schedule(
  'compute_yesterday_snapshot',
  '30 0 * * *',
  $$SELECT public.compute_daily_snapshot((CURRENT_DATE - 1)::date);$$
);

-- Verify
SELECT jobid, schedule, command, active, jobname FROM cron.job;
```

**Schedule semantics check:** `30 0 * * *` runs at 00:30 UTC, regardless of where the DB lives physically. That was 09:30 JST under the old setup; now it's 19:30 ET (EST) / 20:30 ET (EDT) under the new setup. For a "yesterday's snapshot" rollup that's fine — but if you'd rather have the rollup happen in the dead of US night, change to e.g. `30 7 * * *` (= 03:30 ET EDT).

### 3.9 Decide on the `disposable_email_domains` advisor

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

Compare against source (same query). The known-good list to ensure (captured from source on 2026-05-22):

```sql
ALTER PUBLICATION supabase_realtime ADD TABLE
  public.matches,
  public.messages,
  public.notifications,
  public.post_reactions,
  public.profile_views,
  public.profiles,
  public.user_likes;
```

Run as one statement so an already-added table doesn't abort the rest (Postgres will reject the whole statement if any one fails — wrap in a DO block with EXCEPTION handlers if you've already partially added).

**`REPLICA IDENTITY` for the `profiles` table**: migration `20260522020102 profiles_replica_identity_full` sets `ALTER TABLE public.profiles REPLICA IDENTITY FULL;` — confirm this survived the restore:

```sql
SELECT relreplident FROM pg_class WHERE relname = 'profiles' AND relnamespace = 'public'::regnamespace;
-- 'f' = FULL (correct); 'd' = DEFAULT (broken — realtime UPDATE events will be missing old-row data)
```

If not 'f', re-run: `ALTER TABLE public.profiles REPLICA IDENTITY FULL;`

---

## 5. Storage migration

`pg_dump` moves the `storage.objects` rows (the metadata) but **not the actual file bytes** in object storage. Files must be copied separately.

### 5.1 Recreate buckets on target

Dashboard → Storage → Create bucket, exactly matching:
| Bucket | Public | File size limit | MIME restrictions |
|---|---|---|---|
| `admin-assets` | true | – | – |
| `blog-images` | true | 5 MB | image/jpeg, png, webp, gif |
| `kyc-verification` | **false** | 10 MB | image/jpeg, png, webp |
| `message-media` | true | – | – |
| `post-images` | true | 10 MB | image/png, jpeg, gif, webp, svg+xml |
| `post-media` | true | – | – |
| `profile-pictures` | true | – | – |
| `user-uploads` | true | – | – |

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

### 5.4 Rewrite persisted storage URLs (region-move-specific — was not in original draft)

Public storage URLs embed the project ref in the hostname (`https://bvnwjrxdrbvctesfmedn.supabase.co/storage/v1/object/public/...`). Any URL persisted as a string in your tables will 404 after the old project is paused.

Find the offending columns first:
```sql
-- Run on target after data restore to enumerate every text/jsonb column that contains the old ref
SELECT table_schema, table_name, column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND data_type IN ('text', 'character varying', 'jsonb', 'json');
-- Then for each, run a count query like:
-- SELECT count(*) FROM public.messages WHERE content LIKE '%bvnwjrxdrbvctesfmedn%';
```

Likely hit list (verify before running UPDATEs):
- `messages.content` (image/video URLs pasted into chat)
- `posts` media URL columns (and `post_media.url` if present)
- `profiles` photo URL columns
- `notifications` payload JSON

Rewrite pattern (run inside a transaction, one column at a time):
```sql
BEGIN;
UPDATE public.messages
SET content = REPLACE(content, 'bvnwjrxdrbvctesfmedn.supabase.co', '<NEW_REF>.supabase.co')
WHERE content LIKE '%bvnwjrxdrbvctesfmedn.supabase.co%';
-- Inspect, then COMMIT (or ROLLBACK if anything looks wrong)
COMMIT;
```

For `jsonb` columns, use `regexp_replace` over the text cast and cast back:
```sql
UPDATE public.notifications
SET data = REPLACE(data::text, 'bvnwjrxdrbvctesfmedn.supabase.co', '<NEW_REF>.supabase.co')::jsonb
WHERE data::text LIKE '%bvnwjrxdrbvctesfmedn.supabase.co%';
```

**Verify:** zero rows match `'%bvnwjrxdrbvctesfmedn%'` after the rewrite.

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
# Plus any secrets used by admin-tools / request-kyc-review — inspect old project first:
#   Dashboard (old) → Edge Functions → Secrets → screenshot the full list
```

Pull these from old project: Dashboard (old) → Edge Functions → Secrets. **Do not** set `SUPABASE_URL` / `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` — Supabase auto-injects these and they'll already point to the new project.

### 6.3 Deploy

All 5 edge functions (this is the corrected list — original draft only deployed 3):

```bash
supabase functions deploy revenuecat-webhook   --no-verify-jwt
supabase functions deploy didit-webhook        --no-verify-jwt
supabase functions deploy admin-tools          --no-verify-jwt
supabase functions deploy create-didit-session                # verify_jwt=true (default)
supabase functions deploy request-kyc-review                  # verify_jwt=true (default)
```

The `--no-verify-jwt` flag mirrors the source config. Confirm the per-function `verify_jwt` setting against the source by re-running `mcp__supabase__list_edge_functions` against the **old** project before deploying.

**Verify:**
```bash
supabase functions list   # all 5 status=ACTIVE
curl -i "https://$DST_REF.supabase.co/functions/v1/revenuecat-webhook"   # 400/401 is fine (reachable); 404 is bad
curl -i "https://$DST_REF.supabase.co/functions/v1/didit-webhook"
curl -i "https://$DST_REF.supabase.co/functions/v1/admin-tools"
# create-didit-session and request-kyc-review will 401 without a JWT — that's correct
curl -i "https://$DST_REF.supabase.co/functions/v1/create-didit-session"
curl -i "https://$DST_REF.supabase.co/functions/v1/request-kyc-review"
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

## 9b. External systems repoint checklist (region-move addition)

Config drift across these 7 surfaces is where the actual blast radius lives — the DB move itself is minutes of work. Tick every box:

- [ ] **`.env` (local)** — `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`
- [ ] **`eas.json`** — all 3 build profiles (development, preview, production) carry the URL and anon key inline (see lines 11, 25, 39 today). Per the team rule, these must match `.env` exactly.
- [ ] **EAS secrets** (`eas secret:list`) — rotate `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`.
- [ ] **Edge Function secrets** on the new project — `DIDIT_API_KEY`, `DIDIT_WEBHOOK_SECRET`, `DIDIT_WORKFLOW_ID`, `REVENUECAT_WEBHOOK_SECRET`, plus anything else the old project's Edge Functions page lists.
- [ ] **Google OAuth client** (Google Cloud Console) — add `https://<NEW_REF>.supabase.co/auth/v1/callback` to authorized redirect URIs **before** cutover. Remove the old URL at T+14d.
- [ ] **Apple Sign-In Services ID** (Apple Developer) — update Return URL to the new project's callback. Repaste team ID + key ID + `.p8` if the JWT secret changes.
- [ ] **Didit webhook URL** (Didit console) — point at `https://<NEW_REF>.supabase.co/functions/v1/didit-webhook`. Leave the old one configured for 24h.
- [ ] **RevenueCat webhook URL** (RC dashboard) — point at `https://<NEW_REF>.supabase.co/functions/v1/revenuecat-webhook`. Idempotency-keyed via `revenuecat_webhook_events`, so dual delivery is safe.
- [ ] **Admin HTML files** (`admin-tools.html`, `admin-dashboard.html`, `kyc-review.html`) — these embed the project ref in `fetch()` calls. Either edit the hardcoded URL or, better, refactor to accept `?project=<ref>` so the operator passes both URL and key at load time.
- [ ] **`.mcp.json`** — update if it references the project ref directly (it likely does for the Supabase MCP binding).
- [ ] **`supabase/config.toml`** — `project_id = "golfmatch"` is a local nickname, not the ref, so it doesn't need to change. But if you've run `supabase link`, re-run it: `supabase link --project-ref <NEW_REF>`.

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

**Database parity:**
- [ ] All public tables present on target with matching row counts (run the diff query from §3.5 — `pg_stat_user_tables` on both sides).
- [ ] `auth.users` count matches.
- [ ] `handle_new_user` trigger present on `auth.users` and tested with a fresh signup.
- [ ] PostGIS installed; `profiles.home_location` column type = `geography`; `search_profiles_within_radius` RPC runs without error.
- [ ] `pg_cron` job `compute_yesterday_snapshot` present in `cron.job` with `active=true`.
- [ ] `profiles.relreplident = 'f'` (REPLICA IDENTITY FULL).
- [ ] No advisor warnings on target except the documented `disposable_email_domains` decision.

**Storage:**
- [ ] All 8 storage buckets present with matching object counts.
- [ ] `kyc-verification` bucket is **private**.
- [ ] Public bucket URLs resolve in a browser (sample 3–5 per bucket).
- [ ] Zero rows in `messages`/`posts`/`notifications` contain `bvnwjrxdrbvctesfmedn.supabase.co` after the §5.4 rewrite.

**Edge functions & integrations:**
- [ ] All 5 edge functions deployed and reachable; each responds to a curl ping with a non-404 status.
- [ ] RevenueCat sandbox purchase fires the new webhook and writes to `revenuecat_webhook_events`.
- [ ] Didit verification flow end-to-end completes against the new webhook.
- [ ] Push notification trigger fires `net.http_post` against the **new** project URL (verify by inspecting trigger body on target — should reference `<NEW_REF>.supabase.co`, not `bvnwjrxdrbvctesfmedn`).
- [ ] Realtime: messages/profiles/user_likes/matches/notifications subscribe and receive live events on the mobile app.

**Auth:**
- [ ] Sign-in succeeds for: email, phone, Google, Apple.
- [ ] Google OAuth console lists both old and new `/auth/v1/callback` URLs (old can be removed at T+14d).
- [ ] Apple Sign-In Services ID return URL updated.

**Client:**
- [ ] `.env`, `eas.json` (all 3 build profiles: dev, preview, production), and any EAS secret all point at `<NEW_REF>`.
- [ ] App OTA shipped and verified on a real device (sign in → swipe → message → KYC link → purchase sandbox).

**Operational:**
- [ ] Old project **paused, not deleted**, for the first 14 days.
- [ ] PITR enabled on new project (Dashboard → Database → Backups → PITR — Pro-only).
