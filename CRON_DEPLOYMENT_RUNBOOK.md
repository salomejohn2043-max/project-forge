# Production Cron Deployment Runbook

## Pre-Deployment (24 hours before)

### 1. Security Audit
- [ ] CRON_SECRET generated (32+ chars)
- [ ] CRON_SECRET not committed to git
- [ ] SUPABASE_ADMIN_KEY configured in secrets
- [ ] HTTPS enforced for all cron endpoints
- [ ] Firewall rules allow internal cron calls

### 2. Code Review
- [ ] All cron files committed to git
- [ ] No hardcoded secrets in code
- [ ] Error handling in place
- [ ] Logging configured
- [ ] Retry logic tested

### 3. Database Preparation
- [ ] Supabase migration applied (group_orders table ready)
- [ ] Backups current
- [ ] Connection pool sized for cron load
- [ ] RLS policies correct for admin key

### 4. External Service Setup
- [ ] [ ] Google Cloud Scheduler account ready
  OR [ ] AWS account ready
  OR [ ] Easycron account ready
- [ ] Cron schedule validated (hourly: 0 * * * *)
- [ ] Retry policy configured (3 max retries)
- [ ] Timeout set (5 minutes = 300s)

---

## Deployment Day

### 1. Pre-Production Checks (30 minutes before)
```bash
# Verify git status
git status  # Should be clean

# Run tests
npm run test

# Build production bundle
npm run build

# Check for errors
npm run lint
```

### 2. Environment Setup
```bash
# Verify .env variables
grep "CRON_SECRET\|CRON_TIMEOUT\|CRON_MAX_RETRIES\|SUPABASE_ADMIN_KEY" .env

# Verify values are not placeholders
# CRON_SECRET should be 64+ character hex string
# SUPABASE_ADMIN_KEY should start with "eyJ"
```

### 3. Staging Deployment
```bash
# Deploy to staging environment
npm run deploy:staging

# Wait for deployment to complete
# Check CloudFlare Pages deployment status
```

### 4. Staging Tests (15 minutes)
```bash
# Test health check
curl -X GET https://staging.your-domain.com/api/cron/health

# Expected response:
# {
#   "success": true,
#   "jobId": "health-check",
#   "executedAt": "...",
#   "duration": 0,
#   "message": "Cron infrastructure is healthy"
# }

# Test manual trigger
curl -X POST "https://staging.your-domain.com/api/cron/group-orders/reconcile?secret=YOUR_SECRET&timestamp=$(date +%s)&retryCount=0"

# Expected response:
# {
#   "success": true,
#   "jobId": "group-order-reconcile-...",
#   "executedAt": "...",
#   "duration": <milliseconds>,
#   "message": "Cron job \"group-order-reconciliation\" completed successfully"
# }

# Check logs for errors
# Monitor staging app logs for 5 minutes
```

### 5. Production Deployment
```bash
# Create git tag for this deployment
git tag -a "cron-v1.0.0-$(date +%Y%m%d)" -m "Production cron deployment"
git push origin "cron-v1.0.0-$(date +%Y%m%d)"

# Deploy to production
npm run deploy:production

# Verify deployment completed
# Check CloudFlare Pages status
```

### 6. Post-Deployment Verification (15 minutes)

```bash
# Test production endpoints
curl -X GET https://your-domain.com/api/cron/health

# Check database connections
# Monitor: Supabase Connection Pool status

# Verify logs showing cron execution
# Check application logs for [CRON] messages
```

### 7. Schedule Cron Job

**In Google Cloud Scheduler:**
```
1. Go to Cloud Scheduler
2. Create Job
3. Name: kisii-eats-group-order-reconciliation
4. Frequency: 0 * * * *
5. Timezone: Africa/Nairobi (or your timezone)
6. HTTP Target:
   - Method: POST
   - URL: https://your-domain.com/api/cron/group-orders/reconcile
   - Query params: ?secret=CRON_SECRET&timestamp=TIMESTAMP&retryCount=0
7. Retry config:
   - Max retries: 3
   - Backoff: Exponential
   - Initial backoff: 4s
   - Max backoff: 60s
   - Deadline: 600s
8. Save
```

OR **In AWS EventBridge:**
```
1. Go to EventBridge
2. Create rule
3. Name: kisii-eats-cron
4. Event source: Schedule
5. Rate: rate(1 hour)
6. Target: Lambda function (set env var CRON_SECRET)
7. Create
```

### 8. Monitoring Setup

**Set up alerts for:**
- [ ] Cron job failed (status = 'failed')
- [ ] Execution time > 4 minutes
- [ ] Health check failing
- [ ] Missing reconciled orders
- [ ] Database connection errors

**Tools:**
- Sentry: Errors and exceptions
- DataDog: Performance metrics
- CloudWatch: AWS Lambda execution
- Stackdriver: Google Cloud Scheduler runs

---

## Post-Deployment (First 24 Hours)

### Hour 1: Continuous Monitoring
- [ ] Monitor application logs for errors
- [ ] Check database query performance
- [ ] Verify no RLS violations
- [ ] Check connection pool usage

### Hour 2-4: Wait for First Cron Run
- [ ] If cron runs at :00 hour, wait until then
- [ ] Monitor logs during execution
- [ ] Verify reconciliation succeeded
- [ ] Check group_orders table updated

### Hour 4-24: Extended Monitoring
- [ ] Log analysis every 2 hours
- [ ] Performance metrics (latency, memory)
- [ ] Database connection pool health
- [ ] Zero errors in cron logs

### Checklist
- [ ] Cron executed successfully at least once
- [ ] Group orders reconciled properly
- [ ] No SQL errors in logs
- [ ] No auth/secret errors
- [ ] Response times < 2 minutes
- [ ] Memory usage stable
- [ ] Database connections not exhausted

---

## Rollback Plan

**If critical issues detected:**

### Immediate Actions (< 5 minutes)
```bash
# 1. Stop scheduler from external service
# Option A: Google Cloud Scheduler - Pause job
# Option B: AWS EventBridge - Disable rule
# Option C: Easycron - Pause job

# 2. Revert to previous code
git revert HEAD~1
npm run build
npm run deploy:production

# 3. Verify old version deployed
curl -X GET https://your-domain.com/api/cron/health
# Should now return different jobId or error about missing endpoint if old version
```

### Database Rollback (if needed)
```sql
-- If group_orders were incorrectly reconciled:
UPDATE group_orders 
SET status = 'active' 
WHERE status = 'closed' 
  AND updated_at > NOW() - INTERVAL '1 hour'
  AND NOT reconciled_correctly; -- Adjust condition as needed
```

### Post-Rollback
- [ ] Notify team of rollback
- [ ] Document what went wrong
- [ ] Fix issues in code
- [ ] Redeploy after fixes
- [ ] Test thoroughly before next production run

---

## Verification Checklist

### Before Going Live
- [ ] `src/lib/cron.ts` exists and exports all functions
- [ ] `src/routes/api/cron/group-orders/reconcile.tsx` exists
- [ ] `src/routes/api/cron/health.tsx` exists
- [ ] `.env` has CRON_SECRET (64+ hex chars)
- [ ] `.env` has SUPABASE_ADMIN_KEY
- [ ] CRON_SECRET not in git history
- [ ] SUPABASE_ADMIN_KEY not in git history

### Runtime Verification
- [ ] `/api/cron/health` returns 200
- [ ] `/api/cron/group-orders/reconcile?secret=X...` returns 200
- [ ] Invalid secret returns 200 with `success: false`
- [ ] Logs show `[CRON]` markers
- [ ] Database connections stable
- [ ] No RLS permission errors

### External Service Verification
- [ ] Google Cloud Scheduler shows job active
- [ ] AWS EventBridge shows rule enabled
- [ ] Easycron shows cron executing
- [ ] Cron executes at scheduled time
- [ ] Cron completes before timeout (< 5min)

---

## Troubleshooting During Deployment

### Issue: 401 Unauthorized
```
Cause: Wrong CRON_SECRET
Fix: Verify .env CRON_SECRET matches value in scheduler
```

### Issue: 408 Timeout
```
Cause: Cron job took > 5 minutes
Fix: Optimize database queries or increase CRON_TIMEOUT_MS
```

### Issue: Health check works, reconciliation fails
```
Cause: Supabase admin key not configured or RLS issue
Fix: Verify SUPABASE_ADMIN_KEY in environment
    Verify RLS policies allow admin key operations
```

### Issue: Cron never executes
```
Cause: Scheduler not triggering or network blocked
Fix: Manually test: curl -X POST https://your-domain.com/api/cron/...
    Check firewall outbound rules
    Verify timezone in scheduler
```

---

## Contact & Escalation

**Primary On-Call:**
- Name: _______________
- Slack: _______________
- Phone: _______________

**Secondary On-Call:**
- Name: _______________
- Slack: _______________
- Phone: _______________

**Escalation (if both unavailable):**
- Name: _______________
- Slack: _______________
- Phone: _______________

---

## Sign-Off

| Role | Name | Date | Time | Status |
|------|------|------|------|--------|
| DevOps | _____ | ___ | __:__ | ☐ Approved |
| QA | _____ | ___ | __:__ | ☐ Approved |
| Tech Lead | _____ | ___ | __:__ | ☐ Approved |

---

**Document Version:** 1.0  
**Last Updated:** 2026-06-05  
**Next Review:** 2026-07-05
