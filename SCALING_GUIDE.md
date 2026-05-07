# Golfmatch Scaling Guide
## From 10k to 100k+ Users

This guide covers the infrastructure setup needed to scale Golfmatch to 100,000+ concurrent users.

---

## Phase 3 Implementation Status

### ✅ Code Ready
All Phase 3 code is implemented and ready to activate:
- ✅ Sentry APM integration
- ✅ Redis-ready cache abstraction
- ✅ CDN service layer
- ✅ Read replica routing
- ✅ Background job queue
- ✅ Health monitoring system

### 🔧 Infrastructure Required
The following infrastructure needs to be deployed:

---

## 1. Sentry Setup (Error Tracking & APM)

### Cost: Free tier → $26/month (100k users)

### Setup:
```bash
# 1. Create Sentry account at https://sentry.io
# 2. Create new React Native project
# 3. Get your DSN from project settings
# 4. Add to environment variables
```

### Environment Variables:
```bash
EXPO_PUBLIC_SENTRY_DSN=https://xxx@xxx.ingest.sentry.io/xxx
EXPO_PUBLIC_APP_VERSION=1.0.0
EXPO_PUBLIC_BUILD_NUMBER=1
```

### Initialize in App.tsx:
```typescript
import { initializeSentry } from './src/services/monitoring/sentryService';

// Before app render
initializeSentry();
```

---

## 2. Redis Setup (Shared Caching)

### Cost: $10-50/month (Upstash, Railway, or Supabase)

### Option A: Upstash (Recommended for mobile apps)
```bash
# 1. Create account at https://upstash.com
# 2. Create Redis database
# 3. Get connection URL
```

### Option B: Supabase Redis (Coming soon)
```bash
# Integrated with your Supabase project
# No additional setup needed
```

### Environment Variable:
```bash
EXPO_PUBLIC_REDIS_URL=redis://default:xxx@xxx.upstash.io:6379
```

### Enable in code:
Uncomment the `RedisCacheBackend` class in:
- `src/services/caching/cacheAbstraction.ts`

### Install dependency:
```bash
npm install ioredis
```

---

## 3. CDN Setup (Media Delivery)

### Cost: $5-20/month (Cloudflare) or pay-per-use (CloudFront)

### Option A: Cloudflare Images (Recommended)
```bash
# 1. Sign up at https://cloudflare.com
# 2. Enable Cloudflare Images
# 3. Get account hash from dashboard
# 4. Configure custom domain (optional)
```

**Setup:**
```bash
EXPO_PUBLIC_CDN_PROVIDER=cloudflare
EXPO_PUBLIC_CLOUDFLARE_ACCOUNT_HASH=your_account_hash
EXPO_PUBLIC_CDN_BASE_URL=https://imagedelivery.net/your_hash
```

### Option B: AWS CloudFront
```bash
# 1. Create CloudFront distribution
# 2. Point origin to Supabase storage
# 3. Configure Lambda@Edge for image transforms
# 4. Get distribution domain
```

**Setup:**
```bash
EXPO_PUBLIC_CDN_PROVIDER=cloudfront
EXPO_PUBLIC_CLOUDFRONT_DOMAIN=xxx.cloudfront.net
EXPO_PUBLIC_CDN_BASE_URL=https://xxx.cloudfront.net
```

---

## 4. Read Replicas (Database Scaling)

### Cost: Included in Supabase Pro ($25/month)

### Setup in Supabase Dashboard:
1. Go to Database → Read Replicas
2. Deploy read replica in Japan region:
   - Asia Pacific (Tokyo) - primary replica for Japanese users
   - Optional: Osaka for redundancy
3. Get replica connection strings

### Environment Variables:
```bash
# Primary (already configured)
EXPO_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=xxx

# Replica 1 (Tokyo - primary read replica)
EXPO_PUBLIC_REPLICA_1_URL=https://xxx-replica-tokyo.supabase.co
EXPO_PUBLIC_REPLICA_1_KEY=xxx

# Replica 2 (Osaka - optional for redundancy)
EXPO_PUBLIC_REPLICA_2_URL=https://xxx-replica-osaka.supabase.co
EXPO_PUBLIC_REPLICA_2_KEY=xxx
```

**No code changes needed** - ReadReplicaRouter will automatically detect and use replicas.

---

## 5. Connection Pooling (PgBouncer)

### Cost: Included in Supabase (already enabled)

### Supabase Dashboard Setup:
1. Go to Database → Connection Pooling
2. Enable "Transaction mode" for better connection reuse
3. Set max connections: 100-200 (for 100k users)

### Note:
Supabase automatically uses PgBouncer in production. No client changes needed.

---

## 6. Background Job Processing (Server-side)

### For 100k+ users, move jobs to server

### Option A: Supabase Edge Functions
```bash
# 1. Create edge function for job processing
supabase functions new job-processor

# 2. Deploy
supabase functions deploy job-processor
```

### Option B: Inngest (Recommended for complex workflows)
```bash
# 1. Sign up at https://inngest.com
# 2. Install: npm install inngest
# 3. Create functions in /inngest
```

**Cost:** Free tier → $50/month (100k users)

---

## 7. Monitoring Dashboard (Optional but Recommended)

### Grafana + Prometheus
For real-time metrics visualization:

```bash
# Deploy monitoring stack
docker-compose up -d grafana prometheus

# Or use Grafana Cloud (free tier available)
```

### DataDog (Alternative)
Full-stack APM with mobile SDK:
- Cost: Free tier → $15/host/month
- Setup: https://docs.datadoghq.com/real_user_monitoring/reactnative/

---

## Environment Variables Summary

Add these to your `.env` and EAS secrets:

```bash
# Sentry (Error Tracking & APM)
EXPO_PUBLIC_SENTRY_DSN=https://xxx@xxx.ingest.sentry.io/xxx
EXPO_PUBLIC_APP_VERSION=1.0.0
EXPO_PUBLIC_BUILD_NUMBER=1

# Redis (Optional - for 50k+ users)
EXPO_PUBLIC_REDIS_URL=redis://default:xxx@xxx.upstash.io:6379

# CDN (Optional - for global users)
EXPO_PUBLIC_CDN_PROVIDER=cloudflare
EXPO_PUBLIC_CLOUDFLARE_ACCOUNT_HASH=xxx
EXPO_PUBLIC_CDN_BASE_URL=https://imagedelivery.net/xxx

# Read Replicas (Optional - for 100k+ users)
EXPO_PUBLIC_REPLICA_1_URL=https://xxx.supabase.co
EXPO_PUBLIC_REPLICA_1_KEY=xxx
EXPO_PUBLIC_REPLICA_2_URL=https://xxx.supabase.co
EXPO_PUBLIC_REPLICA_2_KEY=xxx
```

---

## Deployment Checklist

### Before Going to Production:

- [ ] Set up Sentry error tracking
- [ ] Configure environment variables in EAS
- [ ] Enable Supabase connection pooling
- [ ] Set up database backups (daily)
- [ ] Configure rate limiting on Supabase (if available)
- [ ] Set up uptime monitoring (UptimeRobot, Pingdom)
- [ ] Create runbook for incident response
- [ ] Load test with realistic traffic
- [ ] Set up alerts for error rates > 1%

### For 50k+ Users:

- [ ] Deploy Redis for shared caching
- [ ] Set up CDN for media delivery
- [ ] Enable database read replicas
- [ ] Move background jobs to server
- [ ] Set up auto-scaling (if using cloud infrastructure)

### For 100k+ Users:

- [ ] Add multiple read replicas in different regions
- [ ] Implement database sharding (if needed)
- [ ] Use dedicated IP for Supabase
- [ ] Set up load balancer
- [ ] Implement circuit breakers
- [ ] Add chaos engineering tests

---

## Monitoring URLs

Once deployed, access monitoring at:

- **Sentry Dashboard:** https://sentry.io/organizations/your-org
- **Supabase Dashboard:** https://app.supabase.com/project/xxx
- **Health Check:** `GET /api/health` (if you create API endpoint)

---

## Cost Estimate

| Users | Monthly Cost | Infrastructure |
|-------|-------------|----------------|
| 10k | $25 | Supabase Pro |
| 50k | $100-150 | + Redis + CDN |
| 100k | $300-500 | + Replicas + Monitoring |
| 500k+ | $1,000+ | Custom scaling needed |

---

## Performance Targets

With full Phase 3 deployment:

| Metric | Target | Current |
|--------|--------|---------|
| API latency (p95) | < 200ms | Optimized |
| Database query (p95) | < 100ms | Indexed |
| Cache hit rate | > 80% | LRU ready |
| Error rate | < 0.1% | Monitored |
| Uptime | > 99.9% | Auto-retry |

---

## Next Steps

1. **Immediate:** Set up Sentry for error tracking
2. **Before launch:** Configure all environment variables
3. **At 50k users:** Deploy Redis and CDN
4. **At 100k users:** Add read replicas
5. **Ongoing:** Monitor metrics and optimize

---

## Support

For infrastructure questions:
- Supabase: https://supabase.com/docs
- Sentry: https://docs.sentry.io
- Cloudflare: https://developers.cloudflare.com

For code questions, check the inline documentation in:
- `/src/services/monitoring/`
- `/src/services/caching/`
- `/src/services/database/`
