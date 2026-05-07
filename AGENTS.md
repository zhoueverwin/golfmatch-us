# AGENTS.md

This file provides guidance to Qoder (qoder.com) when working with code in this repository.

## Commands

### Development Server
Due to macOS permission restrictions, always set TMPDIR before running Expo commands:
```bash
export TMPDIR="$HOME/.metro-tmp" && npx expo start --clear
```

### Platform-Specific Running
```bash
# iOS Simulator
export TMPDIR="$HOME/.metro-tmp" && npx expo run:ios

# iOS Device
export TMPDIR="$HOME/.metro-tmp" && npx expo run:ios --device

# Android Emulator
npm run android

# Android Device
npm run test:e2e:device
```

### Testing
```bash
# Unit tests
npm test

# E2E tests (Android emulator)
npm run build:e2e:android && npm run test:e2e:android

# E2E tests (attached device)
npm run test:e2e:device
```

### Type Checking & Linting
```bash
# Type check
npm run typecheck

# Lint (max 0 warnings)
npm run lint
```

## Architecture

### Tech Stack
- **Framework**: React Native (Expo SDK 54)
- **Navigation**: React Navigation (Stack + Bottom Tabs)
- **State Management**: React Context + TanStack Query (React Query v5)
- **Backend**: Supabase (auth, database, real-time)
- **Authentication**: Multi-provider (Phone/OTP, Email/Password, Google OAuth, Apple Sign In)
- **Testing**: Jest + Detox

### Core Architecture

#### Authentication Flow
- **AuthContext** (`src/contexts/AuthContext.tsx`): Manages auth state using `authService`
- **authService** (`src/services/authService.ts`): Handles all auth operations (OTP, OAuth, email/password)
- **userMappingService**: Maps Supabase `auth.users.id` to `profiles.id` with retry logic
- Profile creation is automatic on first login; new users redirected to EditProfile if profile incomplete (<30%)

#### Data Layer
- **Supabase Client** (`src/services/supabase.ts`): Configured client with AsyncStorage persistence
- **Service Layer** (`src/services/supabase/`): Modular services for each domain:
  - `profiles.service.ts`: User profiles
  - `posts.service.ts`: Social posts with reactions
  - `matches.service.ts`: Like/match system
  - `messages.service.ts`: Chat messaging
  - `availability.service.ts`: Calendar availability
  - `contact-inquiries.service.ts`: Support inquiries
- **supabaseDataProvider** (`src/services/supabaseDataProvider.ts`): Unified data provider with caching and retry logic

#### State Management
- **React Query**: Used for server state with 5min staleTime, 30min gcTime
- **Contexts**:
  - `AuthContext`: Authentication state
  - `NotificationContext`: Push notifications
  - `MatchContext`: Match celebrations
  - `ScrollContext`: Tab bar opacity based on scroll

#### Navigation Structure
```
Root Stack Navigator
├── Auth Screen (unauthenticated)
└── Main Tab Navigator (authenticated)
    ├── Home (posts feed)
    ├── Search (user discovery with filters)
    ├── Connections (likes & matches)
    ├── Messages (chat)
    └── MyPage (profile)
```

Modal screens (Profile, Chat, EditProfile, etc.) stack on top of tabs.

### Key Patterns

#### User Identification
- **Never use `auth.users.id` directly in app logic**
- Always use `profiles.id` (obtained via `userMappingService.getProfileIdFromAuth()`)
- The mapping is: `auth.users.id` → `profiles.user_id` → `profiles.id`

#### Data Fetching
- Use TanStack Query hooks from `src/hooks/queries/` directory
- Services return `ServiceResponse<T>` or `PaginatedServiceResponse<T>`
- Caching handled by `CacheService` with LRU eviction

#### Error Handling
- Global ErrorBoundary wraps the app
- Auth errors translated via `authErrorTranslator.ts`
- All async operations wrapped in try/catch with user-friendly messages

#### Profile Completion
Profile has two main sections (basic + golf) tracked for completion percentage. Essential fields for initial setup:
- name, age > 0, gender, prefecture ≠ '未設定'

### Environment Variables
Required in `.env`:
- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`
- `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`

For EAS builds, set via:
```bash
eas secret:create --scope project --name EXPO_PUBLIC_SUPABASE_URL --value "YOUR_URL"
```

### Database Tables (Supabase)
- `profiles`: User profiles (linked to auth.users via user_id)
- `likes`: User likes/super-likes/passes
- `matches`: Mutual matches
- `chat_messages`: Direct messages
- `posts`: Social posts
- `post_likes`: Post reactions (thumbs-up only)
- `notifications`: Push notifications
- `notification_preferences`: User notification settings

## Development Notes

### macOS Permission Issues
If you see `EACCES` errors, the system temp directory is locked by SIP. Always use `TMPDIR="$HOME/.metro-tmp"` before Expo commands.

### Adding New Screens
1. Create screen in `src/screens/`
2. Add route to `RootStackParamList` in `src/types/index.ts`
3. Add screen to Stack Navigator in `src/navigation/AppNavigator.tsx`

### Testing Philosophy
- Unit tests for services and utilities
- Integration tests for screens with mocked providers
- E2E tests for critical flows (auth, posting, matching)
