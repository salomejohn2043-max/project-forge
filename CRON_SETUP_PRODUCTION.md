# Production Cron Setup Guide

Complete guide for setting up production-ready cron jobs for your SaaS platform.

---

## 🚀 Quick Start

### 1. Environment Variables (.env)

Your production `.env` should have:

```env
# Generated with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
CRON_SECRET="f8e3a9c2d7b1f4e6a9d2c5f8b3e1a7d4c6f9a2b5e8d1c4f7a9b2e5d8c1f4a7"

# Timeout in milliseconds (default: 5 minutes)
CRON_TIMEOUT_MS="300000"

# Maximum retry attempts (default: 3)
CRON_MAX_RETRIES="3"

# Supabase admin key (for cron jobs)
SUPABASE_ADMIN_KEY="your_supabase_service_role_key"
```

### 2. Generate Production Secret

```bash
# Option 1: Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Option 2: OpenSSL
openssl rand -hex 32

# Option 3: Python
python3 -c "import secrets; print(secrets.token_hex(32))"
```

Example output:
```
f8e3a9c2d7b1f4e6a9d2c5f8b3e1a7d4c6f9a2b5e8d1c4f7a9b2e5d8c1f4a7
```

### 3. Cron Endpoints

| Endpoint | Frequency | Purpose |
|----------|-----------|---------|
| `/api/cron/group-orders/reconcile` | Hourly | Reconcile closed group orders |
| `/api/cron/health` | Every 5 minutes | Verify cron infrastructure |

---

## 📋 Implementation Overview

### Security Features

✅ **HMAC Secret Validation** — All requests must include valid CRON_SECRET  
✅ **Timestamp Validation** — Prevents replay attacks (5-minute window)  
✅ **Retry Logic** — Automatic retry for transient failures  
✅ **Timeout Protection** — Prevents hanging jobs (5-minute default)  
✅ **Request Logging** — All executions logged for monitoring  

### Error Handling

```
Retryable Errors (auto-retry):
- Network timeouts
- Connection refused
- DNS resolution failures
- HTTP 429 (rate limit)
- HTTP 503 (service unavailable)

Non-Retryable Errors:
- Authentication failures
- Invalid secret
- HTTP 4xx (client errors)
- Validation errors
```

---

## 🔧 Setting Up External Cron Services

### Option 1: Google Cloud Scheduler (Recommended)

**Setup:**

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Enable Cloud Scheduler API
3. Create new job:

```
Name: kisii-eats-group-order-reconciliation
Frequency: 0 * * * * (hourly)
Timezone: Africa/Nairobi
```

4. Create HTTP target:

```
HTTP Method: POST
URL: https://your-domain.com/api/cron/group-orders/reconcile?secret=CRON_SECRET&timestamp=TIMESTAMP&retryCount=0
Headers:
  User-Agent: Google-Cloud-Scheduler
  Content-Type: application/json
Auth: (none - secret in URL)
```

5. Retry policy:

```
Retry count: 3
Backoff: Exponential (4s initial, 60s max)
Deadline: 600s
```

### Option 2: AWS EventBridge + Lambda

**Setup:**

1. Create EventBridge rule:

```
Rule name: kisii-eats-cron
Event source: Schedule expression
Rate: rate(1 hour)
```

2. Create Lambda function to call cron:

```javascript
exports.handler = async (event) => {
  const secret = process.env.CRON_SECRET;
  const timestamp = Math.floor(Date.now() / 1000);
  const url = `https://your-domain.com/api/cron/group-orders/reconcile?secret=${secret}&timestamp=${timestamp}&retryCount=0`;

  const response = await fetch(url, { method: 'POST' });
  return { statusCode: response.status, body: await response.text() };
};
```

3. Add environment variables to Lambda:

```
CRON_SECRET = f8e3a9c2d7b1f4e6a9d2c5f8b3e1a7d4c6f9a2b5e8d1c4f7a9b2e5d8c1f4a7
```

4. Set EventBridge target to Lambda function

### Option 3: Easycron (Simple, No Setup)

**Setup:**

1. Go to [Easycron.com](https://www.easycron.com)
2. Create cron job:

```
URL: https://your-domain.com/api/cron/group-orders/reconcile
Method: POST
Cron Expression: 0 * * * * (every hour)
Auth: (none)
Timeout: 300 seconds
Retries: 3
```

3. Manually add secret to URL:

```
https://your-domain.com/api/cron/group-orders/reconcile?secret=YOUR_SECRET&timestamp=TIMESTAMP&retryCount=0
```

### Option 4: Vercel Cron Functions (If Using Vercel)

Add to `vercel.json`:

```json
{
  "crons": [
    {
      "path": "/api/cron/group-orders/reconcile",
      "schedule": "0 * * * *"
    }
  ]
}
```

---

## 📊 Monitoring & Alerting

### Log Files

Cron executions are logged to:
- Console output in development
- Application logs in production
- Supabase SQL query logs (if enabled)

### Monitoring Setup (Example: Sentry)

```typescript
// In src/lib/cron.ts, replace logCronExecution:
export async function logCronExecution(log: CronLog): Promise<void> {
  try {
    // Send to Sentry
    if (typeof window === 'undefined') {
      const Sentry = await import('@sentry/node');
      Sentry.captureMessage(`Cron: ${log.jobType}`, {
        level: log.status === 'failed' ? 'error' : 'info',
        extra: log,
      });
    }
  } catch (error) {
    console.error('[CRON] Failed to log execution:', error);
  }
}
```

### Alert Rules

Create alerts for:
- ❌ Cron job failure (status = 'failed')
- ⏱️ Execution time > 4 minutes (threshold before timeout)
- 📊 Consecutive failures > 3
- 🔌 Health check endpoint returning false

---

## 🧪 Testing

### 1. Local Testing

```bash
# Start development server
npm run dev

# Test cron health check
curl -X GET http://localhost:5173/api/cron/health

# Test group order reconciliation (needs valid secret from .env)
curl -X POST "http://localhost:5173/api/cron/group-orders/reconcile?secret=YOUR_SECRET&timestamp=$(date +%s)&retryCount=0"
```

### 2. Staging Deployment

Before production, verify on staging:

```bash
# 1. Deploy to staging environment
npm run build
npm run deploy:staging

# 2. Test health check
curl -X GET https://staging.your-domain.com/api/cron/health

# 3. Manual trigger test
curl -X POST "https://staging.your-domain.com/api/cron/group-orders/reconcile?secret=STAGING_SECRET&timestamp=$(date +%s)&retryCount=0"

# 4. Monitor logs for 30 minutes
tail -f /var/log/app.log | grep CRON
```

### 3. Production Deployment

```bash
# 1. Update production .env
CRON_SECRET="YOUR_NEW_GENERATED_SECRET"

# 2. Deploy
npm run build
npm run deploy:production

# 3. Verify endpoints
curl -X GET https://your-domain.com/api/cron/health

# 4. Schedule in external service (Google Cloud Scheduler, AWS, etc.)
# 5. Monitor for first 24 hours
```

---

## 🔄 Retry Logic Flow

```
Request arrives
    ↓
Validate secret + timestamp
    ↓ (Invalid) → Return 400 + error message
    ↓ (Valid)
Execute job with timeout
    ↓
Success → Return 200
    ↓
Failure (transient) → Check retryCount
    ├→ retryCount < MAX_RETRIES → Return response with retryable=true
    └→ retryCount >= MAX_RETRIES → Return 500 + final error
    ↓
Failure (non-transient) → Return 400/403 (don't retry)
```

---

## 📈 Performance Tuning

### Timeout Configuration

```env
# Conservative (large volume, complex processing)
CRON_TIMEOUT_MS="600000"  # 10 minutes

# Standard (recommended)
CRON_TIMEOUT_MS="300000"  # 5 minutes

# Aggressive (simple, fast operations)
CRON_TIMEOUT_MS="120000"  # 2 minutes
```

### Batch Processing

For large datasets, process in batches:

```typescript
// Instead of processing all at once:
for (const batch of chunks(groupOrders, 100)) {
  await processBatch(batch);
  // Add delay between batches to prevent overwhelming database
  await new Promise(resolve => setTimeout(resolve, 1000));
}
```

---

## 🚨 Troubleshooting

| Issue | Cause | Solution |
|-------|-------|----------|
| 401 Unauthorized | Invalid CRON_SECRET | Verify secret matches .env |
| 408 Timeout | Job took > 5 minutes | Increase CRON_TIMEOUT_MS or optimize query |
| 403 Timestamp error | Request too old | Check server clock sync |
| 500 Database error | Connection pool exhausted | Add connection pooling, check DB health |
| No logs appearing | Logging not configured | Check console, CloudWatch, or Sentry |

---

## ✅ Production Checklist

- [ ] Generate strong CRON_SECRET (32+ character hex string)
- [ ] Configure CRON_SECRET in production environment
- [ ] Set SUPABASE_ADMIN_KEY for database access
- [ ] Deploy cron endpoints to production
- [ ] Configure external scheduler (Google Cloud, AWS, Easycron, etc.)
- [ ] Set up monitoring/alerting (Sentry, DataDog, etc.)
- [ ] Test health check endpoint
- [ ] Manual trigger test to verify functionality
- [ ] Monitor logs for first 24 hours
- [ ] Set up backup cron service (if critical)
- [ ] Document cron jobs in runbooks
- [ ] Set up on-call rotation for cron alerts

---

## 📚 Files Reference

| File | Purpose |
|------|---------|
| `src/lib/cron.ts` | Core cron utilities & helpers |
| `src/routes/api/cron/group-orders/reconcile.tsx` | Group order reconciliation job |
| `src/routes/api/cron/health.tsx` | Health check endpoint |
| `.env` | Configuration (CRON_SECRET, timeout, retries) |

---

## 🔐 Security Best Practices

1. **Never expose CRON_SECRET in frontend code**
   ```typescript
   // ❌ BAD
   const secret = import.meta.env.VITE_CRON_SECRET;
   
   // ✅ GOOD
   const secret = process.env.CRON_SECRET; // Server-only
   ```

2. **Use HTTPS only for cron endpoints**
   ```
   ✅ https://your-domain.com/api/cron/...
   ❌ http://your-domain.com/api/cron/...
   ```

3. **Rotate CRON_SECRET periodically**
   - Update every 90 days
   - Store in encrypted vault
   - Don't commit to git

4. **Whitelist cron service IPs** (optional additional layer)
   - Google Cloud: 199.36.153.4/30, 199.36.153.8/30
   - AWS EventBridge: [AWS IP ranges](https://docs.aws.amazon.com/general/latest/gr/aws-ip-ranges.html)

5. **Use Supabase admin key only for cron**
   - Create separate admin key just for cron jobs
   - Limit RLS policies to cron operations
   - Rotate admin keys every 180 days

---

## 📞 Support

For issues:
1. Check logs: `tail -f /var/log/app.log | grep CRON`
2. Test health endpoint: `/api/cron/health`
3. Review timing: Ensure cron scheduler has correct timezone
4. Check network: Verify firewall allows outbound to your API
5. Monitor database: Ensure Supabase has available connections
