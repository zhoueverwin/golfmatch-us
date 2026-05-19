# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Development
```bash
export TMPDIR="$HOME/.metro-tmp" && npx expo start --clear   # Metro (TMPDIR avoids SIP EACCES)
export TMPDIR="$HOME/.metro-tmp" && npx expo run:ios         # iOS Simulator (debug)
npx expo run:ios --configuration Release --device            # iOS device (no debug overlay)
```
This app **cannot run in Expo Go** — it has custom native modules. Always use a dev build.

### Testing
```bash
npm test                        # Jest unit tests
npm test -- path/to/test.ts     # Single test file
npm run build:e2e:android       # Detox: build for Android emulator
npm run test:e2e:android        # Detox: run E2E on Android emulator
npm run test:e2e:device         # Detox: run E2E on attached Android device
```

### Type Checking & Linting
```bash
npm run typecheck   # TypeScript check
npm run lint        # ESLint (max 0 warnings enforced)
```

### Production Builds
```bash
npx expo prebuild --clean                          # Regenerate native projects (run after native config changes)
eas build --platform ios                           # Cloud build
eas build --platform ios --local                   # Local build (outputs .ipa)
eas submit --platform ios --path /path/to/build.ipa
```

### Supabase
- Migrations: `supabase/migrations/` — push to the dev project via `scripts/db-push-develop.sh`.
- Edge functions: `supabase/functions/` — see Edge Functions section below.
- `eas.json` carries env vars for cloud builds; **keep it in sync with `.env`** after rotating any Supabase creds (stale `eas.json` has caused TestFlight white-screens).

## Architecture

### Tech Stack
- **Framework**: React Native with Expo SDK 54, TypeScript
- **Navigation**: React Navigation 7 (Stack + Bottom Tabs)
- **State Management**: React Context + TanStack Query v5
- **Backend**: Supabase (PostgreSQL, Auth, Realtime, Edge Functions)
- **Authentication**: Phone/OTP, Email/Password, Google OAuth, Apple Sign-In
- **Subscriptions**: RevenueCat for in-app purchases
- **Testing**: Jest + Detox E2E

### Directory Structure
```
src/
├── screens/
│   ├── onboarding/   # New-user funnel (name → birthdate → gender → state → photo → KYC → paywall)
│   └── admin/        # MonitoringDashboard (in-app admin view)
├── components/       # Reusable UI components
├── navigation/       # AppNavigator (Stack + Tabs routing)
├── contexts/         # Auth, Match, Notification, RevenueCat
├── services/
│   └── supabase/     # Domain services (profiles, posts, matches, messages, blocks, reports, ...)
├── hooks/
│   └── queries/      # TanStack Query hooks
├── types/, constants/, utils/
supabase/
├── migrations/       # SQL migrations (baseline + incremental)
└── functions/        # Edge functions (Deno): create-didit-session, didit-webhook, revenuecat-webhook
```
Out-of-app admin tooling lives at the repo root as static HTML files: `admin-tools.html`, `admin-dashboard.html`, `kyc-review.html` — opened locally with `?key=...` and talking directly to Supabase.

### Authentication Flow
```
AuthService (multi-method) → Supabase Auth → AuthContext → Protected Navigation
```

### User Identification
**Critical**: Never use `auth.users.id` directly in app logic. Always use `profiles.id`:
- Mapping: `auth.users.id` → `profiles.user_id` → `profiles.id`
- Use `userMappingService.getProfileIdFromAuth()` to get profile ID

### Data Layer
- **Domain services** (`src/services/supabase/`): profiles, posts, matches, messages, availability, blocks, reports, post-reactions, contact-inquiries.
- **supabaseDataProvider** (`src/services/supabaseDataProvider.ts`): main data access with retry logic (3 retries, 1-10s exponential backoff).
- **dataProviderSwitcher** (`src/services/dataProviderSwitcher.ts`): thin indirection that lets the app swap data providers (e.g. mock vs live) — call sites go through this, not the raw provider.
- **ServiceResponse<T>** / **PaginatedServiceResponse<T>**: standard return types from services.
- **React Query**: 5 min staleTime, 30 min gcTime, 2 retries with exponential backoff.

### KYC (Didit)
KYC is anti-bypass and gates onboarding. Two Edge Functions back it:
- `create-didit-session` — issues a verification session for the client.
- `didit-webhook` — receives the verdict and updates `profiles.kyc_status` / `is_verified` / `gender`.

Never patch `kyc_status`, `is_verified`, or `gender` directly via SQL to unblock testing — go through the real Didit flow or the manual-review escape hatch in `KycVerificationScreen`. Client-side state is in `kycService.ts`.

### Subscriptions (RevenueCat)
- `RevenueCatContext` exposes entitlement state to the tree.
- `revenueCatService.ts` wraps the SDK.
- `revenuecat-webhook` edge function syncs server-side subscription state.

### Navigation Structure
```
Root Stack Navigator
├── Auth Screen (unauthenticated)
└── Main Tab Navigator (authenticated)
    ├── Home (posts feed)
    ├── Search (user discovery)
    ├── Connections (likes & matches)
    ├── Messages (chat)
    └── MyPage (profile)
```
Modal screens (Profile, Chat, EditProfile) stack on top of tabs.

### Database Schema
Authoritative source: `supabase/migrations/00000000000000_baseline_schema.sql` + later migrations. Core tables include `profiles`, `user_likes`, `matches`, `messages`, `chats`, `posts`, `post_reactions`, `profile_views`, `notifications`, `notification_preferences`, `daily_recommendations`. Check current state with `mcp__supabase__list_tables` rather than relying on a list here.

**JP-fork residue**: the schema was forked from a Japan-only app. Some `CHECK` constraints still contain Japanese string literals and date math may assume `Asia/Tokyo`. Grep migrations for `Asia/Tokyo` and Japanese characters before adding gender/prefecture/timezone fields.

**FK invariant**: any new FK pointing at `profiles.id` must use `ON DELETE CASCADE`. A non-CASCADE FK on `moderation_log` previously broke `delete_user_account`.

## Key Patterns

### Banned User Filtering (Critical)
All `SECURITY DEFINER` RPC functions that return user-facing data **must** filter `is_banned = false` on the `profiles` table. RLS policies do NOT apply inside `SECURITY DEFINER` functions — you must add the filter manually in the SQL.

When creating a new RPC that joins or queries `profiles`:
```sql
-- Always add this to your WHERE clause:
AND p.is_banned = false
```

When banning or deleting a user, clean up ALL related data in order:
1. `chats` — clear `last_message_id` first, then delete the row (the FK back to `messages` blocks otherwise)
2. `user_likes` — both `liker_user_id` and `liked_user_id`
3. `messages` — both `sender_id` and `receiver_id`
4. `matches` — both `user1_id` and `user2_id`
5. `profile_views` — both `viewer_id` and `viewed_profile_id`
6. `notifications` (user_id)
7. `posts` (user_id)
8. `daily_recommendations` (recommended_user_id)

New `profiles.id` FKs should use `ON DELETE CASCADE` so this cleanup is automatic (see FK invariant above).

### Error Handling
- Global ErrorBoundary wraps the app
- Auth errors translated via `authErrorTranslator.ts`
- Sentry integration for production error tracking

### Performance
- FlashList for optimized list rendering (instead of FlatList)
- Video/image compression before upload
- Cache service with TTL for API responses

### Styling
Use constants from `src/constants/` instead of magic values:
- `Colors`: Primary colors, status colors, gradients
- `Typography`: Font sizes, weights, line heights
- `Spacing`: Margins, padding, border radius

### Adding New Screens
1. Create screen in `src/screens/`
2. Add route to `RootStackParamList` in `src/types/index.ts`
3. Add screen to Stack Navigator in `src/navigation/AppNavigator.tsx`

## Environment Variables

Required in `.env`:
```
EXPO_PUBLIC_SUPABASE_URL
EXPO_PUBLIC_SUPABASE_ANON_KEY
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID
```

For EAS builds: `eas secret:create --scope project --name VAR_NAME --value "value"`

## Common Issues

### "No development build installed"
This app cannot run in Expo Go. Build a development build first:
```bash
export TMPDIR="$HOME/.metro-tmp" && npx expo run:ios
```

### EACCES Permission Errors
System temp directory locked by SIP after reboot. Always prefix commands with:
```bash
export TMPDIR="$HOME/.metro-tmp"
```

### CocoaPods / Folly Errors
```bash
cd ios && rm -rf Pods Podfile.lock && pod cache clean --all && pod install --repo-update && cd ..
```

### Complete Clean Rebuild
```bash
rm -rf ios node_modules .expo
npm install
export TMPDIR="$HOME/.metro-tmp" && npx expo prebuild --clean && npx expo run:ios
```
