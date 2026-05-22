# Development Guide
Appleの「4.3 Spam」リジェクト対策として重要なのは、他の類似アプリとの差別化・独自機能、飽和カテゴリでの差別化、そしてテンプレート的なUIや機能を避けることです。​

主な4.3 Spamリジェクト対策
オリジナル機能追加

類似したマッチング機能だけでなく、独自の出会い体験や新規性のある機能（たとえばAIマッチング・特定コミュニティ向け独自マッチングなど）を強調し、サービスの独自価値をアプリ説明にも反映する。​

UI・デザイン差別化

添付画像・Figmaデザインやアイコン、細かい機能UIまで、業界の定番とは違うキー要素を明示的に加える。ありふれたテンプレートや市販キットをそのまま使うと危険です。​

アプリのコンセプトを明確に

複数アプリでバンドルIDだけ違う場合は「全バリエーションを一つのアプリ内で提供（例：地域・属性切り替えはアプリ内課金や設定で）」という設計が推奨されています。​

ミッション・パッションを強調

審査対応メールで他アプリとの差・開発者の思い・社会的価値を説明することで許可されるケースも報告されています。​

NGパターン（リジェクトされる例）
単なるテンプレート流用

内容が違うだけで機能・UIがほぼ同じ

分社化して同一コンセプトのアプリを複数提出

飽和ジャンル（マッチング、占い等）で差別化ポイントが弱い

具体的な対策事例
新しいマッチング形式や検索方法の開発

デザイン・ブランドイメージの見直し

あくまで「既存サービスにない独自性」をストア説明文・メタデータに記載

審査で指摘されたら、上記差別化策をしっかりアピール・説明

根本的には「ユニークで高品質な体験を提供」と「ありふれたアプリの量産はNG」がAppleの基本方針です。​


## Running the Development Server

### ⚠️ Important: Development Build Required

This app uses custom native modules (camera, image picker, notifications, etc.) that **cannot run in Expo Go**. You must build and install a development build on your device or simulator.

### First Time Setup: Build Development Build

#### For iOS Simulator

1. **Ensure you have Xcode installed** (required for iOS development)

2. **Build and install the development build on simulator:**
   ```bash
   cd /Users/apple/golfmatch
   export TMPDIR="$HOME/.metro-tmp"
   npx expo run:ios
   ```

   This will:
   - Generate the native iOS project (if needed)
   - Build the app
   - Install it on the iOS Simulator
   - Start the Metro bundler

3. **The first build may take 5-10 minutes**. Subsequent builds will be faster.

#### For Physical iOS Device

1. **Connect your iPhone/iPad via USB**

2. **Build and install on device:**
   ```bash
   cd /Users/apple/golfmatch
   export TMPDIR="$HOME/.metro-tmp"
   npx expo run:ios --device
   ```

3. **Trust the developer certificate** on your device:
   - Go to Settings → General → VPN & Device Management
   - Trust the developer certificate

### Running After Initial Build

Once you have the development build installed, you can start the Metro bundler:

```bash
cd /Users/apple/golfmatch
export TMPDIR="$HOME/.metro-tmp"
npx expo start --dev-client
```

The `--dev-client` flag tells Expo to connect to your development build instead of Expo Go.

### Quick Commands

**iOS Simulator:**
```bash
cd /Users/apple/golfmatch && export TMPDIR="$HOME/.metro-tmp" && npx expo run:ios
```

**iOS Device:**
```bash
cd /Users/apple/golfmatch && export TMPDIR="$HOME/.metro-tmp" && npx expo run:ios --device
```

**Start Metro Bundler (after build is installed):**
```bash
cd /Users/apple/golfmatch && export TMPDIR="$HOME/.metro-tmp" && npx expo start --dev-client
```

## Permission Issues

### Why do we need custom TMPDIR?

After macOS reboots or system updates, the system's temporary directory (`/var/folders/`) may have restricted permissions due to System Integrity Protection (SIP). This causes `EACCES: permission denied` errors when Metro bundler and Expo CLI try to write cache files.

### Solution

The `metro.config.js` file has been configured to automatically set `TMPDIR` to `~/.metro-tmp` for Metro bundler. However, when running Expo CLI commands directly (like `expo run:ios`), you need to manually set the environment variable before running the command.

### Creating the temp directory

The temp directory is automatically created, but if you need to create it manually:

```bash
mkdir -p ~/.metro-tmp
```

## Git Workflow

### Check Status

```bash
git status
```

### Stage Changes

```bash
git add <file>
```

Or stage all changes:

```bash
git add .
```

### Commit Changes

```bash
git commit -m "Your commit message"
```

### View Recent Commits

```bash
git log --oneline -n 5
```

## Common Issues

### "No development build installed" Error

**Error:** `CommandError: No development build (com.zhoueverwin.golfmatchapp) for this project is installed.`

**Solution:** Build a development build first:
```bash
export TMPDIR="$HOME/.metro-tmp" && npx expo run:ios
```

This error occurs when trying to use Expo Go or when the development build hasn't been installed yet.

### Metro Cache Errors

If you see cache-related errors, clear the cache:

```bash
export TMPDIR="$HOME/.metro-tmp" && npx expo start --clear
```

### Development Build Not Updating

If you make changes to native code or add new native modules, rebuild the development build:

```bash
export TMPDIR="$HOME/.metro-tmp" && npx expo run:ios
```

For JavaScript/TypeScript changes only, just restart Metro:
```bash
export TMPDIR="$HOME/.metro-tmp" && npx expo start --dev-client
```

### Folly Header Not Found Error

**Error:** `'folly/coro/Coroutine.h' file not found` or similar Folly-related errors

**Solution:** Clean and reinstall CocoaPods dependencies:

```bash
cd /Users/apple/golfmatch

# Clean iOS build artifacts
rm -rf ios/Pods
rm -rf ios/build
rm -rf ios/Podfile.lock

# Clean CocoaPods cache
pod cache clean --all

# Clean Xcode derived data (optional but recommended)
rm -rf ~/Library/Developer/Xcode/DerivedData

# Reinstall pods
cd ios
pod install --repo-update
cd ..

# Rebuild
export TMPDIR="$HOME/.metro-tmp"
npx expo run:ios
```

**Alternative:** If the above doesn't work, try a complete clean rebuild:

```bash
cd /Users/apple/golfmatch

# Remove iOS folder completely (it will be regenerated)
rm -rf ios

# Clean everything
rm -rf node_modules
rm -rf .expo

# Reinstall dependencies
npm install

# Regenerate iOS project and build
export TMPDIR="$HOME/.metro-tmp"
npx expo prebuild --clean
npx expo run:ios
```

### CocoaPods Issues

If you encounter general CocoaPods errors:

```bash
cd ios
pod install --repo-update
cd ..
```

If that doesn't work, try:
```bash
cd ios
rm -rf Pods Podfile.lock
pod cache clean --all
pod install --repo-update
cd ..
```

### Node Modules Issues

If you have dependency issues, try reinstalling:

```bash
rm -rf node_modules
npm install
```

## Environment Variables

The project uses environment variables stored in `.env` file:

- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`
- `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`

These are automatically loaded when running Expo commands.

## ⚠️ Expo Go Not Supported

This app **cannot run in Expo Go** because it uses custom native modules. You must use a development build as described above.

If you see the error:
```
No development build (com.zhoueverwin.golfmatchapp) for this project is installed.
```

**Solution:** Build a development build first using:
```bash
export TMPDIR="$HOME/.metro-tmp" && npx expo run:ios
```

## Building for Production

### iOS Build

First, do:
```bash
npx expo prebuild --clean 
```
This command will create a new Xcode project in the `ios` directory. Then, you can build the app using:
```bash
export TMPDIR="$HOME/.metro-tmp"
eas build --platform ios
```

### Android Build

```bash
export TMPDIR="$HOME/.metro-tmp"
eas build --platform android
```

## Useful Commands

### Kill Expo Process

If Expo is stuck or you need to restart:

```bash
pkill -f "expo start"
```

### Check Running Processes

```bash
ps aux | grep expo
```

### Clear All Caches

```bash
rm -rf ~/.metro-tmp
rm -rf ~/.metro-cache
export TMPDIR="$HOME/.metro-tmp" && npx expo start --clear
```

## Beta-Tester Allowlist & App Store Reviewer Prep

This section is the operational runbook for two related comp-account flows:
the **beta-tester allowlist** (free access for invited friends/influencers) and
the **App Store reviewer demo account** (KYC-bypassed but paywall-visible for
Apple's reviewer). Read the trade-off table before deciding which to use.

### When to use which

| Cohort | Path | Why |
|---|---|---|
| 5–20 close friends / investors | `beta_testers` allowlist | Zero friction; they install the App Store app and just sign in |
| 50+ external testers / wider beta | TestFlight beta build | Apple expects TestFlight to differ from production |
| Influencers / B2B partners | `beta_testers` allowlist | They get the real polished app, not a beta sticker |
| **Apple's reviewer** | **`setup_review_account` helper — never the allowlist** | Reviewer must see the paywall; allowlist would hide IAP → 3.2(f) risk |

### Adding a beta tester (free for life, bypasses KYC + paywall)

Run via Supabase MCP / `db-push-develop.sh` against the dev project, then later
production. Trigger fires on profile INSERT — the tester just signs up via the
app afterwards and gets auto-promoted.

```sql
INSERT INTO public.beta_testers (email, note) VALUES
  ('friend1@gmail.com',   'High school golf buddy'),
  ('influencer@example.com', 'IG golfer with 50k followers')
ON CONFLICT (email) DO UPDATE SET note = EXCLUDED.note;
```

Email must be lowercase (table CHECK enforces it). For a **female** tester,
override gender after they sign up:

```sql
UPDATE profiles SET gender = 'female'
  WHERE id IN (
    SELECT p.id FROM profiles p
      JOIN auth.users u ON u.id::text = p.user_id
     WHERE lower(u.email) = 'jane@example.com'
  );
```

### Revoking a tester

```sql
DELETE FROM beta_testers WHERE email = 'foo@x.com';
-- Also clear their granted status (the allowlist trigger only fires on INSERT):
UPDATE profiles SET is_premium = false,
                    premium_source = null,
                    premium_granted_at = null
  WHERE id IN (
    SELECT p.id FROM profiles p
      JOIN auth.users u ON u.id::text = p.user_id
     WHERE lower(u.email) = 'foo@x.com'
  );
```

> **Note**: `premium_source = 'manual'` is write-locked from the app for
> authenticated/anon roles (migration 25). Only service-role SQL (via MCP or
> edge functions) and the `apply_beta_tester_grants` trigger can set it. So
> revoking from the allowlist requires the SQL above — there's no "self-serve"
> downgrade path in the app.

### Pre-submission prep for Apple App Store

Apple's reviewer can't pass real Didit KYC (no government ID to upload), so
they need a pre-approved demo account. The `setup_review_account` helper does
this in one call without granting premium — the reviewer still has to walk
through the paywall and complete a StoreKit Sandbox purchase to verify IAP.

**Workflow before each App Store submission**:

1. **Sign up a fresh demo account through the app**. Pick an unmistakable
   email like `applereview@golfmatch.info`. Walk through Name → State →
   Photo and stop at the KYC screen (don't close the app).

2. **Run the helper via Supabase MCP** to bypass KYC while keeping the paywall:

   ```sql
   SELECT * FROM public.setup_review_account('applereview@golfmatch.info');
   ```

   The returned `ready_for_review` column should be `true` and `notes` should
   say "Ready." If it warns the account is premium, run the SQL it suggests
   to clear premium.

3. **Test the demo account in the simulator**: sign in → should land on
   the paywall (NOT Discover). Tap "Unlock Premium" → Apple StoreKit
   prompt appears.

4. **In App Store Connect** → App Information → App Review Information:
   - **Sign-in required**: Yes
   - **Username**: `applereview@golfmatch.info`
   - **Password**: (whatever you set)
   - **Demo Account Notes**: copy this verbatim →
     > KYC pre-approved for review (reviewer cannot upload real government
     > ID). Paywall + Apple StoreKit IAP remain active — please test with a
     > sandbox Apple ID. Discover/Swipe and Messaging require premium,
     > accessible via the paywall.

5. **Bump buildNumber + EAS build**:

   ```bash
   eas build --platform ios --auto-submit
   ```

### What's allowed vs blocked at the database level

Migrations 20, 25, 26 layer three independent enforcement gates so the app
is provably compliant with Apple Developer Program License Agreement
**Section 3.2(f)** (no hidden IAP bypass):

- `premium_source = 'revenuecat'` — ✅ allowed from the app (RC sync fallback)
- `premium_source = NULL` — ✅ allowed from the app (downgrade path)
- `premium_source = 'manual'` or `'permanent'` — ❌ **rejected** by trigger
  when called from `authenticated`/`anon` roles. Only service-role SQL +
  the `apply_beta_tester_grants` trigger can set them.
- `setup_review_account()` function — only `service_role` can execute;
  calling as `authenticated` returns `permission denied for function`.

### Safety habits

1. **Real personal emails only** in `beta_testers`. Apple's audits sometimes
   flag throwaway/temp-mail addresses as evidence of bypass abuse.
2. **Never expose the allowlist in the app UI**. No "enter promo code" button,
   no marketing link that hints at the bypass. The mechanism must be
   server-side and opaque from the client.
3. **Never add Apple's reviewer email to `beta_testers`**. They must see the
   paywall. Use `setup_review_account()` instead — that's the explicit,
   Apple-transparent path.
4. **Keep the allowlist modest** (target <50 emails). If you need broader
   testing, ship a TestFlight build with gate flags instead.

save the money!!!
test on expo for fast checking: npx expo start --clear -c
test on phone: npx expo run:ios --configuration Release --device (no debug information)
npx expo run:ios --device (with debug information)
 when the test are done ,then deploy to testflight

   we should run the following to creat a clean buid after the app has been approved. 
    npx expo prebuild --clean

    during the dev process, we can just keep doing this
    eas build --platform ios --local
   eas submit --platform ios --path /path/to/your/build.ipa


this is the dashboard view
file:///Users/apple/golfmatch/admin-dashboard.html?key=gm-admin-2026-s3cure-k3y

this is the kyc review link
file:///Users/apple/golfmatch/kyc-review.html?key=gm-admin-2026-s3cure-k3y