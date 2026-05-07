# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands


# iOS Release (no debug info)
npx expo run:ios --configuration Release --device


### Testing
```bash
# Unit tests
npm test

# Run a single test file
npm test -- path/to/test.ts

```

### Type Checking & Linting
```bash
npm run typecheck   # TypeScript check
npm run lint        # ESLint (max 0 warnings enforced)
```

### Production Builds
```bash
npx expo prebuild --clean          # Regenerate native projects
eas build --platform ios           # Cloud build
eas build --platform ios --local   # Local build (outputs .ipa)
eas submit --platform ios --path /path/to/build.ipa
```

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
├── screens/          # 32 screen components
├── components/       # 31 reusable UI components
├── navigation/       # AppNavigator (Stack + Tabs routing)
├── contexts/         # Auth, Match, Notification, RevenueCat contexts
├── services/         # Business logic & API integration
│   └── supabase/     # Domain-specific services (profiles, posts, matches, messages)
├── hooks/            # Custom hooks
│   └── queries/      # TanStack Query hooks (usePosts, useProfile)
├── types/            # TypeScript definitions (dataModels.ts, auth.ts)
├── constants/        # Design system (colors, typography, spacing)
└── utils/            # Helper functions
```

### Authentication Flow
```
AuthService (multi-method) → Supabase Auth → AuthContext → Protected Navigation
```

### User Identification
**Critical**: Never use `auth.users.id` directly in app logic. Always use `profiles.id`:
- Mapping: `auth.users.id` → `profiles.user_id` → `profiles.id`
- Use `userMappingService.getProfileIdFromAuth()` to get profile ID

### Data Layer
- **Services** (`src/services/supabase/`): ProfilesService, PostsService, MatchesService, MessagesService
- **supabaseDataProvider**: Main data access with retry logic (3 retries, 1-10s exponential backoff)
- **ServiceResponse<T>** / **PaginatedServiceResponse<T>**: Standard return types from services
- **React Query**: 5min staleTime, 30min gcTime, 2 retries with exponential backoff

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

### Database Tables (Supabase)
- `profiles`: User profiles (linked to auth.users via user_id)
- `likes`: User likes/super-likes/passes
- `matches`: Mutual matches
- `chat_messages`: Direct messages
- `posts`: Social posts
- `post_likes`: Post reactions
- `notifications`: Push notifications

## Key Patterns

### Banned User Filtering (Critical)
All `SECURITY DEFINER` RPC functions that return user-facing data **must** filter `is_banned = false` on the `profiles` table. RLS policies do NOT apply inside `SECURITY DEFINER` functions — you must add the filter manually in the SQL.

When creating a new RPC that joins or queries `profiles`:
```sql
-- Always add this to your WHERE clause:
AND p.is_banned = false
```

When banning a user, clean up ALL related data:
1. `chats` (clear `last_message_id` first, then delete)
2. `user_likes` (both `liker_user_id` and `liked_user_id`)
3. `messages` (both `sender_id` and `receiver_id`)
4. `matches` (both `user1_id` and `user2_id`)
5. `profile_views` (both `viewer_id` and `viewed_profile_id`)
6. `notifications` (user_id)
7. `posts` (user_id)
8. `daily_recommendations` (recommended_user_id)

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
