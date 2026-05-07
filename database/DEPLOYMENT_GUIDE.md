# Intelligent Recommendation Algorithm - Deployment Guide

## Overview
This guide explains how to deploy the intelligent recommendation algorithm for the おすすめ tab.

---

## ✅ What Was Implemented

### 1. Database Layer
- **File**: `database/migrations/20251203_intelligent_recommendations.sql`
- **Changes**:
  - Created performance indexes for availability, user_likes, and profiles tables
  - Created PostgreSQL RPC function `get_intelligent_recommendations()`
  - Scoring algorithm with 6 factors (110 points total)

### 2. Service Layer
- **File**: `src/services/supabase/profiles.service.ts`
  - Added `getIntelligentRecommendations()` method
- **File**: `src/services/supabaseDataProvider.ts`
  - Added wrapper method with 10-minute caching
- **File**: `src/types/dataModels.ts`
  - Added `recommendation_score` and `score_breakdown` fields to User interface

### 3. UI Layer
- **File**: `src/screens/SearchScreen.tsx`
  - Updated `loadUsers()` to call intelligent recommendations for おすすめ tab
- **File**: `src/screens/HelpDetailScreen.tsx`
  - Updated help documentation with Japanese explanation of algorithm

---

## 📋 Deployment Steps

### Step 1: Deploy Database Migration

1. **Open Supabase Dashboard**
   - Go to your project: https://supabase.com/dashboard
   - Navigate to: SQL Editor

2. **Run Migration**
   - Open file: `database/migrations/20251203_intelligent_recommendations.sql`
   - Copy the entire content
   - Paste into Supabase SQL Editor
   - Click "Run" to execute

3. **Verify Deployment**
   Run this test query (replace with actual user UUID):
   ```sql
   SELECT * FROM get_intelligent_recommendations(
     'your-user-uuid-here'::UUID,
     10,
     0
   );
   ```

   Expected result: List of users with recommendation_score and score_breakdown

### Step 2: Deploy Application Code

1. **Verify TypeScript Compilation**
   ```bash
   npm run tsc
   ```
   Expected: No type errors

2. **Test Locally** (if possible)
   ```bash
   npx expo start
   ```
   - Navigate to Search screen
   - Click おすすめ tab
   - Verify users load without errors

3. **Build and Deploy**
   ```bash
   # For iOS
   eas build --platform ios

   # For Android
   eas build --platform android
   ```

### Step 3: Verify in Production

1. **Test Recommendations**
   - Open app
   - Navigate to Search (さがす) screen
   - Switch to おすすめ tab
   - Verify users are displayed

2. **Check Logs**
   Look for these console logs:
   - `[ProfilesService] Getting intelligent recommendations for user ...`
   - `[ProfilesService] Retrieved X intelligent recommendations`
   - `[SupabaseDataProvider] Cached X intelligent recommendations`

3. **Verify Help Documentation**
   - Open Help (ヘルプ) screen
   - Navigate to 機能 → 検索機能の使い方
   - Verify detailed explanation is shown

---

## 🔍 Testing Checklist

### Functional Tests

- [ ] **おすすめ tab loads successfully**
  - No errors in console
  - Users are displayed

- [ ] **Scoring works correctly**
  - Users with similar calendar availability appear first
  - Skill level matching is visible in results
  - Location proximity affects ranking

- [ ] **Caching works**
  - First load: "Fetching intelligent recommendations from database"
  - Second load within 10 min: "Intelligent recommendations cache hit"

- [ ] **Fallback works**
  - If RPC function fails, users still see results
  - Error message is user-friendly: "ユーザーの読み込みに失敗しました"

- [ ] **登録順 tab still works**
  - Shows newest users first
  - No changes to existing behavior

- [ ] **Filters work**
  - When filters applied on おすすめ tab, uses standard search
  - Filter modal functions correctly

### Performance Tests

- [ ] **Query performance**
  - おすすめ tab loads in < 2 seconds
  - No app freezing or lag

- [ ] **Cache effectiveness**
  - Subsequent loads are faster
  - Cache invalidates after 10 minutes

### User Experience Tests

- [ ] **Help documentation**
  - Japanese explanation is clear and accurate
  - Scoring factors are well-explained
  - Users understand how to improve matches

- [ ] **No breaking changes**
  - Existing users see no errors
  - All other features work normally

---

## 🐛 Troubleshooting

### Issue: "RPC function does not exist"

**Cause**: Migration not deployed to Supabase

**Solution**:
1. Go to Supabase Dashboard → SQL Editor
2. Run migration file: `database/migrations/20251203_intelligent_recommendations.sql`
3. Verify with test query

### Issue: "No users returned"

**Possible causes**:
1. User has already interacted with all users
2. No users have set calendar availability
3. All users are inactive (> 90 days)

**Solution**:
- Check if fallback is working (should show random active users)
- Verify availability table has data:
  ```sql
  SELECT COUNT(*) FROM availability WHERE is_available = true;
  ```

### Issue: "Query is slow (> 2 seconds)"

**Cause**: Missing indexes or large dataset

**Solution**:
1. Verify indexes exist:
   ```sql
   SELECT * FROM pg_indexes WHERE tablename IN ('availability', 'profiles', 'user_likes');
   ```
2. Check query execution plan:
   ```sql
   EXPLAIN ANALYZE
   SELECT * FROM get_intelligent_recommendations('user-uuid'::UUID, 20, 0);
   ```
3. If > 50k users, consider materialized views (see plan document)

### Issue: "Cache not working"

**Cause**: CacheService not configured

**Solution**:
- Verify AsyncStorage permissions
- Check logs for cache errors
- Increase cache TTL if needed

---

## 📊 Monitoring & Metrics

### Key Metrics to Track

1. **Performance**
   - Average query time for recommendations
   - Cache hit rate
   - App responsiveness

2. **User Engagement**
   - Click-through rate on おすすめ tab
   - Like rate (recommendations vs registration)
   - Match rate (recommendations vs registration)

3. **Algorithm Effectiveness**
   - Distribution of recommendation scores
   - Calendar overlap success rate
   - User feedback / complaints

### Logging

Monitor these logs in production:
```
[ProfilesService] Getting intelligent recommendations for user {userId}
[ProfilesService] Retrieved {count} intelligent recommendations
[SupabaseDataProvider] Intelligent recommendations cache hit
[SupabaseDataProvider] Cached {count} intelligent recommendations
```

---

## 🚀 Post-Deployment

### Week 1: Monitor & Adjust

1. **Check error rates**
   - Look for RPC errors in Supabase logs
   - Monitor app crash reports

2. **Gather user feedback**
   - Are users seeing better matches?
   - Any confusion about the new algorithm?

3. **Analyze metrics**
   - Compare like/match rates before vs after
   - Check query performance distribution

### Week 2-4: Optimize

1. **Adjust scoring weights** (if needed)
   - If calendar overlap not working well, adjust point values
   - Update RPC function with new weights

2. **Add monitoring**
   - Set up alerts for slow queries (> 500ms)
   - Track recommendation quality metrics

3. **Plan enhancements**
   - Review APPENDIX A in plan document
   - Prioritize next features (badges, gender preference, etc.)

---

## 📝 Rollback Plan

If critical issues occur, follow this rollback procedure:

### Quick Rollback (UI only)

Revert SearchScreen.tsx change:
```typescript
// Change line 166 back to:
const response = await DataProvider.getRecommendedUsers(currentUserId, 20);
```

This reverts to simple exclusion-based recommendations.

### Full Rollback (Database + Code)

1. **Drop RPC function**:
   ```sql
   DROP FUNCTION IF EXISTS get_intelligent_recommendations;
   ```

2. **Revert code changes**:
   - Revert SearchScreen.tsx
   - Revert HelpDetailScreen.tsx
   - Keep type definitions (harmless)

3. **Redeploy app**

---

## ✨ Success Criteria

The deployment is successful if:

1. ✅ Query performance < 200ms for 10k users
2. ✅ Cache hit rate > 70%
3. ✅ Zero crashes related to recommendations
4. ✅ User engagement on おすすめ tab improves
5. ✅ Help documentation is clear and helpful

---

## 📞 Support

If you encounter issues during deployment:

1. Check Supabase logs for RPC errors
2. Review console logs for service errors
3. Test with multiple user accounts
4. Verify all indexes were created
5. Consult the plan document for detailed technical info

---

**Deployment Date**: 2025-12-03
**Version**: 1.0.0
**Status**: Ready for Production ✅
