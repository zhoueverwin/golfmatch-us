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


    eas build --platform ios --local
   eas submit --platform ios --path /path/to/your/build.ipa
/Users/apple/golfmatch/build-1764412403786.ipa