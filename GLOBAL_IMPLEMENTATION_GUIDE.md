# GolfMatch Global Implementation Guide

> **Document Version**: 1.0
> **Created**: January 31, 2026
> **Purpose**: Complete guide for separating GolfMatch Global from the original Japanese app and implementing internationalization

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Current State Analysis](#2-current-state-analysis)
3. [Infrastructure Separation](#3-infrastructure-separation)
4. [Database Schema Changes](#4-database-schema-changes)
5. [Internationalization (i18n)](#5-internationalization-i18n)
6. [Code Changes Required](#6-code-changes-required)
7. [US-Specific Features](#7-us-specific-features)
8. [Implementation Roadmap](#8-implementation-roadmap)
9. [Testing Checklist](#9-testing-checklist)
10. [Quick Reference](#10-quick-reference)

---

## 1. Executive Summary

### 1.1 Current Problem

The GolfMatch Global codebase is currently a **direct copy** of the Japanese production app, sharing:
- Same Supabase database (user data would mix)
- Same App Store identifiers (would conflict on submission)
- Same RevenueCat account (revenue would be shared)
- Same Facebook/Meta SDK (analytics would merge)
- 638+ hardcoded Japanese strings with zero i18n infrastructure

### 1.2 Goal

Create a **completely independent** global/US version of GolfMatch that:
- Has its own backend infrastructure
- Supports English (with i18n framework for future languages)
- Includes US-specific features (states, USGA handicap, radius search)
- Can be published to App Store without conflicting with the original

### 1.3 Estimated Timeline

| Phase | Duration | Description |
|-------|----------|-------------|
| Infrastructure Setup | 1-2 weeks | New Supabase, RevenueCat, OAuth, etc. |
| Database Migration | 1 week | Schema with global fields |
| i18n Foundation | 1-2 weeks | Translation system setup |
| Core Localization | 2-3 weeks | Translate all screens |
| US Features | 4-6 weeks | Handicap, radius search, etc. |
| Testing & Launch | 1-2 weeks | QA, App Store submission |
| **Total** | **10-16 weeks** | Can be parallelized |

---

## 2. Current State Analysis

### 2.1 Shared Resources (MUST Change)

| Resource | Current Value | Risk if Unchanged |
|----------|---------------|-------------------|
| Supabase URL | `rriwpoqhbgvprbhomckk.supabase.co` | User data mixing |
| iOS Bundle ID | `com.zhoueverwin.golfmatchapp` | App Store rejection |
| Android Package | `com.zhoueverwin.golfmatchapp` | Play Store rejection |
| RevenueCat API Key | `appl_UHSNJdHYjthsbOjeWlIOLzIhkrO` | Revenue attribution issues |
| Facebook App ID | `2701896453510217` | Analytics mixing |
| Google OAuth Client | `986630263277-...` | Auth conflicts |
| EAS Project ID | `3449867b-e6b3-45f2-8569-47389c202518` | Build conflicts |

### 2.2 Hardcoded Japanese Content

#### Files with High String Density

| File | Estimated Strings | Category |
|------|-------------------|----------|
| `src/constants/filterOptions.ts` | 120+ | Locations, filters, labels |
| `src/screens/EditProfileScreen.tsx` | 100+ | Profile field labels |
| `src/screens/AuthScreen.tsx` | 45 | Login/signup UI |
| `src/screens/ChatScreen.tsx` | 50 | Messaging UI |
| `src/utils/authErrorTranslator.ts` | 15 | Error messages |
| `app.config.js` | 12 | Permission descriptions |
| Other screens & components | 300+ | Various UI strings |
| **Total** | **638+** | All Japanese |

#### Date/Time Formatting (Hardcoded `ja-JP`)

Files with hardcoded Japanese locale:
1. `src/utils/formatters.ts` (3 functions)
2. `src/screens/ChatScreen.tsx`
3. `src/screens/MessagesScreen.tsx`
4. `src/screens/ConnectionsScreen.tsx`
5. `src/screens/StoreScreen.tsx`
6. `src/components/BirthDatePicker.tsx`

### 2.3 Japan-Specific Database Fields

Current `profiles` table constraints:
```sql
-- Skill level CHECK constraint (Japanese values)
golf_skill_level = ANY (ARRAY['ビギナー', '中級者', '上級者', 'プロ'])

-- Location is prefecture-based only
prefecture TEXT  -- 47 Japanese prefectures

-- Culturally irrelevant for US
blood_type TEXT  -- Common in Japan, not US
```

---

## 3. Infrastructure Separation

### 3.1 New Supabase Project

#### Step 1: Create Project
1. Go to [supabase.com/dashboard](https://supabase.com/dashboard)
2. Click "New Project"
3. **Name**: `golfmatch-global` or `golfmatch-us`
4. **Region**: Select US region (e.g., `us-east-1` for East Coast users)
5. **Database Password**: Generate strong password, save securely

#### Step 2: Get Credentials
After project creation, go to Settings → API:
- **Project URL**: `https://[your-project-ref].supabase.co`
- **Anon Key**: `eyJ...` (public key for client)
- **Service Role Key**: `eyJ...` (for server-side operations, keep secret)

#### Step 3: Update `.env`
```bash
# New Supabase credentials
EXPO_PUBLIC_SUPABASE_URL=https://[NEW-PROJECT-REF].supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=[NEW-ANON-KEY]

# Keep for migrations (update with new project token)
SUPABASE_ACCESS_TOKEN=[NEW-ACCESS-TOKEN]
```

#### Step 4: Update `eas.json`
Update all three build profiles (development, preview, production) with new credentials.

### 3.2 New RevenueCat Project

#### Step 1: Create App
1. Go to [app.revenuecat.com](https://app.revenuecat.com)
2. Create new project: "GolfMatch Global"
3. Add iOS app with new Bundle ID
4. Add Android app with new Package name

#### Step 2: Configure Products
- Create new products in App Store Connect / Google Play Console
- Link products in RevenueCat
- Set up entitlements (e.g., "GolfMatch Pro")

#### Step 3: Get API Keys
- iOS API Key: `appl_...`
- Android API Key: `goog_...`

#### Step 4: Update Credentials
```bash
# In .env and eas.json
EXPO_PUBLIC_REVENUECAT_API_KEY_IOS=[NEW-IOS-KEY]
EXPO_PUBLIC_REVENUECAT_API_KEY_ANDROID=[NEW-ANDROID-KEY]
```

### 3.3 New Facebook/Meta App

#### Step 1: Create App
1. Go to [developers.facebook.com](https://developers.facebook.com)
2. Create new app → Select "Consumer" type
3. App name: "GolfMatch Global"

#### Step 2: Configure
- Add iOS platform with new Bundle ID
- Add Android platform with new Package name
- Enable "App Events" for analytics
- Get App ID and Client Token

#### Step 3: Update `app.config.js`
```javascript
["react-native-fbsdk-next", {
  appID: "[NEW-FB-APP-ID]",
  clientToken: "[NEW-CLIENT-TOKEN]",
  displayName: "GolfMatch",
  scheme: "fb[NEW-FB-APP-ID]",
  // ... rest of config
}]
```

### 3.4 New Google OAuth Configuration

#### Step 1: Create Project
1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create new project: "GolfMatch Global"
3. Enable "Google Sign-In" API

#### Step 2: Create OAuth Credentials
- Create OAuth 2.0 Client ID for iOS
- Create OAuth 2.0 Client ID for Web (required for React Native)
- Download configuration files

#### Step 3: Update Credentials
```bash
# In .env
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=[NEW-WEB-CLIENT-ID]
```

```javascript
// In app.config.js
["@react-native-google-signin/google-signin", {
  iosUrlScheme: "com.googleusercontent.apps.[NEW-IOS-CLIENT-ID]"
}]
```

### 3.5 New Apple Sign-In Configuration

#### Step 1: Create App ID
1. Go to [developer.apple.com](https://developer.apple.com)
2. Certificates, Identifiers & Profiles → Identifiers
3. Create new App ID with new Bundle ID
4. Enable "Sign In with Apple" capability

#### Step 2: Create Service ID
- Create Service ID for web-based sign-in
- Configure domains and return URLs

#### Step 3: Update Credentials
```bash
EXPO_PUBLIC_APPLE_SERVICE_ID=com.golfmatch.global.signin
```

### 3.6 New EAS Project

#### Step 1: Create Project
```bash
# In project directory
eas init
```
This will create a new project and update `app.config.js` with new `projectId`.

#### Step 2: Configure Secrets
```bash
# Set secrets for EAS builds
eas secret:create --scope project --name EXPO_PUBLIC_SUPABASE_URL --value "[URL]"
eas secret:create --scope project --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value "[KEY]"
# ... repeat for all environment variables
```

### 3.7 Summary: New Identifier Scheme

| Service | Recommended New Value |
|---------|----------------------|
| iOS Bundle ID | `com.golfmatch.global` |
| Android Package | `com.golfmatch.global` |
| Apple Service ID | `com.golfmatch.global.signin` |
| Expo Slug | `golfmatch-global` |
| App Name | "GolfMatch" or "GolfMatch US" |

---

## 4. Database Schema Changes

### 4.1 Modified Profiles Table

```sql
-- =============================================================
-- PROFILES TABLE - Global/US Version
-- Run this in new Supabase project
-- =============================================================

-- Create enum for KYC status
CREATE TYPE profile_kyc_status AS ENUM (
  'not_started', 'pending_review', 'approved', 'retry', 'rejected'
);

CREATE TABLE profiles (
  -- Primary identifiers
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  user_id TEXT UNIQUE NOT NULL,
  legacy_id TEXT UNIQUE,

  -- Basic info
  name TEXT NOT NULL,
  age INTEGER,
  birth_date DATE,
  gender TEXT CHECK (gender IN ('male', 'female', 'other')),
  bio TEXT,

  -- Profile media
  profile_pictures TEXT[] DEFAULT '{}',

  -- ===========================================
  -- LOCATION (Global version - replaces prefecture)
  -- ===========================================
  country_code VARCHAR(2) DEFAULT 'US',
  state_code VARCHAR(10),           -- US state code (CA, NY, TX, etc.)
  city VARCHAR(100),
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),
  -- NOTE: 'prefecture' column removed (was Japan-specific)

  -- ===========================================
  -- GOLF SKILLS (English values)
  -- ===========================================
  golf_skill_level TEXT CHECK (golf_skill_level IN (
    'beginner', 'intermediate', 'advanced', 'pro'
  )),
  average_score INTEGER,
  best_score TEXT,
  golf_experience TEXT,
  favorite_club TEXT,

  -- ===========================================
  -- USGA HANDICAP (New for US market)
  -- ===========================================
  handicap_index DECIMAL(3, 1),     -- USGA Handicap Index (e.g., 12.4)
  ghin_number VARCHAR(20),          -- GHIN ID for verification
  handicap_verified BOOLEAN DEFAULT FALSE,
  handicap_source VARCHAR(20) CHECK (handicap_source IN ('ghin', 'manual', 'calculated')),

  -- ===========================================
  -- PERSONAL DETAILS
  -- ===========================================
  height TEXT,
  body_type TEXT,
  smoking TEXT,
  personality_type TEXT,
  transportation TEXT,
  available_days TEXT,
  -- NOTE: 'blood_type' column removed (not relevant for US)

  -- ===========================================
  -- VERIFICATION & STATUS
  -- ===========================================
  is_verified BOOLEAN DEFAULT FALSE,
  is_premium BOOLEAN DEFAULT FALSE,
  premium_source TEXT CHECK (premium_source IS NULL OR premium_source IN ('revenuecat', 'manual', 'permanent')),
  premium_granted_at TIMESTAMPTZ,
  kyc_status profile_kyc_status,
  kyc_submitted_at TIMESTAMPTZ,
  kyc_verified_at TIMESTAMPTZ,

  -- ===========================================
  -- NOTIFICATIONS & ACTIVITY
  -- ===========================================
  push_token TEXT,
  push_token_updated_at TIMESTAMPTZ,
  last_active_at TIMESTAMPTZ DEFAULT now(),
  last_login TIMESTAMPTZ,
  last_footprints_viewed_at TIMESTAMPTZ,
  last_likes_viewed_at TIMESTAMPTZ,

  -- ===========================================
  -- TIMESTAMPS
  -- ===========================================
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ===========================================
-- POSTGIS FOR RADIUS SEARCH
-- ===========================================
CREATE EXTENSION IF NOT EXISTS postgis;

-- Add geography column for efficient distance queries
ALTER TABLE profiles ADD COLUMN location_point geography(POINT, 4326);

-- Index for fast spatial queries
CREATE INDEX profiles_location_idx ON profiles USING GIST (location_point);

-- Auto-update location_point when lat/lng changes
CREATE OR REPLACE FUNCTION update_location_point()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.latitude IS NOT NULL AND NEW.longitude IS NOT NULL THEN
    NEW.location_point = ST_SetSRID(ST_MakePoint(NEW.longitude, NEW.latitude), 4326);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER profiles_location_trigger
  BEFORE INSERT OR UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_location_point();

-- ===========================================
-- RPC FUNCTION: Search by radius
-- ===========================================
CREATE OR REPLACE FUNCTION search_profiles_by_radius(
  p_latitude DECIMAL,
  p_longitude DECIMAL,
  p_radius_miles INTEGER,
  p_limit INTEGER DEFAULT 50
)
RETURNS TABLE (
  profile_id UUID,
  distance_miles DECIMAL
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id,
    (ST_Distance(
      p.location_point,
      ST_SetSRID(ST_MakePoint(p_longitude, p_latitude), 4326)::geography
    ) / 1609.34)::DECIMAL AS distance_miles
  FROM profiles p
  WHERE p.location_point IS NOT NULL
    AND ST_DWithin(
      p.location_point,
      ST_SetSRID(ST_MakePoint(p_longitude, p_latitude), 4326)::geography,
      p_radius_miles * 1609.34  -- Convert miles to meters
    )
  ORDER BY distance_miles
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;
```

### 4.2 New Tables for US Features

```sql
-- =============================================================
-- GOLF SCORES TABLE (For handicap calculation)
-- =============================================================
CREATE TABLE golf_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  -- Course info
  course_name VARCHAR(200) NOT NULL,
  course_rating DECIMAL(4, 1),      -- Course Rating (e.g., 72.3)
  slope_rating INTEGER,              -- Slope Rating (55-155)

  -- Score data
  score INTEGER NOT NULL,
  differential DECIMAL(4, 1),        -- Calculated: (Score - Rating) × 113 / Slope

  -- Metadata
  played_at DATE NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX golf_scores_user_idx ON golf_scores(user_id);
CREATE INDEX golf_scores_date_idx ON golf_scores(played_at DESC);

-- =============================================================
-- TEE TIMES TABLE (Group matching / Foursome filler)
-- =============================================================
CREATE TABLE tee_times (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  -- Tee time details
  course_name VARCHAR(200) NOT NULL,
  tee_date DATE NOT NULL,
  tee_time TIME NOT NULL,

  -- Spots
  total_spots INTEGER DEFAULT 4,
  spots_filled INTEGER DEFAULT 1,

  -- Requirements
  handicap_min DECIMAL(3, 1),
  handicap_max DECIMAL(3, 1),
  skill_level_min TEXT,

  -- Location (for search)
  state_code VARCHAR(10),
  city VARCHAR(100),
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),
  location_point geography(POINT, 4326),

  -- Details
  description TEXT,
  cost_per_person DECIMAL(10, 2),

  -- Status
  status VARCHAR(20) DEFAULT 'open' CHECK (status IN ('open', 'full', 'confirmed', 'completed', 'cancelled')),

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX tee_times_date_idx ON tee_times(tee_date);
CREATE INDEX tee_times_location_idx ON tee_times USING GIST (location_point);
CREATE INDEX tee_times_status_idx ON tee_times(status) WHERE status = 'open';

-- =============================================================
-- TEE TIME PARTICIPANTS
-- =============================================================
CREATE TABLE tee_time_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tee_time_id UUID NOT NULL REFERENCES tee_times(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'declined', 'removed')),

  joined_at TIMESTAMPTZ DEFAULT now(),
  confirmed_at TIMESTAMPTZ,

  UNIQUE(tee_time_id, user_id)
);

-- =============================================================
-- GOLF EVENTS TABLE (Tournaments, leagues, outings)
-- =============================================================
CREATE TABLE golf_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  -- Event info
  name VARCHAR(200) NOT NULL,
  description TEXT,
  event_type VARCHAR(50) CHECK (event_type IN ('tournament', 'league', 'outing', 'scramble', 'charity')),
  format VARCHAR(50) CHECK (format IN ('stroke_play', 'match_play', 'scramble', 'best_ball', 'stableford')),

  -- Course & location
  course_name VARCHAR(200),
  state_code VARCHAR(10),
  city VARCHAR(100),

  -- Schedule
  start_date DATE NOT NULL,
  end_date DATE,
  registration_deadline DATE,

  -- Participants
  max_participants INTEGER,
  current_participants INTEGER DEFAULT 0,

  -- Cost
  entry_fee DECIMAL(10, 2),

  -- Requirements
  handicap_max DECIMAL(3, 1),

  -- Status
  status VARCHAR(20) DEFAULT 'upcoming' CHECK (status IN ('draft', 'upcoming', 'registration_open', 'registration_closed', 'in_progress', 'completed', 'cancelled')),

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- =============================================================
-- EVENT PARTICIPANTS
-- =============================================================
CREATE TABLE event_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES golf_events(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  status VARCHAR(20) DEFAULT 'registered' CHECK (status IN ('registered', 'confirmed', 'waitlist', 'cancelled', 'no_show')),
  payment_status VARCHAR(20) DEFAULT 'pending' CHECK (payment_status IN ('pending', 'paid', 'refunded')),

  registered_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE(event_id, user_id)
);
```

### 4.3 Migrate Existing Tables

Copy these tables from the original schema (no changes needed):
- `posts`
- `post_comments`
- `post_likes`
- `post_reactions`
- `post_media`
- `user_likes`
- `matches`
- `chats`
- `messages`
- `availability`
- `notifications`
- `notification_preferences`
- `profile_views`
- `user_blocks`
- `reports`
- `contact_inquiries`
- `contact_replies`
- `memberships`
- `kyc_submissions`
- `user_activities`
- `app_config`

### 4.4 Row Level Security (RLS)

Remember to enable RLS and create policies for all tables. Copy policies from original project or create new ones appropriate for global users.

---

## 5. Internationalization (i18n)

### 5.1 Install Dependencies

```bash
npm install i18next react-i18next expo-localization intl-pluralrules
```

### 5.2 Directory Structure

```
src/
└── i18n/
    ├── index.ts              # Configuration & initialization
    ├── types.ts              # TypeScript types for translations
    ├── useTranslation.ts     # Custom hook wrapper
    └── locales/
        ├── en.json           # English translations (primary)
        └── ja.json           # Japanese translations (extracted)
```

### 5.3 Configuration File

Create `src/i18n/index.ts`:

```typescript
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import * as Localization from 'expo-localization';
import AsyncStorage from '@react-native-async-storage/async-storage';
import 'intl-pluralrules';

import en from './locales/en.json';
import ja from './locales/ja.json';

const LANGUAGE_STORAGE_KEY = '@golfmatch/language';

// Detect device language
const getDeviceLanguage = (): string => {
  const locale = Localization.locale;
  const languageCode = locale.split('-')[0];
  return ['en', 'ja'].includes(languageCode) ? languageCode : 'en';
};

// Initialize i18n
const initI18n = async () => {
  let savedLanguage: string | null = null;

  try {
    savedLanguage = await AsyncStorage.getItem(LANGUAGE_STORAGE_KEY);
  } catch (error) {
    console.warn('Failed to load saved language preference');
  }

  await i18n
    .use(initReactI18next)
    .init({
      compatibilityJSON: 'v3',
      resources: {
        en: { translation: en },
        ja: { translation: ja },
      },
      lng: savedLanguage || getDeviceLanguage(),
      fallbackLng: 'en',
      interpolation: {
        escapeValue: false,
      },
      react: {
        useSuspense: false,
      },
    });

  return i18n;
};

// Change language and persist preference
export const changeLanguage = async (languageCode: string) => {
  await i18n.changeLanguage(languageCode);
  try {
    await AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, languageCode);
  } catch (error) {
    console.warn('Failed to save language preference');
  }
};

export { initI18n };
export default i18n;
```

### 5.4 Translation File Structure

Create `src/i18n/locales/en.json`:

```json
{
  "common": {
    "save": "Save",
    "cancel": "Cancel",
    "ok": "OK",
    "back": "Back",
    "next": "Next",
    "done": "Done",
    "edit": "Edit",
    "delete": "Delete",
    "confirm": "Confirm",
    "loading": "Loading...",
    "error": "Error",
    "success": "Success",
    "retry": "Retry",
    "close": "Close",
    "search": "Search",
    "filter": "Filter",
    "reset": "Reset",
    "apply": "Apply",
    "submit": "Submit",
    "send": "Send",
    "unspecified": "Not specified",
    "optional": "Optional",
    "required": "Required"
  },

  "auth": {
    "login": "Log In",
    "logout": "Log Out",
    "register": "Sign Up",
    "email": "Email",
    "password": "Password",
    "confirmPassword": "Confirm Password",
    "forgotPassword": "Forgot Password?",
    "resetPassword": "Reset Password",
    "phoneNumber": "Phone Number",
    "verificationCode": "Verification Code",
    "sendCode": "Send Code",
    "resendCode": "Resend Code",
    "continueWithGoogle": "Continue with Google",
    "continueWithApple": "Continue with Apple",
    "orContinueWith": "Or continue with",
    "agreeToTerms": "By signing up, you agree to our Terms of Service and Privacy Policy",
    "alreadyHaveAccount": "Already have an account?",
    "dontHaveAccount": "Don't have an account?",
    "errors": {
      "invalidCredentials": "Invalid email or password",
      "userNotFound": "User not found",
      "emailTaken": "This email is already registered",
      "phoneTaken": "This phone number is already registered",
      "weakPassword": "Password is too weak. Use at least 8 characters with letters and numbers",
      "invalidEmail": "Please enter a valid email address",
      "invalidPhone": "Please enter a valid phone number",
      "invalidCode": "Invalid verification code",
      "codeExpired": "Verification code has expired",
      "networkError": "Network error. Please check your connection and try again",
      "tooManyAttempts": "Too many attempts. Please try again later",
      "sessionExpired": "Your session has expired. Please log in again",
      "unknownError": "An unexpected error occurred. Please try again"
    }
  },

  "profile": {
    "title": "Profile",
    "editProfile": "Edit Profile",
    "myProfile": "My Profile",
    "viewProfile": "View Profile",
    "name": "Name",
    "age": "Age",
    "birthDate": "Date of Birth",
    "gender": "Gender",
    "location": "Location",
    "state": "State",
    "city": "City",
    "bio": "About Me",
    "bioPlaceholder": "Tell others about yourself and your golf journey...",
    "photos": "Photos",
    "addPhoto": "Add Photo",
    "mainPhoto": "Main Photo",
    "golfInfo": "Golf Information",
    "golfLevel": "Golf Level",
    "averageScore": "Average Score",
    "bestScore": "Best Score",
    "handicap": "Handicap Index",
    "ghinNumber": "GHIN Number",
    "experience": "Golf Experience",
    "favoriteClub": "Favorite Club",
    "transportation": "Transportation",
    "availableDays": "Available Days",
    "personalInfo": "Personal Information",
    "height": "Height",
    "bodyType": "Body Type",
    "smoking": "Smoking",
    "personality": "Personality",
    "verified": "Verified",
    "premium": "Premium",
    "lastActive": "Last active",
    "memberSince": "Member since"
  },

  "tabs": {
    "home": "Home",
    "search": "Search",
    "connections": "Connections",
    "messages": "Messages",
    "myPage": "My Page"
  },

  "home": {
    "title": "Home",
    "newPost": "New Post",
    "emptyFeed": "No posts yet",
    "emptyFeedDescription": "Follow people or create your first post!",
    "writePost": "What's on your mind?",
    "post": "Post"
  },

  "search": {
    "title": "Search",
    "findGolfers": "Find Golfers",
    "noResults": "No golfers found",
    "noResultsDescription": "Try adjusting your filters",
    "filterResults": "Filter Results"
  },

  "connections": {
    "title": "Connections",
    "likes": "Likes",
    "matches": "Matches",
    "footprints": "Footprints",
    "likedYou": "Liked You",
    "youLiked": "You Liked",
    "newMatch": "New Match!",
    "matchedWith": "You matched with {{name}}!",
    "startConversation": "Start a conversation",
    "noLikes": "No likes yet",
    "noLikesDescription": "When someone likes you, they'll appear here",
    "noMatches": "No matches yet",
    "noMatchesDescription": "When you mutually like someone, you'll match!"
  },

  "messages": {
    "title": "Messages",
    "noMessages": "No messages yet",
    "noMessagesDescription": "Match with someone to start chatting",
    "typeMessage": "Type a message...",
    "send": "Send",
    "today": "Today",
    "yesterday": "Yesterday",
    "online": "Online",
    "typing": "typing..."
  },

  "filters": {
    "title": "Filters",
    "detailedFilters": "Detailed Filters",
    "gender": "Gender",
    "location": "Location",
    "state": "State",
    "distance": "Distance",
    "age": "Age",
    "ageRange": "Age Range",
    "golfLevel": "Golf Level",
    "handicap": "Handicap",
    "handicapRange": "Handicap Range",
    "averageScore": "Average Score",
    "maxScore": "Maximum Score",
    "lastLogin": "Last Active",
    "applyFilters": "Apply Filters",
    "resetFilters": "Reset Filters",
    "clearAll": "Clear All"
  },

  "data": {
    "genders": {
      "female": "Female",
      "male": "Male",
      "other": "Other"
    },
    "skillLevels": {
      "beginner": "Beginner",
      "intermediate": "Intermediate",
      "advanced": "Advanced",
      "pro": "Pro"
    },
    "ageRanges": {
      "20s": "20-29",
      "30s": "30-39",
      "40s": "40-49",
      "50s": "50-59",
      "60s": "60-69",
      "70plus": "70+"
    },
    "scoreFilters": {
      "under80": "Under 80",
      "under90": "Under 90",
      "under100": "Under 100",
      "under110": "Under 110",
      "under120": "Under 120",
      "any": "Any"
    },
    "lastLogin": {
      "24hours": "Within 24 hours",
      "3days": "Within 3 days",
      "7days": "Within 7 days",
      "30days": "Within 30 days",
      "any": "Any time"
    },
    "distanceOptions": {
      "5miles": "5 miles",
      "10miles": "10 miles",
      "25miles": "25 miles",
      "50miles": "50 miles",
      "100miles": "100 miles",
      "anywhere": "Anywhere"
    }
  },

  "states": {
    "AL": "Alabama",
    "AK": "Alaska",
    "AZ": "Arizona",
    "AR": "Arkansas",
    "CA": "California",
    "CO": "Colorado",
    "CT": "Connecticut",
    "DE": "Delaware",
    "FL": "Florida",
    "GA": "Georgia",
    "HI": "Hawaii",
    "ID": "Idaho",
    "IL": "Illinois",
    "IN": "Indiana",
    "IA": "Iowa",
    "KS": "Kansas",
    "KY": "Kentucky",
    "LA": "Louisiana",
    "ME": "Maine",
    "MD": "Maryland",
    "MA": "Massachusetts",
    "MI": "Michigan",
    "MN": "Minnesota",
    "MS": "Mississippi",
    "MO": "Missouri",
    "MT": "Montana",
    "NE": "Nebraska",
    "NV": "Nevada",
    "NH": "New Hampshire",
    "NJ": "New Jersey",
    "NM": "New Mexico",
    "NY": "New York",
    "NC": "North Carolina",
    "ND": "North Dakota",
    "OH": "Ohio",
    "OK": "Oklahoma",
    "OR": "Oregon",
    "PA": "Pennsylvania",
    "RI": "Rhode Island",
    "SC": "South Carolina",
    "SD": "South Dakota",
    "TN": "Tennessee",
    "TX": "Texas",
    "UT": "Utah",
    "VT": "Vermont",
    "VA": "Virginia",
    "WA": "Washington",
    "WV": "West Virginia",
    "WI": "Wisconsin",
    "WY": "Wyoming",
    "DC": "Washington D.C."
  },

  "settings": {
    "title": "Settings",
    "account": "Account",
    "notifications": "Notifications",
    "privacy": "Privacy",
    "help": "Help & Support",
    "about": "About",
    "terms": "Terms of Service",
    "privacyPolicy": "Privacy Policy",
    "deleteAccount": "Delete Account",
    "version": "Version"
  },

  "store": {
    "title": "Premium",
    "upgrade": "Upgrade to Premium",
    "features": "Premium Features",
    "unlimitedLikes": "Unlimited Likes",
    "seeWhoLikesYou": "See Who Likes You",
    "advancedFilters": "Advanced Filters",
    "noAds": "No Ads",
    "subscribe": "Subscribe",
    "restore": "Restore Purchases",
    "perMonth": "/month",
    "perYear": "/year"
  },

  "kyc": {
    "title": "Identity Verification",
    "description": "Verify your identity to get a verified badge and build trust with other golfers",
    "step1": "Upload ID",
    "step2": "Take Selfie",
    "step3": "ID with Selfie",
    "step4": "Golf Photo",
    "idFront": "Front of ID",
    "idBack": "Back of ID",
    "selfie": "Selfie",
    "idSelfie": "Selfie with ID",
    "golfPhoto": "Photo of you golfing",
    "submit": "Submit for Review",
    "pending": "Under Review",
    "approved": "Verified",
    "rejected": "Verification Failed",
    "retry": "Please Resubmit"
  },

  "errors": {
    "generic": "Something went wrong. Please try again.",
    "network": "Network error. Please check your connection.",
    "notFound": "Not found",
    "unauthorized": "Please log in to continue",
    "forbidden": "You don't have permission to do this"
  },

  "time": {
    "justNow": "Just now",
    "minutesAgo": "{{count}} minute ago",
    "minutesAgo_plural": "{{count}} minutes ago",
    "hoursAgo": "{{count}} hour ago",
    "hoursAgo_plural": "{{count}} hours ago",
    "daysAgo": "{{count}} day ago",
    "daysAgo_plural": "{{count}} days ago",
    "weeksAgo": "{{count}} week ago",
    "weeksAgo_plural": "{{count}} weeks ago"
  },

  "permissions": {
    "camera": "GolfMatch uses your camera to take photos and videos for posts, and to capture ID documents for verification.",
    "photoLibrary": "GolfMatch accesses your photo library to select photos for posts and profile pictures.",
    "microphone": "GolfMatch uses your microphone to record audio for video posts.",
    "notifications": "Receive notifications for new matches, messages, and likes.",
    "tracking": "This identifier will be used to deliver personalized ads to you."
  }
}
```

### 5.5 Using Translations in Components

```typescript
// In any component
import { useTranslation } from 'react-i18next';

const MyComponent = () => {
  const { t } = useTranslation();

  return (
    <View>
      <Text>{t('common.save')}</Text>
      <Text>{t('profile.name')}</Text>
      <Text>{t('auth.errors.invalidCredentials')}</Text>
      <Text>{t('states.CA')}</Text>

      {/* With interpolation */}
      <Text>{t('connections.matchedWith', { name: 'John' })}</Text>

      {/* With pluralization */}
      <Text>{t('time.minutesAgo', { count: 5 })}</Text>
    </View>
  );
};
```

### 5.6 Locale-Aware Date Formatting

Create `src/utils/localizedFormatters.ts`:

```typescript
import i18n from '../i18n';

/**
 * Get current locale for date/number formatting
 */
export const getCurrentLocale = (): string => {
  const lang = i18n.language;
  return lang === 'ja' ? 'ja-JP' : 'en-US';
};

/**
 * Format date based on current locale
 */
export const formatDate = (date: Date | string, options?: Intl.DateTimeFormatOptions): string => {
  const d = typeof date === 'string' ? new Date(date) : date;
  const locale = getCurrentLocale();

  const defaultOptions: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  };

  return d.toLocaleDateString(locale, options || defaultOptions);
};

/**
 * Format time based on current locale
 */
export const formatTime = (date: Date | string): string => {
  const d = typeof date === 'string' ? new Date(date) : date;
  const locale = getCurrentLocale();

  return d.toLocaleTimeString(locale, {
    hour: '2-digit',
    minute: '2-digit',
  });
};

/**
 * Format relative time (e.g., "5 minutes ago")
 */
export const formatRelativeTime = (date: Date | string): string => {
  const d = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  const { t } = i18n;

  if (diffMins < 1) return t('time.justNow');
  if (diffMins < 60) return t('time.minutesAgo', { count: diffMins });
  if (diffHours < 24) return t('time.hoursAgo', { count: diffHours });
  if (diffDays < 7) return t('time.daysAgo', { count: diffDays });

  return formatDate(d);
};

/**
 * Format number based on current locale
 */
export const formatNumber = (num: number): string => {
  const locale = getCurrentLocale();
  return num.toLocaleString(locale);
};

/**
 * Format currency based on current locale
 */
export const formatCurrency = (amount: number, currency: string = 'USD'): string => {
  const locale = getCurrentLocale();
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: locale === 'ja-JP' ? 'JPY' : currency,
  }).format(amount);
};
```

---

## 6. Code Changes Required

### 6.1 TypeScript Types (`src/types/dataModels.ts`)

Replace the `User` interface with:

```typescript
export interface User {
  id: string;
  legacy_id: string;
  user_id: string;
  name: string;
  age: number;
  birth_date?: string;
  gender: "male" | "female" | "other";

  // Location (Global version)
  country_code?: string;
  state_code?: string;
  city?: string;
  latitude?: number;
  longitude?: number;

  // Golf skills (English values)
  golf_skill_level: "beginner" | "intermediate" | "advanced" | "pro";
  average_score?: number;
  best_score?: string;

  // USGA Handicap
  handicap_index?: number;
  ghin_number?: string;
  handicap_verified?: boolean;
  handicap_source?: "ghin" | "manual" | "calculated";

  bio?: string;
  profile_pictures: string[];
  is_verified: boolean;
  is_premium?: boolean;
  kyc_status?: 'not_started' | 'pending_review' | 'approved' | 'retry' | 'rejected';

  // Personal details
  height?: string;
  body_type?: string;
  smoking?: string;
  favorite_club?: string;
  personality_type?: string;
  golf_experience?: string;
  transportation?: string;
  available_days?: string;

  // Timestamps
  last_login: string;
  last_active_at?: string | null;
  created_at: string;
  updated_at: string;

  // UI state
  isLiked?: boolean;
  isSuperLiked?: boolean;
  isPassed?: boolean;
  interactionType?: InteractionType;
  recommendation_score?: number;
}
```

### 6.2 Filter Options (`src/constants/filterOptions.ts`)

Replace entire file with localized version:

```typescript
/**
 * Filter Options Constants - Global/US Version
 * All labels use i18n translation keys
 */

// ============================================================================
// US STATES (50 states + DC)
// ============================================================================
export const US_STATES = [
  { value: "AL", labelKey: "states.AL" },
  { value: "AK", labelKey: "states.AK" },
  { value: "AZ", labelKey: "states.AZ" },
  { value: "AR", labelKey: "states.AR" },
  { value: "CA", labelKey: "states.CA" },
  { value: "CO", labelKey: "states.CO" },
  { value: "CT", labelKey: "states.CT" },
  { value: "DE", labelKey: "states.DE" },
  { value: "FL", labelKey: "states.FL" },
  { value: "GA", labelKey: "states.GA" },
  { value: "HI", labelKey: "states.HI" },
  { value: "ID", labelKey: "states.ID" },
  { value: "IL", labelKey: "states.IL" },
  { value: "IN", labelKey: "states.IN" },
  { value: "IA", labelKey: "states.IA" },
  { value: "KS", labelKey: "states.KS" },
  { value: "KY", labelKey: "states.KY" },
  { value: "LA", labelKey: "states.LA" },
  { value: "ME", labelKey: "states.ME" },
  { value: "MD", labelKey: "states.MD" },
  { value: "MA", labelKey: "states.MA" },
  { value: "MI", labelKey: "states.MI" },
  { value: "MN", labelKey: "states.MN" },
  { value: "MS", labelKey: "states.MS" },
  { value: "MO", labelKey: "states.MO" },
  { value: "MT", labelKey: "states.MT" },
  { value: "NE", labelKey: "states.NE" },
  { value: "NV", labelKey: "states.NV" },
  { value: "NH", labelKey: "states.NH" },
  { value: "NJ", labelKey: "states.NJ" },
  { value: "NM", labelKey: "states.NM" },
  { value: "NY", labelKey: "states.NY" },
  { value: "NC", labelKey: "states.NC" },
  { value: "ND", labelKey: "states.ND" },
  { value: "OH", labelKey: "states.OH" },
  { value: "OK", labelKey: "states.OK" },
  { value: "OR", labelKey: "states.OR" },
  { value: "PA", labelKey: "states.PA" },
  { value: "RI", labelKey: "states.RI" },
  { value: "SC", labelKey: "states.SC" },
  { value: "SD", labelKey: "states.SD" },
  { value: "TN", labelKey: "states.TN" },
  { value: "TX", labelKey: "states.TX" },
  { value: "UT", labelKey: "states.UT" },
  { value: "VT", labelKey: "states.VT" },
  { value: "VA", labelKey: "states.VA" },
  { value: "WA", labelKey: "states.WA" },
  { value: "WV", labelKey: "states.WV" },
  { value: "WI", labelKey: "states.WI" },
  { value: "WY", labelKey: "states.WY" },
  { value: "DC", labelKey: "states.DC" },
] as const;

// ============================================================================
// GENDER OPTIONS
// ============================================================================
export const GENDER_OPTIONS = [
  { value: "female", labelKey: "data.genders.female" },
  { value: "male", labelKey: "data.genders.male" },
] as const;

// ============================================================================
// GOLF SKILL LEVEL OPTIONS (English values)
// ============================================================================
export const SKILL_LEVELS = [
  { value: "beginner", labelKey: "data.skillLevels.beginner" },
  { value: "intermediate", labelKey: "data.skillLevels.intermediate" },
  { value: "advanced", labelKey: "data.skillLevels.advanced" },
  { value: "pro", labelKey: "data.skillLevels.pro" },
] as const;

// ============================================================================
// AGE RANGE OPTIONS
// ============================================================================
export const AGE_RANGES = [
  { value: 20, labelKey: "data.ageRanges.20s", ageMin: 20, ageMax: 29 },
  { value: 30, labelKey: "data.ageRanges.30s", ageMin: 30, ageMax: 39 },
  { value: 40, labelKey: "data.ageRanges.40s", ageMin: 40, ageMax: 49 },
  { value: 50, labelKey: "data.ageRanges.50s", ageMin: 50, ageMax: 59 },
  { value: 60, labelKey: "data.ageRanges.60s", ageMin: 60, ageMax: 69 },
  { value: 70, labelKey: "data.ageRanges.70plus", ageMin: 70, ageMax: 120 },
] as const;

// ============================================================================
// AVERAGE SCORE OPTIONS
// ============================================================================
export const SCORE_OPTIONS = [
  { value: 80, labelKey: "data.scoreFilters.under80" },
  { value: 90, labelKey: "data.scoreFilters.under90" },
  { value: 100, labelKey: "data.scoreFilters.under100" },
  { value: 110, labelKey: "data.scoreFilters.under110" },
  { value: 120, labelKey: "data.scoreFilters.under120" },
  { value: 999, labelKey: "data.scoreFilters.any" },
] as const;

// ============================================================================
// LAST LOGIN OPTIONS
// ============================================================================
export const LAST_LOGIN_OPTIONS = [
  { value: 1, labelKey: "data.lastLogin.24hours" },
  { value: 3, labelKey: "data.lastLogin.3days" },
  { value: 7, labelKey: "data.lastLogin.7days" },
  { value: 30, labelKey: "data.lastLogin.30days" },
  { value: null, labelKey: "data.lastLogin.any" },
] as const;

// ============================================================================
// RADIUS/DISTANCE OPTIONS (NEW for US)
// ============================================================================
export const RADIUS_OPTIONS = [
  { value: 5, labelKey: "data.distanceOptions.5miles" },
  { value: 10, labelKey: "data.distanceOptions.10miles" },
  { value: 25, labelKey: "data.distanceOptions.25miles" },
  { value: 50, labelKey: "data.distanceOptions.50miles" },
  { value: 100, labelKey: "data.distanceOptions.100miles" },
  { value: null, labelKey: "data.distanceOptions.anywhere" },
] as const;

// ============================================================================
// HANDICAP RANGE OPTIONS (NEW for US)
// ============================================================================
export const HANDICAP_RANGES = [
  { min: 0, max: 5, label: "Scratch - 5" },
  { min: 6, max: 10, label: "6 - 10" },
  { min: 11, max: 15, label: "11 - 15" },
  { min: 16, max: 20, label: "16 - 20" },
  { min: 21, max: 30, label: "21 - 30" },
  { min: 31, max: 54, label: "31+" },
] as const;

// ============================================================================
// FILTER LABELS
// ============================================================================
export const FILTER_LABELS = {
  gender: "filters.gender",
  location: "filters.location",
  state: "filters.state",
  distance: "filters.distance",
  age: "filters.age",
  skillLevel: "filters.golfLevel",
  handicap: "filters.handicap",
  averageScore: "filters.averageScore",
  lastLogin: "filters.lastLogin",
} as const;
```

### 6.3 App Config (`app.config.js`)

Update with new identifiers and English permissions:

```javascript
export default {
  expo: {
    name: "GolfMatch",
    slug: "golfmatch-global",
    version: "1.0.0",
    orientation: "portrait",
    icon: "./assets/icon.png",
    userInterfaceStyle: "light",
    jsEngine: "hermes",
    scheme: "golfmatch",

    ios: {
      supportsTablet: true,
      bundleIdentifier: "com.golfmatch.global",
      appStoreIcon: "./assets/icon.png",
      buildNumber: "1",
      infoPlist: {
        UIBackgroundModes: ["remote-notification"],
        ITSAppUsesNonExemptEncryption: false,
        NSCameraUsageDescription: "GolfMatch uses your camera to take photos and videos for posts, and to capture ID documents for verification.",
        NSPhotoLibraryUsageDescription: "GolfMatch accesses your photo library to select photos for posts and profile pictures.",
        NSMicrophoneUsageDescription: "GolfMatch uses your microphone to record audio for video posts.",
        NSUserNotificationsUsageDescription: "Receive notifications for new matches, messages, and likes.",
        NSUserTrackingUsageDescription: "This identifier will be used to deliver personalized ads to you."
      }
    },

    android: {
      adaptiveIcon: {
        foregroundImage: "./assets/icon.png",
        backgroundColor: "#ffffff"
      },
      edgeToEdgeEnabled: true,
      package: "com.golfmatch.global"
    },

    extra: {
      EXPO_PUBLIC_SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL,
      EXPO_PUBLIC_SUPABASE_ANON_KEY: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
      eas: {
        projectId: "YOUR_NEW_EAS_PROJECT_ID"
      }
    },

    owner: "your-expo-username",

    plugins: [
      ["expo-splash-screen", {
        backgroundColor: "#21B2AA",
        image: "./assets/images/Icons/GolfMatch-1024.png",
        imageWidth: 600
      }],
      "expo-video",
      ["@react-native-google-signin/google-signin", {
        iosUrlScheme: "com.googleusercontent.apps.YOUR_NEW_IOS_CLIENT_ID"
      }],
      ["react-native-fbsdk-next", {
        appID: "YOUR_NEW_FB_APP_ID",
        clientToken: "YOUR_NEW_CLIENT_TOKEN",
        displayName: "GolfMatch",
        scheme: "fbYOUR_NEW_FB_APP_ID",
        advertiserIDCollectionEnabled: true,
        autoLogAppEventsEnabled: true,
        isAutoInitEnabled: true,
        iosUserTrackingPermission: "This identifier will be used to deliver personalized ads to you."
      }],
      ["expo-tracking-transparency", {
        userTrackingPermission: "This identifier will be used to deliver personalized ads to you."
      }],
      ["expo-notifications", {
        icon: "./assets/icon.png",
        color: "#4A90E2",
        iosDisplayInForeground: true
      }],
      ["expo-image-picker", {
        photosPermission: "GolfMatch accesses your photo library to select photos for posts and profile pictures.",
        cameraPermission: "GolfMatch uses your camera to take photos and videos for posts, and to capture ID documents for verification.",
        microphonePermission: "GolfMatch uses your microphone to record audio for video posts."
      }],
      ["expo-camera", {
        cameraPermission: "GolfMatch uses your camera to take photos and videos for posts, and to capture ID documents for verification.",
        microphonePermission: "GolfMatch uses your microphone to record audio for video posts.",
        recordAudioAndroid: true
      }],
      ["expo-media-library", {
        photosPermission: "GolfMatch saves photos and videos to your device.",
        savePhotosPermission: "GolfMatch saves photos and videos to your device.",
        isAccessMediaLocationEnabled: true
      }],
      "react-native-compressor"
    ],

    notification: {
      icon: "./assets/icon.png",
      color: "#4A90E2",
      androidMode: "default",
      androidCollapsedTitle: "New notification"
    }
  }
};
```

---

## 7. US-Specific Features

### 7.1 USGA Handicap Integration

#### Option A: GHIN API (Recommended for verified handicaps)
- Apply for API access at [usga.org](https://www.usga.org/content/usga/home-page/handicapping/handicap-network-apis.html)
- Requires business relationship with USGA
- Provides verified, real-time handicap data

#### Option B: Manual Entry + Verification
- User enters GHIN number
- Optional: Screenshot upload for verification
- Staff manually verifies against GHIN website

#### Option C: In-App Calculation
- User logs scores with course rating/slope
- App calculates handicap differential
- Shows "Calculated" badge vs "Verified" badge

### 7.2 Radius Search Implementation

The PostGIS extension and RPC function in Section 4.1 enable radius search. To use:

```typescript
// In your search service
const searchByRadius = async (
  latitude: number,
  longitude: number,
  radiusMiles: number
) => {
  const { data, error } = await supabase.rpc('search_profiles_by_radius', {
    p_latitude: latitude,
    p_longitude: longitude,
    p_radius_miles: radiusMiles,
  });

  return { data, error };
};
```

### 7.3 Getting User Location

```typescript
import * as Location from 'expo-location';

const getUserLocation = async () => {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') {
    return null;
  }

  const location = await Location.getCurrentPositionAsync({});
  return {
    latitude: location.coords.latitude,
    longitude: location.coords.longitude,
  };
};
```

---

## 8. Implementation Roadmap

### Phase 1: Infrastructure Setup (Week 1-2)

- [ ] **Day 1-2**: Create new Supabase project
  - [ ] Create project in US region
  - [ ] Save credentials securely
  - [ ] Set up authentication providers

- [ ] **Day 3-4**: Create new third-party accounts
  - [ ] RevenueCat project
  - [ ] Meta/Facebook app
  - [ ] Google Cloud project for OAuth
  - [ ] Apple Sign-In configuration

- [ ] **Day 5-7**: Update codebase credentials
  - [ ] Update `.env` with all new credentials
  - [ ] Update `eas.json` with new environment variables
  - [ ] Update `app.config.js` with new identifiers
  - [ ] Test build compiles successfully

### Phase 2: Database Setup (Week 2-3)

- [ ] **Day 1-3**: Create database schema
  - [ ] Run modified profiles table SQL
  - [ ] Enable PostGIS extension
  - [ ] Create radius search RPC function
  - [ ] Copy other tables from original schema

- [ ] **Day 4-5**: Set up Row Level Security
  - [ ] Create RLS policies for all tables
  - [ ] Test policies with different user roles

- [ ] **Day 6-7**: Create Edge Functions (if needed)
  - [ ] Copy and adapt any Edge Functions from original

### Phase 3: i18n Foundation (Week 3-4)

- [ ] **Day 1-2**: Install and configure i18n
  - [ ] Install dependencies
  - [ ] Create `src/i18n/index.ts` configuration
  - [ ] Set up locale detection

- [ ] **Day 3-5**: Create translation files
  - [ ] Create `src/i18n/locales/en.json` with all strings
  - [ ] Create `src/i18n/locales/ja.json` (extract from current code)

- [ ] **Day 6-7**: Create utility functions
  - [ ] `src/utils/localizedFormatters.ts`
  - [ ] Update existing `formatters.ts` to use locale

### Phase 4: Core Localization (Week 4-6)

- [ ] **Week 4**: High-priority files
  - [ ] `src/constants/filterOptions.ts`
  - [ ] `src/utils/authErrorTranslator.ts`
  - [ ] `src/screens/AuthScreen.tsx`

- [ ] **Week 5**: Profile & main screens
  - [ ] `src/screens/EditProfileScreen.tsx`
  - [ ] `src/screens/HomeScreen.tsx`
  - [ ] `src/screens/SearchScreen.tsx`
  - [ ] `src/screens/ConnectionsScreen.tsx`

- [ ] **Week 6**: Remaining screens
  - [ ] `src/screens/ChatScreen.tsx`
  - [ ] `src/screens/MessagesScreen.tsx`
  - [ ] `src/screens/UserProfileScreen.tsx`
  - [ ] All component files with UI text

### Phase 5: US Features (Week 7-10)

- [ ] **Week 7**: Location system
  - [ ] Create StateSelector component
  - [ ] Add city input field
  - [ ] Implement location permission flow
  - [ ] Update profile edit screen

- [ ] **Week 8**: Radius search
  - [ ] Create RadiusSelector component
  - [ ] Update search service with radius filter
  - [ ] Update search screen UI

- [ ] **Week 9-10**: Handicap system (optional)
  - [ ] Add handicap input to profile
  - [ ] Create handicap display component
  - [ ] Add handicap filter to search
  - [ ] (Optional) Score entry screen

### Phase 6: Testing & Launch (Week 11-12)

- [ ] **Week 11**: Testing
  - [ ] Full English QA pass
  - [ ] Test all auth flows
  - [ ] Test all CRUD operations
  - [ ] Test push notifications
  - [ ] Test in-app purchases

- [ ] **Week 12**: App Store submission
  - [ ] Create English App Store screenshots
  - [ ] Write English App Store description
  - [ ] Submit to TestFlight
  - [ ] Beta testing
  - [ ] Submit for review

---

## 9. Testing Checklist

### 9.1 Infrastructure Tests

- [ ] Can create new user account (email/password)
- [ ] Can create new user account (phone/OTP)
- [ ] Can sign in with Google
- [ ] Can sign in with Apple
- [ ] Push notifications are received
- [ ] In-app purchase flow completes
- [ ] RevenueCat syncs premium status

### 9.2 Localization Tests

- [ ] App detects device language correctly
- [ ] All screens display in English
- [ ] No Japanese text visible (unless user selects Japanese)
- [ ] Dates display as MM/DD/YYYY (US format)
- [ ] Numbers use US formatting (1,234.56)
- [ ] Currency displays as USD
- [ ] Language preference persists after app restart

### 9.3 US Feature Tests

- [ ] State selector shows all 50 states + DC
- [ ] City field accepts input
- [ ] Radius filter returns correct results
- [ ] Distance calculation is accurate
- [ ] Handicap field accepts valid values (0-54)
- [ ] Handicap filter works correctly

### 9.4 Database Isolation Tests

- [ ] New users don't appear in original Japan app
- [ ] Original Japan users don't appear in global app
- [ ] No data leakage between databases

---

## 10. Quick Reference

### 10.1 New Credentials Checklist

| Service | Environment Variable | Status |
|---------|---------------------|--------|
| Supabase URL | `EXPO_PUBLIC_SUPABASE_URL` | ⬜ |
| Supabase Anon Key | `EXPO_PUBLIC_SUPABASE_ANON_KEY` | ⬜ |
| Supabase Access Token | `SUPABASE_ACCESS_TOKEN` | ⬜ |
| Google Web Client ID | `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` | ⬜ |
| Apple Service ID | `EXPO_PUBLIC_APPLE_SERVICE_ID` | ⬜ |
| RevenueCat iOS Key | `EXPO_PUBLIC_REVENUECAT_API_KEY_IOS` | ⬜ |
| RevenueCat Android Key | `EXPO_PUBLIC_REVENUECAT_API_KEY_ANDROID` | ⬜ |
| Facebook App ID | (in app.config.js) | ⬜ |
| Facebook Client Token | (in app.config.js) | ⬜ |

### 10.2 Files to Update

| File | Changes |
|------|---------|
| `.env` | All credentials |
| `eas.json` | All credentials in all profiles |
| `app.config.js` | Bundle IDs, SDK configs, permissions |
| `src/constants/filterOptions.ts` | US states, English labels |
| `src/types/dataModels.ts` | User interface with global fields |
| `src/utils/formatters.ts` | Use locale-aware formatting |
| `src/utils/authErrorTranslator.ts` | Use i18n keys |

### 10.3 Key Commands

```bash
# Install i18n dependencies
npm install i18next react-i18next expo-localization intl-pluralrules

# Initialize new EAS project
eas init

# Set EAS secrets
eas secret:create --scope project --name VAR_NAME --value "value"

# Build development client
export TMPDIR="$HOME/.metro-tmp" && npx expo run:ios

# Build production
eas build --platform ios --profile production

# Submit to App Store
eas submit --platform ios --path /path/to/build.ipa
```

### 10.4 Important Notes

1. **Never mix databases**: Once you switch to the new Supabase project, never switch back to the original. This prevents data corruption.

2. **Test thoroughly before launch**: The global app should be completely independent. Test all flows end-to-end.

3. **Keep Japanese version working**: The original app should continue to work. Don't modify its database or credentials.

4. **Plan for multi-language**: The i18n setup supports adding more languages later (Spanish, Korean, etc.).

5. **Consider regional pricing**: RevenueCat supports different pricing for different regions.

---

## Document History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-01-31 | Initial document |

---

*This document is intended for internal development use. Keep credentials secure and never commit sensitive values to version control.*
