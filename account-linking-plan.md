# アカウント連携機能（メールアドレス連携）実装プラン

## 概要

既存アカウント（Apple ID / Google / LINE でログイン済み）にメールアドレスを連携し、メールアドレス+パスワードでもログインできるようにする機能。

ユーザーからのお問い合わせ（ユウ様：Apple IDログインユーザー）を受けて実装。

---

## 認証方法の整理

### サインイン方法（現在アプリで提供中）
| 方法 | 実装状況 |
|------|----------|
| メールアドレス + パスワード | ✅ |
| Google | ✅ |
| Apple | ✅ |
| LINE | ✅ |

※ 電話番号サインアップ/サインインは**なし**

### アカウント連携メソッド（authService）
| メソッド | 実装状況 |
|----------|----------|
| `linkEmail(email, password)` | ✅ 実装済み |
| `linkGoogle()` | ✅ 実装済み |
| `linkApple()` | ✅ 実装済み |
| `linkLine()` | ❌ **未実装（必要に応じて追加）** |
| `getUserIdentities()` | ✅ 実装済み |
| AuthContext への接続 | ✅ 済み（`useAuth()` から呼べる） |
| 型定義（`IdentityLinkResult`, `IdentityProvider`） | ✅ 済み |
| **UI画面** | ❌ **未実装（これを作る）** |

---

## 実装内容

### 1. 新規ファイル: `src/screens/AccountLinkingScreen.tsx`（〜200行）

メインの画面。以下のセクションで構成：

#### A. 連携状況の表示
- `getUserIdentities()` で現在の連携プロバイダーを取得
- プロバイダーごと（Email / Google / Apple / LINE）の連携状態をアイコン付きで表示
- 連携済み → チェックマーク（✓）+ プロバイダー情報表示
- 未連携 → 「連携する」ボタン表示

#### B. メールアドレス連携フォーム（メイン機能）
- メールアドレス入力（`TextInput`）
- パスワード入力（`TextInput`, secureTextEntry）
- パスワード確認入力（一致バリデーション）
- 「連携する」ボタン → `linkEmail(email, password)` 呼び出し
- 成功時：`Alert.alert("完了", "メールアドレスの連携が完了しました")`
- エラー時：`Alert.alert("エラー", result.error)`

#### C. その他プロバイダー連携（将来拡張）
- Google連携ボタン → `linkGoogle()` （実装済み）
- Apple連携ボタン → `linkApple()` （実装済み）
- LINE連携ボタン → `linkLine()` （要実装 or 後日対応）

#### D. バリデーション
- メール形式チェック: `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`
- パスワード最低8文字
- パスワード一致確認

#### UI参考パターン
- `DeleteAccountScreen.tsx` のレイアウト構成を踏襲
- `StandardHeader` でヘッダー表示
- `SafeAreaView` + `ScrollView` + `KeyboardAvoidingView`
- `Button` コンポーネントで操作ボタン

---

### 2. 修正ファイル: `src/types/index.ts`（+1行）

`RootStackParamList` にルート追加：

```typescript
AccountLinking: undefined;
```

---

### 3. 修正ファイル: `src/navigation/AppNavigator.tsx`（+5行）

Stack Navigator にスクリーン登録：

```tsx
import AccountLinkingScreen from "../screens/AccountLinkingScreen";

<Stack.Screen
  name="AccountLinking"
  component={AccountLinkingScreen}
  options={{ headerShown: false }}
/>
```

---

### 4. 修正ファイル: `src/screens/SettingsScreen.tsx`（+7行）

設定メニューに「アカウント連携」項目を追加（KYC認証の下に配置）：

```typescript
{
  id: "accountLinking",
  title: "アカウント連携",
  subtitle: "メールアドレス・SNSの連携管理",
  icon: "link",
  onPress: () => navigation.navigate("AccountLinking"),
},
```

---

## 画面イメージ

```
┌─────────────────────────────┐
│  ← アカウント連携            │  ← StandardHeader
├─────────────────────────────┤
│                             │
│  現在の連携状況              │
│  ┌─────────────────────┐   │
│  │ 🍎 Apple ID    連携済み │   │
│  │ 📧 メール      未連携   │   │
│  │ G  Google     未連携   │   │
│  │ 🟢 LINE       未連携   │   │
│  └─────────────────────┘   │
│                             │
│  メールアドレスを連携        │
│  ┌─────────────────────┐   │
│  │ メールアドレス        │   │
│  └─────────────────────┘   │
│  ┌─────────────────────┐   │
│  │ パスワード            │   │
│  └─────────────────────┘   │
│  ┌─────────────────────┐   │
│  │ パスワード（確認）     │   │
│  └─────────────────────┘   │
│                             │
│  ┌─────────────────────┐   │
│  │     連携する          │   │  ← Primary Button
│  └─────────────────────┘   │
│                             │
│  ※連携後、メールアドレスと   │
│   パスワードでもログイン     │
│   できるようになります       │
│                             │
└─────────────────────────────┘
```

---

## 修正ファイル一覧

| ファイル | 変更内容 | 行数 |
|----------|----------|------|
| `src/screens/AccountLinkingScreen.tsx` | **新規作成** | 〜200行 |
| `src/types/index.ts` | ルート型追加 | +1行 |
| `src/navigation/AppNavigator.tsx` | スクリーン登録 | +5行 |
| `src/screens/SettingsScreen.tsx` | メニュー項目追加 | +7行 |

---

## 注意事項

1. **Supabase のメール確認**: `supabase.auth.updateUser({ email })` 呼び出し後、Supabase が自動的に確認メールを送信する場合がある（プロジェクト設定による）。UIでその旨をユーザーに案内する必要あり。

2. **重複メール**: 既に他のアカウントで使用されているメールアドレスの場合、Supabase がエラーを返す。`translateAuthError()` で日本語化済み。

3. **LINE連携**: `signInWithLine()` は実装済みだが `linkLine()` メソッドは未実装。今回のスコープではメール連携を優先し、LINE連携は後日対応とする。

4. **電話番号**: アプリにサインイン方法として電話番号は存在しないため、連携対象外。

---

## 工数見積もり

- AccountLinkingScreen 作成: 2〜3時間
- ルート・ナビゲーション修正: 15分
- SettingsScreen メニュー追加: 10分
- テスト・動作確認: 1時間
- **合計: 約半日**
