# Phase 3 Activation Checklist
## When to Enable Each Feature

This document outlines when and how to activate Phase 3 features as you scale.

---

## Current Status: ✅ Safe to Deploy

All Phase 3 code is **dormant** and won't affect current functionality:
- No Phase 3 imports in main app code
- No additional dependencies loaded
- No infrastructure costs
- Zero performance impact

---

## Activation Timeline

### Activate Immediately (Free Tier)

#### 1. Sentry Error Tracking

**When:** Before launch
**Why:** Catch production errors early
**Cost:** Free up to 5k events/month

```bash
# 1. Sign up: https://sentry.io
# 2. Create React Native project
# 3. Get DSN from settings
# 4. Add environment variable:
eas secret:create --scope project --name EXPO_PUBLIC_SENTRY_DSN --value "YOUR_DSN"

# 5. In App.tsx, add before rendering:
import { initializeSentry } from './src/services/monitoring/sentryService';
initializeSentry();
```

**Verify:**
```typescript
// Test error tracking
import { captureError } from './src/services/monitoring/sentryService';
captureError('Test error');
// Check Sentry dashboard for the error
```

---

### Activate at 20k-50k Users

#### 2. Redis Caching

**Trigger:** When you notice:
- Database CPU > 50%
- Slow API responses
- High egress costs

**Cost:** $10-20/month (Upstash free tier available)

```bash
# 1. Create Redis at https://upstash.com
# 2. Get connection URL
# 3. Add environment variable:
eas secret:create --scope project --name EXPO_PUBLIC_REDIS_URL --value "redis://..."

# 4. Install dependency:
npm install ioredis

# 5. Uncomment code in:
#    src/services/caching/cacheAbstraction.ts
#    Lines 68-159 (RedisCacheBackend class)
#    Lines 216-302 (HybridCacheBackend class)

# 6. Update line 306:
# FROM: return new LocalCacheBackend();
# TO:   return new HybridCacheBackend(redisUrl);
```

**Verify:**
```typescript
import { unifiedCache } from './src/services/caching/cacheAbstraction';
await unifiedCache.set('test', 'value');
const value = await unifiedCache.get('test');
console.log('Redis working:', value === 'value');
```

---

### Activate at 50k-100k Users

#### 3. CDN for Media

**Trigger:** When you notice:
- High storage egress costs (> $50/month)
- Slow image loading during peak hours
- Storage bandwidth limits reached

**Cost:** $5-20/month (Cloudflare R2 with Japan region)

**Recommended: Cloudflare R2 (Japan Region)**
```bash
# 1. Sign up: https://cloudflare.com
# 2. Create R2 bucket in Asia Pacific region
# 3. Enable Cloudflare Images
# 4. Upload existing images to Cloudflare
# 5. Add environment variables:
eas secret:create --scope project --name EXPO_PUBLIC_CDN_PROVIDER --value "cloudflare"
eas secret:create --scope project --name EXPO_PUBLIC_CLOUDFLARE_ACCOUNT_HASH --value "YOUR_HASH"
```

**Alternative: Keep Supabase Storage**
Supabase storage already has good performance in Asia-Pacific region.
CDN may not be necessary unless egress costs become significant.

**Update code:**
```typescript
// In components using images, replace:
<Image source={{ uri: user.profile_pictures[0] }} />

// With:
import { getCdnImageUrl } from './src/services/cdnService';
<Image source={{ uri: getCdnImageUrl(user.profile_pictures[0], 'avatar') }} />
```

---

### Activate at 100k+ Users

#### 4. Read Replicas

**Trigger:** When you notice:
- Database CPU > 70%
- Query latency > 500ms
- Read queries dominating load

**Cost:** Included in Supabase Pro ($25/month)

```bash
# 1. In Supabase Dashboard → Database → Read Replicas
# 2. Deploy replica in Japan region:
#    - Asia Pacific (Tokyo) - main read replica
#    - Optional: Osaka for high availability
# 3. Get connection URLs from dashboard
# 4. Add environment variables:
eas secret:create --scope project --name EXPO_PUBLIC_REPLICA_1_URL --value "https://xxx-tokyo.supabase.co"
eas secret:create --scope project --name EXPO_PUBLIC_REPLICA_1_KEY --value "xxx"

# Optional second replica:
eas secret:create --scope project --name EXPO_PUBLIC_REPLICA_2_URL --value "https://xxx-osaka.supabase.co"
eas secret:create --scope project --name EXPO_PUBLIC_REPLICA_2_KEY --value "xxx"
```

**No code changes needed** - ReadReplicaRouter auto-detects replicas.

**Verify:**
```typescript
import { readReplicaRouter } from './src/services/database/readReplicaRouter';
console.log('Replicas:', readReplicaRouter.getStats());
```

---

#### 5. Background Jobs (Server-side)

**Trigger:** When you need:
- Video transcoding
- Image processing
- Batch email sending
- Heavy analytics

**Use Supabase Edge Functions:**
```bash
# 1. Create function
supabase functions new job-processor

# 2. Deploy
supabase functions deploy job-processor

# 3. Update backgroundJobQueue to call edge function instead
```

---

## ⚠️ Important: Keep Phase 3 Code Clean

### DO NOT:
- ❌ Import Phase 3 services in main app code yet
- ❌ Call `initializeSentry()` without DSN configured
- ❌ Enable MonitoringDashboard in main navigation

### DO:
- ✅ Keep Phase 3 code in codebase
- ✅ Test locally when needed
- ✅ Update when libraries change
- ✅ Document any modifications

---

## 🧪 How to Test Phase 3 Locally

You can test Phase 3 features locally without infrastructure:

```typescript
// Test rate limiting
import { rateLimitService } from './src/services/rateLimitService';
for (let i = 0; i < 50; i++) {
  console.log(`Request ${i}:`, rateLimitService.isAllowed('test'));
}

// Test cache
import { optimizedCache } from './src/services/optimizedCacheService';
await optimizedCache.set('test', { data: 'value' });
console.log('Cached:', await optimizedCache.get('test'));
console.log('Stats:', optimizedCache.getStats());

// Test job queue
import { backgroundJobQueue, registerCommonHandlers } from './src/services/backgroundJobQueue';
registerCommonHandlers();
await backgroundJobQueue.addJob('analytics', { event: 'test' });
console.log('Queue stats:', backgroundJobQueue.getQueueStats());
```

---

## 📊 Monitoring Before Phase 3

Even without Sentry, you can monitor:

```typescript
// In __DEV__ mode, log performance
import { performanceMonitor } from './src/utils/performanceMonitoring';

// In App.tsx or debug screen
if (__DEV__) {
  setInterval(() => {
    performanceMonitor.logReport();
  }, 60000); // Every minute
}
```

---

## 🚦 Activation Decision Matrix

| Metric | Threshold | Action |
|--------|-----------|--------|
| **Active users** | > 10k | ✅ You're ready (Phase 1-2 active) |
| **Active users** | > 50k | Activate Redis |
| **Database CPU** | > 70% | Activate read replicas |
| **Storage egress** | > $50/month | Activate CDN |
| **Error rate** | > 0.5% | Activate Sentry (should be immediate) |
| **API latency p95** | > 500ms | Activate Redis + CDN |
| **Job queue backlog** | > 100 | Move to server-side jobs |

---

## ✅ Summary

**Current state:** All optimization code is ready but dormant
**Cost:** $0 additional (just Supabase Pro $25)
**Performance:** Already optimized for 10k-50k users
**Future:** Flip environment variables to activate when needed

You're in the **perfect position** - prepared for scale without premature optimization costs.
