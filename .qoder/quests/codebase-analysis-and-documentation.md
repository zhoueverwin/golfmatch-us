# GolfMatch Application - Technical Documentation

## Executive Overview

GolfMatch is a React Native dating application designed specifically for golf enthusiasts, enabling users to connect based on shared golf interests, skill levels, and location preferences. Built on Expo SDK 54 with React Native, the application leverages Supabase for backend services and implements a comprehensive feature set including user authentication, profile management, matching system, real-time messaging, social feed, and calendar integration.

### Technology Stack

- Framework: React Native with Expo SDK 54
- Language: TypeScript 5.9.2
- State Management: React Context API combined with TanStack Query v5
- Backend: Supabase (PostgreSQL database, authentication, real-time subscriptions, storage)
- Navigation: React Navigation 7 (Stack and Bottom Tabs)
- UI Components: Custom components with React Native core
- Testing: Jest for unit tests, Detox for E2E testing
- Data Fetching: TanStack Query with optimistic updates
- Caching: Custom CacheService with AsyncStorage
- Authentication: Multi-provider (Phone OTP, Email/Password, Google OAuth, Apple Sign-In)

---

## System Architecture

### Architectural Overview

The application follows a layered architecture pattern with clear separation of concerns:

```
┌─────────────────────────────────────────────────────────────┐
│                      Presentation Layer                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │   Screens    │  │  Components  │  │  Navigation  │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                    State Management Layer                    │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │   Context    │  │ React Query  │  │    Hooks     │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                      Business Logic Layer                    │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │   Services   │  │   Utilities  │  │    Cache     │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                        Data Layer                            │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │   Supabase   │  │   Storage    │  │  Real-time   │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└─────────────────────────────────────────────────────────────┘
```

### Core Design Patterns

#### Service Layer Pattern
The application uses specialized service classes for different domains, each encapsulating specific business logic:

- ProfilesService: User profile operations
- PostsService: Social feed content management
- MatchesService: Matching and likes logic
- MessagesService: Chat functionality
- AvailabilityService: Calendar management
- ContactInquiriesService: Support system
- BlocksService: User blocking
- ReportsService: Content reporting

#### Data Provider Pattern
SupabaseDataProvider acts as a unified data access layer, abstracting Supabase operations behind a consistent interface. It implements:

- Retry logic with exponential backoff
- Cache-first data fetching
- User ID resolution (auth.users.id to profiles.id mapping)
- Error handling and normalization

#### Context Provider Pattern
React Context providers manage global application state:

- AuthContext: Authentication state and user session
- NotificationContext: Push notifications and real-time alerts
- MatchContext: Match celebration and modal management
- RevenueCatContext: In-app purchase management

#### Repository Pattern
Each service class follows repository pattern principles, providing methods for CRUD operations and subscriptions without exposing database implementation details.

---

## Data Models and Database Schema

### Core Entities

#### User Profile

Represents a user account with golf-specific attributes.

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key (profile ID) |
| legacy_id | String | Backward compatibility identifier |
| user_id | UUID | Foreign key to auth.users table |
| name | String | Display name |
| age | Number | User age |
| gender | Enum | male, female, other |
| location | String | General location description |
| prefecture | String | Japan prefecture (47 options) |
| golf_skill_level | Enum | ビギナー, 中級者, 上級者, プロ |
| average_score | Number | Average golf score |
| bio | String | Self-introduction text |
| profile_pictures | Array | URLs to profile images |
| is_verified | Boolean | KYC verification status |
| kyc_status | Enum | not_started, pending_review, approved, retry, rejected |
| last_login | Timestamp | Last login time |
| last_active_at | Timestamp | Last activity timestamp |
| blood_type | String | Blood type |
| height | String | Height |
| body_type | String | Body type description |
| smoking | String | Smoking habit |
| golf_experience | String | Years of golf experience |
| best_score | String | Best golf score |
| transportation | String | Transportation method |
| available_days | String | Available days for golf |

#### Post

Social media content shared by users.

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| user_id | UUID | Foreign key to profiles |
| content | String | Post text content |
| images | Array | Image URLs |
| videos | Array | Video URLs |
| aspect_ratio | Number | Media aspect ratio (1.0 square, 0.8 portrait, 1.91 landscape) |
| reactions_count | Number | Total thumbs-up reactions |
| comments | Number | Comment count |
| hasReacted | Boolean | Whether current user reacted |
| created_at | Timestamp | Creation time |
| updated_at | Timestamp | Last update time |

#### Match

Represents a mutual like between two users.

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| user1_id | UUID | First user profile ID |
| user2_id | UUID | Second user profile ID |
| matched_at | Timestamp | When match was created |
| seen_by_user1 | Boolean | Whether user1 has seen the match celebration |
| seen_by_user2 | Boolean | Whether user2 has seen the match celebration |
| is_active | Boolean | Whether match is active |
| last_message_at | Timestamp | Last message timestamp |

#### Message

Chat messages between matched users.

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| chat_id | UUID | Foreign key to chat |
| sender_id | UUID | Sender profile ID |
| receiver_id | UUID | Receiver profile ID |
| text | String | Message content |
| type | Enum | text, image, emoji, video |
| imageUri | String | Image/video URL for media messages |
| timestamp | Timestamp | Message creation time |
| isRead | Boolean | Read status |
| created_at | Timestamp | Creation time |

#### UserLike

Records user interactions (likes, super likes, passes).

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| liker_user_id | UUID | User who initiated the interaction |
| liked_user_id | UUID | Target user |
| type | Enum | like, super_like, pass |
| is_active | Boolean | Whether interaction is active |
| created_at | Timestamp | Interaction time |

#### Availability

User's available days for golf.

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| user_id | UUID | Profile ID |
| date | Date | Available date |
| is_available | Boolean | Availability status |
| time_slots | Array | Available time slots |
| notes | String | Additional notes |

### Database Relationships

```
auth.users (Supabase Auth)
    │
    └──> profiles (user_id FK)
            │
            ├──> posts (user_id FK)
            │     └──> post_reactions (post_id FK, user_id FK)
            │
            ├──> user_likes (liker_user_id FK, liked_user_id FK)
            │
            ├──> matches (user1_id FK, user2_id FK)
            │     └──> messages (match participants)
            │
            ├──> availability (user_id FK)
            │
            ├──> kyc_submissions (user_id FK)
            │
            ├──> blocks (blocker_id FK, blocked_id FK)
            │
            └──> reports (reporter_id FK, reported_user_id FK)
```

---

## Functional Areas Documentation

### 1. Authentication System

#### Purpose
Manages user authentication and session management across multiple identity providers.

#### Components

**AuthService** (`src/services/authService.ts`)

Core authentication service handling all auth operations.

Key Methods:

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| sendOTP | phoneNumber: string | PhoneAuthResult | Sends OTP code to phone |
| verifyOTP | phoneNumber: string, token: string | OTPVerificationResult | Verifies OTP and creates session |
| signInWithEmail | email: string, password: string | AuthResult | Email/password authentication |
| signUpWithEmail | email: string, password: string | AuthResult | Creates new account with email |
| signInWithGoogle | none | AuthResult | Initiates Google OAuth flow |
| signInWithApple | none | AuthResult | Initiates Apple Sign-In flow |
| linkEmail | email: string, password: string | IdentityLinkResult | Links email identity to account |
| linkPhone | phoneNumber: string | IdentityLinkResult | Links phone identity to account |
| signOut | none | AuthResult | Signs out current user |
| deleteAccount | none | AuthResult | Permanently deletes user account |

**AuthContext** (`src/contexts/AuthContext.tsx`)

React Context providing authentication state globally.

Exposed State and Methods:

- user: Supabase auth user object
- session: Current session
- loading: Authentication initialization status
- profileId: Mapped profile ID from profiles table
- All AuthService methods as bound functions

**UserMappingService** (`src/services/userMappingService.ts`)

Critical service that maps Supabase auth.users.id to profiles.id with caching and retry logic.

Key Method:

| Method | Returns | Description |
|--------|---------|-------------|
| getProfileIdFromAuth | Promise | Retrieves profile ID for authenticated user with retry mechanism |

#### Authentication Flow

1. User selects authentication method
2. AuthService initiates authentication (OTP, email, OAuth)
3. Upon success, Supabase returns session and auth user
4. AuthContext detects auth state change
5. UserMappingService fetches corresponding profile ID with retries
6. Profile ID is cached and exposed through AuthContext
7. Application uses profileId for all data operations

#### Error Handling

All authentication errors are translated to user-friendly Japanese messages via authErrorTranslator utility. Common errors handled:

- Invalid credentials
- Network failures
- OTP expiration
- Duplicate account
- Invalid phone number format
- OAuth cancellation

#### Performance Considerations

- Session persistence in AsyncStorage for automatic re-authentication
- Automatic token refresh when app returns to foreground
- Retry logic for profile ID mapping (up to 3 attempts with exponential backoff)
- Cache invalidation on logout to prevent stale data

---

### 2. User Profile Management

#### Purpose
Manages user profile data, including personal information, golf statistics, photos, and verification status.

#### Components

**ProfilesService** (`src/services/supabase/profiles.service.ts`)

Service for profile CRUD operations.

Key Methods:

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| getProfile | userId: string | ServiceResponse | Retrieves profile by ID |
| getProfileByLegacyId | legacyId: string | ServiceResponse | Retrieves profile by legacy ID |
| getProfileByEmail | email: string | ServiceResponse | Retrieves profile by email |
| searchProfiles | filters: SearchFilters, page: number, limit: number, sortBy: string | PaginatedServiceResponse | Searches profiles with filters |
| updateProfile | userId: string, updates: Partial | ServiceResponse | Updates profile fields |
| getCurrentUserProfile | none | ServiceResponse | Gets authenticated user's profile |
| subscribeToProfile | userId: string, callback: Function | Unsubscribe function | Real-time profile updates |

**EditProfileScreen** (`src/screens/EditProfileScreen.tsx`)

UI for editing user profile information.

Features:
- Multi-section form (basic info, golf info, bio)
- Image picker for profile photos (up to 6 photos)
- Image validation and compression
- Real-time form validation
- Auto-save on field blur
- Profile completion percentage calculation

**UserProfileScreen** (`src/screens/UserProfileScreen.tsx`)

Displays other users' profiles with interaction options.

Features:
- Profile photo carousel
- Golf statistics display
- Like/Pass interaction buttons
- Report/Block options
- Calendar availability view
- Post history integration

#### Profile Data Structure

The UserProfile interface provides a hierarchical view:

- basic: name, age, gender, prefecture, blood type, height, body type, smoking
- golf: experience, skill level, average score, best score, transportation, available days
- bio: self-introduction text
- profile_pictures: array of image URLs
- status: verification status, premium status, last login

#### Search and Filtering

SearchFilters interface supports:

| Filter | Type | Description |
|--------|------|-------------|
| age_decades | Array | Multiple age ranges (20s, 30s, 40s, etc.) |
| prefecture | String | Single prefecture selection |
| golf_skill_level | String | Skill level filter |
| gender | Enum | Target gender (internally used for opposite-gender matching) |
| average_score_max | Number | Maximum average score threshold |
| last_login_days | Number | Last login within X days |

Implementation uses PostgreSQL's .or() operator for multi-decade age filtering and .gte()/.lte() for range queries.

#### Performance Considerations

- Profile caching with 10-minute stale time in React Query
- Image compression before upload to reduce storage costs
- Lazy loading of profile photos in carousel
- Optimized Supabase queries selecting only required fields
- Real-time subscriptions for profile updates only when viewing specific profile

---

### 3. Matching System

#### Purpose
Facilitates user discovery, liking, and mutual matching based on preferences and filters.

#### Components

**MatchesService** (`src/services/supabase/matches.service.ts`)

Handles matching logic and user interactions.

Key Methods:

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| likeUser | likerUserId: string, likedUserId: string | ServiceResponse | Records a like, creates match if mutual |
| superLikeUser | likerUserId: string, likedUserId: string | ServiceResponse | Records a super like |
| passUser | likerUserId: string, likedUserId: string | ServiceResponse | Records a pass interaction |
| unlikeUser | likerUserId: string, likedUserId: string | ServiceResponse | Removes like and match if exists |
| getUserLikes | userId: string | ServiceResponse | Gets all likes sent by user |
| getMatches | userId: string | ServiceResponse | Gets all matches for user |
| checkMutualLike | user1Id: string, user2Id: string | ServiceResponse | Checks if two users have liked each other |
| getUnseenMatches | userId: string | ServiceResponse | Gets matches not yet seen by user |
| markMatchAsSeen | matchId: string, userId: string | ServiceResponse | Marks match celebration as viewed |

**MatchContext** (`src/contexts/MatchContext.tsx`)

Manages match celebration modal and real-time match notifications.

Features:
- Real-time subscription to new match events
- Queues multiple matches for sequential display
- Prevents duplicate match popups within session
- Tracks which matches have been shown
- Provides navigation to chat upon match acceptance

**MatchingScreen** (`src/screens/MatchingScreen.tsx`)

Card-based interface for browsing recommended users.

Features:
- Infinite scroll of recommended users
- Like/Pass swipe gestures
- Real-time interaction state updates
- Filters out already-interacted users
- Toast notifications for successful interactions

**SearchScreen** (`src/screens/SearchScreen.tsx`)

Advanced search with filters and tabs.

Features:
- Recommended users tab (algorithmic)
- Registration order tab (newest first)
- Multi-criteria filtering
- Filter persistence
- Gender-based filtering for opposite-gender matching
- Paginated results with infinite scroll

#### Matching Algorithm

Recommended users are determined by:
1. Excluding users already liked, passed, or blocked
2. Gender filtering (opposite gender preferred)
3. Activity level (recent login preferred)
4. Location proximity (prefecture-based)
5. Skill level compatibility

#### Mutual Matching Flow

1. User A likes User B → user_likes record created with type='like'
2. User B likes User A → Second user_likes record created
3. MatchesService.likeUser detects mutual like
4. Match record created with both user IDs
5. Real-time notification sent to both users via Supabase channels
6. MatchContext displays celebration modal
7. Match marked as seen after user interaction

#### Batch Mutual Likes Optimization

useBatchMutualLikes hook (`src/hooks/queries/useMutualLikes.ts`) efficiently checks mutual like status for multiple users in a single query to reduce database calls.

---

### 4. Messaging System

#### Purpose
Enables real-time chat between matched users with support for text, images, and videos.

#### Components

**MessagesService** (`src/services/supabase/messages.service.ts`)

Handles message operations and real-time chat.

Key Methods:

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| getChatMessages | chatId: string | ServiceResponse<Message[]> | Retrieves all messages in a chat |
| sendMessage | chatId, senderId, receiverId, text, type, imageUri | ServiceResponse<Message> | Sends a new message |
| markAsRead | messageId: string | ServiceResponse<void> | Marks message as read |
| getMessagePreviews | userId: string | ServiceResponse<MessagePreview[]> | Gets recent message preview for each chat |
| getOrCreateChatBetweenUsers | user1Id, user2Id, matchId | ServiceResponse<string> | Gets existing chat or creates new one |
| getChatIdForMatch | matchId: string | ServiceResponse<string> | Gets chat ID from match |
| subscribeToChat | chatId: string, callback: Function | Unsubscribe function | Real-time message updates |

**ChatScreen** (`src/screens/ChatScreen.tsx`)

One-on-one chat interface.

Features:
- Real-time message synchronization via Supabase subscriptions
- Text input with auto-growing text area
- Image picker for photo sharing
- Video picker with compression
- Read receipts
- Typing indicators (planned)
- Message timestamp grouping
- Auto-scroll to latest message
- Keyboard-aware layout

**MessagesScreen** (`src/screens/MessagesScreen.tsx`)

Inbox view showing all chat conversations.

Features:
- Message preview list with last message
- Unread count badges
- Time-based message grouping (today, yesterday, older)
- Pull-to-refresh
- Navigation to individual chats
- Empty state for no conversations

#### Message Types

| Type | Description | Additional Fields |
|------|-------------|------------------|
| text | Plain text message | None |
| image | Image attachment | imageUri: URL to uploaded image |
| emoji | Emoji-only message | None (text contains emoji) |
| video | Video attachment | imageUri: URL to uploaded video |

#### Real-time Synchronization

Messages use Supabase real-time subscriptions on the messages table:
- Filters by chat_id to receive only relevant messages
- Automatically updates UI when new messages arrive
- Handles message read status updates
- Manages typing indicators (future enhancement)

#### Message Delivery Flow

1. User types message and hits send
2. Message saved to Supabase messages table
3. Supabase triggers real-time event
4. Both users' clients receive new message event
5. Message appears in chat UI
6. Receiver's chat updates with new message preview
7. When receiver opens chat, markAsRead is called
8. Read receipt updates in sender's UI

#### Media Handling

Images and videos are:
1. Selected via Expo ImagePicker
2. Validated for size and format
3. Compressed using react-native-compressor (videos) or expo-image-manipulator (images)
4. Uploaded to Supabase Storage
5. URL stored in message.imageUri field
6. Displayed in chat using cached image components

#### Performance Considerations

- Message pagination to limit initial load (20 messages per page)
- Image lazy loading with expo-image
- Video thumbnail generation
- Message caching with React Query (10-minute stale time)
- Efficient real-time subscription management (unsubscribe on unmount)
- Debounced typing indicators to reduce network calls

