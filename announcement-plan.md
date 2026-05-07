# Announcement Modal (お知らせポップアップ) Feature Plan

## Context
Japanese matching apps (Pairs, with, Tapple) show dismissible popup modals on app open — campaigns, new features, maintenance notices. We're adding this to Golfmatch with a cover image + text + CTA button design. Admins can create/schedule announcements via Supabase without an app update.

## Files to Create
1. **`src/components/AnnouncementModal.tsx`** — Image + text card modal
2. **`src/hooks/useAnnouncements.ts`** — Fetch active announcements, track dismissals

## Files to Modify
1. **`src/navigation/AppNavigator.tsx`** (line ~766) — Render modal alongside `UpdatePromptModal`

## Database
- New `announcements` table (via Supabase migration)
- New `dismissed_announcements` table (per-user dismissal tracking)

---

## Step 1: Database Migration

```sql
CREATE TABLE announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  body text,
  image_url text,
  cta_text text DEFAULT '詳しく見る',
  cta_url text,                      -- External link (opens browser)
  cta_screen text,                   -- In-app navigation target e.g. 'Store'
  priority int DEFAULT 0,            -- Higher = shown first
  start_at timestamptz NOT NULL DEFAULT now(),
  end_at timestamptz,                -- NULL = no expiry
  target_gender text,                -- NULL=all, 'male', 'female'
  target_premium boolean,            -- NULL=all, true=premium, false=free
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE dismissed_announcements (
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  announcement_id uuid REFERENCES announcements(id) ON DELETE CASCADE,
  dismissed_at timestamptz DEFAULT now(),
  PRIMARY KEY (user_id, announcement_id)
);

-- RLS policies
ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read announcements" ON announcements FOR SELECT USING (true);

ALTER TABLE dismissed_announcements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own dismissals" ON dismissed_announcements FOR SELECT
  USING (user_id IN (SELECT id FROM profiles WHERE user_id = auth.uid()));
CREATE POLICY "Users insert own dismissals" ON dismissed_announcements FOR INSERT
  WITH CHECK (user_id IN (SELECT id FROM profiles WHERE user_id = auth.uid()));
```

Targeting columns let admins show promos to specific audiences (e.g. subscription offer → `target_gender='male'`, `target_premium=false`).

---

## Step 2: `useAnnouncements` Hook

**File**: `src/hooks/useAnnouncements.ts`

```ts
interface Announcement {
  id: string;
  title: string;
  body: string | null;
  image_url: string | null;
  cta_text: string;
  cta_url: string | null;
  cta_screen: string | null;
}

interface UseAnnouncementsReturn {
  announcement: Announcement | null;  // Top-priority undismissed announcement
  dismiss: () => Promise<void>;       // Record dismissal + clear state
}
```

Logic:
1. Enabled only when `!!profileId` (authenticated)
2. On mount + app foreground (via `AppState` listener, with 30-min staleness check):
   - Query `announcements` where `is_active = true`, `start_at <= now()`, `(end_at IS NULL OR end_at > now())`
   - LEFT JOIN `dismissed_announcements` on `user_id = profileId` → filter WHERE dismissed is NULL
   - Filter by `target_gender` (match user's gender or NULL) and `target_premium` (match user's premium status or NULL)
   - ORDER BY `priority DESC`, take first
3. `dismiss()`: insert into `dismissed_announcements`, set `announcement` to null

Dependencies to reuse:
- `useAuth()` for `profileId` — from `src/contexts/AuthContext`
- `useRevenueCat()` for `isProMember` — from `src/contexts/RevenueCatContext`
- `supabase` client — from `src/services/supabase`
- Gender: fetch from profiles (single query, cached)

---

## Step 3: `AnnouncementModal` Component

**File**: `src/components/AnnouncementModal.tsx`

Follow `UpdatePromptModal` (line-by-line pattern match):
- Same overlay (rgba 0,0,0,0.5), same fade+spring animation
- Same card container (white, BorderRadius.xl, max-width 340)

Layout (top to bottom):
1. **Cover image** (if `image_url`): `ExpoImage`, full card width, aspect ratio 16:9, top border radius matches card
2. **Title**: Bold, centered, `Typography.fontSize.xl`
3. **Body** (if present): Secondary text, centered, `Typography.fontSize.base`
4. **CTA button** (if `cta_url` or `cta_screen`): Primary gradient pill (reuse `LinearGradient` pattern)
5. **Dismiss button**: "閉じる" text below

If no `image_url`, skip the image area (text-only card, same as UpdatePromptModal).
If no `cta_url` and no `cta_screen`, show only dismiss button.

```ts
interface AnnouncementModalProps {
  visible: boolean;
  announcement: Announcement;
  onAction: () => void;
  onDismiss: () => void;
}
```

---

## Step 4: AppNavigator Integration

**File**: `src/navigation/AppNavigator.tsx`

In `AppNavigatorContent` (line 315):

```ts
const { announcement, dismiss: dismissAnnouncement } = useAnnouncements({
  enabled: !!user,
});
```

CTA handler:
```ts
const handleAnnouncementAction = () => {
  if (announcement?.cta_screen) {
    navigation.navigate(announcement.cta_screen as any);
  } else if (announcement?.cta_url) {
    Linking.openURL(announcement.cta_url);
  }
  dismissAnnouncement();
};
```

Render after `UpdatePromptModal` (line ~766):
```tsx
{announcement && !showPrompt && (
  <AnnouncementModal
    visible={!!announcement}
    announcement={announcement}
    onAction={handleAnnouncementAction}
    onDismiss={dismissAnnouncement}
  />
)}
```

Note: `!showPrompt` ensures update modal takes priority over announcements.

---

## Edge Cases

| Case | Behavior |
|------|----------|
| Multiple active announcements | Highest `priority` shown first; next shows on next app open |
| Update modal active | Announcement hidden until update modal dismissed |
| No image_url | Text-only layout (title + body + CTA) |
| No cta_url/cta_screen | Only dismiss button shown |
| Announcement expires mid-view | Modal stays; dismissal still recorded |
| User not authenticated | Hook disabled, no fetch |
| target_gender/target_premium NULL | Shown to all users |

---

## Verification

1. Insert test announcement: `INSERT INTO announcements (title, body, image_url, cta_text, cta_screen) VALUES ('新機能リリース！', 'ゴルフコース検索が追加されました', 'https://picsum.photos/600/300', '試してみる', 'CourseSearch');`
2. Open app → verify modal appears with image, title, body, CTA
3. Tap CTA → verify navigation to CourseSearch screen + modal dismissed
4. Reopen app → verify same announcement does NOT reappear
5. Insert targeted announcement: `target_gender='female'` → verify male user does not see it
6. Insert expired announcement: `end_at = now() - interval '1 day'` → verify not shown
7. Test no-image announcement → verify text-only layout
8. Test with update modal active → verify announcement waits until update dismissed
