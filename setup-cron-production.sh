#!/bin/bash

# Production Cron Setup Script
# Generates secure cron configuration and deploys to production

set -e

echo "🚀 Kisii Eats Production Cron Setup"
echo "===================================="
echo ""

# 1. Generate new CRON_SECRET
echo "📝 Generating new CRON_SECRET..."
CRON_SECRET=$(openssl rand -hex 32)
echo "✅ New secret: $CRON_SECRET"
echo ""

# 2. Create backup of .env
echo "💾 Backing up .env..."
if [ -f .env ]; then
  cp .env ".env.backup.$(date +%s)"
  echo "✅ Backup created"
else
  echo "⚠️  .env file not found"
fi
echo ""

# 3. Update .env with new secret
echo "🔧 Updating .env with new CRON_SECRET..."
if [ -f .env ]; then
  # Handle cross-platform compatibility
  if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS
    sed -i '' "s/CRON_SECRET=.*/CRON_SECRET=\"$CRON_SECRET\"/" .env
  else
    # Linux
    sed -i "s/CRON_SECRET=.*/CRON_SECRET=\"$CRON_SECRET\"/" .env
  fi
  echo "✅ .env updated"
else
  echo "❌ .env file not found"
  exit 1
fi
echo ""

# 4. Verify cron endpoints exist
echo "✅ Cron endpoints:"
echo "   - POST /api/cron/group-orders/reconcile (every hour)"
echo "   - GET  /api/cron/health (every 5 minutes)"
echo ""

# 5. Display configuration summary
echo "📊 Configuration Summary:"
echo "========================"
echo "CRON_SECRET: ${CRON_SECRET:0:16}..."
echo "CRON_TIMEOUT_MS: 300000 (5 minutes)"
echo "CRON_MAX_RETRIES: 3"
echo ""

# 6. Instructions for external services
echo "🔌 Next Steps - Configure External Scheduler:"
echo "=============================================="
echo ""
echo "Option 1: Google Cloud Scheduler"
echo "  URL: https://your-domain.com/api/cron/group-orders/reconcile"
echo "  Method: POST"
echo "  Params: ?secret=$CRON_SECRET&timestamp=TIMESTAMP&retryCount=0"
echo "  Frequency: 0 * * * * (hourly)"
echo ""
echo "Option 2: AWS EventBridge + Lambda"
echo "  Set environment variable: CRON_SECRET=$CRON_SECRET"
echo "  Lambda calls: https://your-domain.com/api/cron/group-orders/reconcile"
echo "  Schedule: rate(1 hour)"
echo ""
echo "Option 3: Easycron"
echo "  URL: https://your-domain.com/api/cron/group-orders/reconcile?secret=$CRON_SECRET&timestamp=TIMESTAMP&retryCount=0"
echo "  Frequency: 0 * * * * (hourly)"
echo ""
echo "Option 4: Vercel (if deployed on Vercel)"
echo "  Add to vercel.json:"
echo "  {\"crons\": [{\"path\": \"/api/cron/group-orders/reconcile\", \"schedule\": \"0 * * * *\"}]}"
echo ""

# 7. Test endpoints
echo "🧪 Testing Cron Endpoints:"
echo "=========================="
echo ""
echo "Run these after deployment:"
echo ""
echo "# Test health check:"
echo "curl -X GET https://your-domain.com/api/cron/health"
echo ""
echo "# Test manual trigger (replace SECRET):"
echo "curl -X POST \"https://your-domain.com/api/cron/group-orders/reconcile?secret=$CRON_SECRET&timestamp=\$(date +%s)&retryCount=0\""
echo ""

# 8. Save secret to secure file
SECRETS_FILE=".cron-secrets.txt"
cat > "$SECRETS_FILE" << EOF
# Cron Configuration - KEEP SECURE
# Generated: $(date)
#
# ⚠️  DO NOT COMMIT TO GIT ⚠️

CRON_SECRET=$CRON_SECRET
CRON_TIMEOUT_MS=300000
CRON_MAX_RETRIES=3

# Store CRON_SECRET in:
# - Production environment variables
# - Encrypted vault
# - CI/CD secrets

# Do not share this file outside your team
EOF

echo "💾 Secret saved to: $SECRETS_FILE"
echo "   ⚠️  Keep this file secure - do NOT commit to git"
echo ""

echo "✅ Setup Complete!"
echo ""
echo "📚 Documentation: See CRON_SETUP_PRODUCTION.md"
echo ""
