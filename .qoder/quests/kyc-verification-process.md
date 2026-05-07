# KYC Verification Process Design

## Overview

This document defines the design for implementing a KYC identity verification system in the GolfMatch application. Users submit three photos (government ID, selfie, ID with selfie) for manual admin review. Upon approval, users receive a verified badge on their profile.

## Goals
- Reduce fraud and fake profiles through identity verification
- Display verified badge to increase user trust
- Manual review in early stage to establish verification standards

## Requirements

### User Flow
1. User captures three photos: ID document, selfie, ID with selfie
2. Client validates image quality (size, dimensions, brightness, sharpness)
3. Images uploaded to secure storage
4. Admin manually reviews submission
5. User receives approval/rejection notification
6. Approved users get verification badge

### Key Features
- Three-step photo capture with camera or file picker
- Client-side image validation before upload
- Secure storage in private Supabase bucket
- Manual admin review workflow
- Verification status tracking
- Badge display on user profile
- Retry capability for rejected submissions



## Frontend Design

### Navigation Structure

**Location in App:**
- Navigate from マイページ (MyPageScreen) → 設定 (SettingsScreen) → アカウント連携 (LinkAccountScreen)
- Add new tab within LinkAccountScreen: 本人確認認証 (KYC Verification)

**Integration Approach:**
- Add KYC verification as a new section/tab alongside existing authentication methods in LinkAccountScreen
- Alternatively, create a separate KYC screen accessible from SettingsScreen menu
- Maintain consistent UI design with existing screens (same colors, typography, spacing, card layouts)

### KYC Verification Screen/Section

The KYC interface should follow the existing LinkAccountScreen design pattern with:
- SafeAreaView with background color: Colors.background
- ScrollView with padding: 24px
- Section-based layout with cards
- StandardHeader if separate screen, or section title if integrated

**Design Consistency:**
- Use existing color scheme: Colors.primary, Colors.white, Colors.border, Colors.background
- Use existing typography: Typography.getFontFamily(), Typography.fontSize
- Use existing spacing: 12px gaps, 16px padding, 12px border radius
- Use existing card style: white background, 1px border, rounded corners
- Use Ionicons for icons

**Technology Stack:**
- React Native with TypeScript
- expo-image-picker for photo selection
- expo-camera for camera capture
- Supabase client for storage upload
- Consistent with existing screen patterns

**Screen Structure:**

Option B: Integrated Tab in LinkAccountScreen
- Add tab/section in LinkAccountScreen after authentication methods
- Section title: "本人確認認証"
- Same card-based layout as authentication methods

### UI Layout (Matching Existing Design)

**Verification Status Card** (similar to identityItem in LinkAccountScreen):
```
[Card Background: white, border: Colors.border, padding: 16px]
  [Icon] 本人確認認証
  Status Badge: 未確認 / 審査中 / 認証済み
  [Chevron right icon]
```

**Photo Capture Cards** (similar to linkMethod in LinkAccountScreen):
```
[Card Background: white, border: Colors.border, padding: 20px, margin: 16px bottom]
  [Icon + Title] Step 1: 身分証の写し
  [Instructional Text]
  [Image Preview Area - 200x150 rounded rectangle]
  [Button Row]
    - ファイル選択 (outline style)
    - カメラで撮影 (outline style)
    - 削除 (visible only if image exists)
```

Repeat for:
- Step 2: セルフィー
- Step 3: 身分証と自撮り

**Submit Button** (similar to linkButton):
```
[Full-width button, Colors.primary background]
  "本人確認を申請する"
  Disabled until all 3 photos uploaded
```

**Status Display:**
- Use badge style from identityItem (connectedBadge)
- Colors:
  - 未確認: Colors.gray[400]
  - 審査中: Colors.warning (or Colors.primary)
  - 認証済み: Colors.success
  - 再提出必要: Colors.error

### Photo Capture Instructions (Japanese)

**Step 1: 身分証の写し**
- 受付可能書類: 運転免許ト、マイナンバーカード、在留カード
- 撮影時の注意:
  - 書類全体が写るように撮影してください
  - 明るい自然光の下で撮影してください
  - ぼやけないように注意してください
  - 加工・編集はしないでください

**Step 2: セルフィー**
- 撮影時の注意:
  - カメラに正面を向いてください
  - 明るい場所で撮影してください
  - サングラスや帽子は外してください
  - フィルターは使用しないでください

**Step 3: 身分証と自撮り**
- 撮影時の注意:
  - 身分証を顔の横に持ってください
  - 顔と身分証の両方が鮮明に写るようにしてください
  - カメラに正面を向いてください
  - 身分証の文字が読めるようにしてください

### Client-Side Image Validation

Validate each image before upload:

| Validation | Rule | Error Message (Japanese) |
|---|---|---|
| File Type | JPEG/PNG/WebP | "JPEG/PNG/WebP の画像をアップロードしてください。" |
| File Size | Max 10MB | "ファイルサイズは10MB以下にしてください。" |
| Dimensions | Min 400x300px | "画像の解像度が低すぎます。より鮮明な写真を使用してください。" |
| Brightness | Avg luminance > 40 | "写真が暗すぎます。明るい自然光の下で再撮影してください。" |
| Sharpness | Variance score > 10 | "画像がぼやけています。手ぶれがない鮮明な写真をアップロードしてください。" |

**Validation Timing:**
- Run validation immediately after image selection/capture
- Display error using Alert.alert() (consistent with LinkAccountScreen pattern)
- Only allow upload if all validations pass

## Backend Design

### Manual Admin Review Process

**Workflow:**
1. User submits all three images → Create record in `kyc_submissions` table
2. Set status to `pending_review`
3. Admin views submission in review dashboard
4. Admin checks:
   - ID photo: Document visible, text readable, appears genuine, not expired
   - Selfie: Face clear, well-lit, no filters, real person
   - Combined photo: Face + ID both visible, matches other photos
   - Face matching: Same person across all three photos
5. Admin decision: Approve, Request Retry, or Reject
6. Update database: `is_verified` = true (if approved), set `kyc_status`
7. Send notification to user

**Verification Outcomes:**

| Status | Action |
|---|---|
| Approved | Set is_verified = true, display badge |
| Retry Required | User resubmits with better images |
| Rejected | User contacts support or submits different ID |
| Pending Review | User waits for admin (24-48 hours) |

### Verification Badge

Once approved:
- Display badge icon on user profile (visible to all users)
- Badge text: "本人確認済み" (Verified)
- Badge cannot be removed by user

## Data Model

### Database Tables

**New Table: kyc_submissions**

| Column | Type | Description |
|---|---|---|
| id | uuid | Primary key |
| user_id | uuid | Foreign key to profiles.id |
| id_image_url | text | Supabase storage URL for ID photo |
| selfie_image_url | text | Supabase storage URL for selfie |
| id_selfie_image_url | text | Supabase storage URL for combined photo |
| status | text | 'pending_review', 'approved', 'retry', 'rejected' |
| submission_date | timestamptz | When user submitted |
| verification_date | timestamptz | When admin reviewed |
| rejection_reason | text | Reason if rejected/retry |
| retry_count | integer | Number of retry attempts |
| reviewed_by_admin_id | uuid | Admin who reviewed |
| review_notes | text | Admin's internal notes |
| created_at | timestamptz | Auto-generated |
| updated_at | timestamptz | Auto-updated |

**Update Existing Table: profiles**

Add columns:
- `kyc_status` (text): 'not_started', 'pending_review', 'approved', 'retry', 'rejected'
- `kyc_submitted_at` (timestamptz)
- `kyc_verified_at` (timestamptz)
- `is_verified` (boolean) - already exists, set to true when approved

### Supabase Storage

**Bucket:** `kyc-verification` (private, no public access)

**Structure:**
```
kyc-verification/
  {user_id}/
    {submission_id}/
      id_photo.jpg
      selfie.jpg
      id_selfie.jpg
```

## UI Components

### KYC Verification Screen Layout

**Progress Indicator:**
- Step 1: 身分証の写し (ID Photo)
- Step 2: セルフィー (Selfie)
- Step 3: 身分証と自撮り (ID with Selfie)

**File Capture Card (for each step):**
- Instructional text
- Image preview area
- Buttons: "ファイル選択" (Choose File), "カメラで撮影" (Use Camera), "削除" (Delete)

**Message Notifications:**
- Display validation errors or success messages
- Auto-dismiss after 5 seconds

**Submit Button:**
- Enabled only when all 3 photos uploaded
- Shows loading state during submission

## Error Handling

### Client-Side Errors

| Error | Message (Japanese) | Action |
|---|---|---|
| Invalid file type | "JPEG/PNG/WebP の画像をアップロードしてください。" | Select different file |
| File too large | "ファイルサイズは10MB以下にしてください。" | Compress or select smaller file |
| Low resolution | "画像の解像度が低すぎます。より鮮明な写真を使用してください。" | Retake photo |
| Too dark | "写真が暗すぎます。明るい自然光の下で再撮影してください。" | Retake in better lighting |
| Blurry | "画像がぼやけています。手ぶれがない鮮明な写真をアップロードしてください。" | Retake with steady hand |
| Camera denied | "カメラへのアクセスが拒否されました。設定を確認してください。" | Guide to settings |
| Upload failed | "アップロードに失敗しました。ネットワークを確認してください。" | Retry button |

### Admin Review Decisions

| Decision | Reason | User Impact |
|---|---|---|
| Approved | All checks pass | Badge displayed |
| Retry | Poor image quality, unreadable text | User resubmits |
| Rejected | Face mismatch, expired ID, fraud | Contact support |

## Security & Privacy

**Data Protection:**
- All uploads via HTTPS
- Images stored in private Supabase bucket (no public access)
- Only authenticated users can upload their own KYC images
- Only authorized admins can view submissions

**Privacy:**
- Collect only necessary images
- Delete images after retention period (1 year approved, 90 days rejected)
- Comply with Japan's APPI and GDPR
- Users can request data deletion


## Notifications

| Event | Channel | Message |
|---|---|---|
| Submission received | In-app | "本人確認の申請を受け付けました。結果は24-48時間以内にお知らせします。" |
| Approved | Push + In-app | "本人確認が完了しました。プロフィールにバッジが表示されます。" |
| Retry required | Push + In-app | "本人確認の再提出が必要です。より鮮明な写真をアップロードしてください。" |
| Rejected | Push + In-app | "本人確認を完了できませんでした。詳細はサポートにお問い合わせください。" |

## Testing

**Frontend Tests:**
- Image validation logic (type, size, dimensions, brightness, sharpness)
- Upload flow with retry on failure
- Multi-step navigation
- Camera permission handling
- Badge display on profile

**Backend Tests:**
- Submission creation
- Admin review workflow
- Database updates after decision
- Notification triggers

**Key Test Cases:**
- Happy path: Submit → Review → Approve → Badge shown
- Validation errors: Blurry image rejected by client
- Retry flow: Admin requests retry → User resubmits
- Network failure: Upload fails → Retry succeeds

## Implementation Notes

**Supabase Setup:**
- Create storage bucket: `kyc-verification` (private)
- Create table: `kyc_submissions`
- Add columns to `profiles` table
- Set up Row Level Security (RLS) policies

**Frontend Implementation:**
- Create screen: `src/screens/KycVerificationScreen.tsx`
- Image validation utility: `src/utils/imageValidator.ts`
- Use expo-image-picker and expo-camera
- Upload to Supabase Storage using existing `storageService.ts`

