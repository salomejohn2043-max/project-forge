/**
 * Production-grade Cron Handler
 * Secure, monitored, and scalable cron job execution for SaaS platform
 */

const json = (data: any, init?: ResponseInit) =>
  new Response(JSON.stringify(data), {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });

// Types
interface CronRequest {
  secret: string;
  timestamp: number;
  retryCount: number;
}

interface CronResponse {
  success: boolean;
  jobId: string;
  executedAt: string;
  duration: number;
  message: string;
  retryable?: boolean;
}

interface CronLog {
  jobId: string;
  jobType: string;
  status: 'started' | 'completed' | 'failed' | 'retrying';
  duration: number;
  error?: string;
  timestamp: string;
  retryCount: number;
  metadata?: Record<string, any>;
}

// Constants
const CRON_SECRET = process.env.CRON_SECRET || '';
const CRON_TIMEOUT_MS = parseInt(process.env.CRON_TIMEOUT_MS || '300000', 10);
const CRON_MAX_RETRIES = parseInt(process.env.CRON_MAX_RETRIES || '3', 10);
const REQUEST_TIMEOUT_TOLERANCE = 300; // 5 minutes in seconds

/**
 * Validate incoming cron request
 * Prevents unauthorized access and replay attacks
 */
export function validateCronRequest(req: CronRequest): {
  valid: boolean;
  error?: string;
} {
  // Check secret
  if (!req.secret || req.secret !== CRON_SECRET) {
    return { valid: false, error: 'Invalid or missing CRON_SECRET' };
  }

  // Check timestamp (prevent replay attacks)
  const now = Math.floor(Date.now() / 1000);
  const timeDiff = Math.abs(now - req.timestamp);

  if (timeDiff > REQUEST_TIMEOUT_TOLERANCE) {
    return {
      valid: false,
      error: `Request timestamp too old or far in future (diff: ${timeDiff}s)`,
    };
  }

  // Check retry count
  if (req.retryCount < 0 || req.retryCount > CRON_MAX_RETRIES) {
    return {
      valid: false,
      error: `Invalid retry count: ${req.retryCount}`,
    };
  }

  return { valid: true };
}

/**
 * Log cron job execution to monitoring system
 * In production, this should send to DataDog, Sentry, or similar
 */
export async function logCronExecution(log: CronLog): Promise<void> {
  try {
    // Send to external monitoring (example: Supabase)
    if (typeof window === 'undefined') {
      console.log('[CRON]', JSON.stringify(log));

      // TODO: Send to production monitoring service
      // await monitoringService.log(log);
    }
  } catch (error) {
    console.error('[CRON] Failed to log execution:', error);
  }
}

/**
 * Handle cron job with timeout and error handling
 */
export async function executeCronJobWithTimeout<T>(
  jobId: string,
  jobName: string,
  handler: () => Promise<T>,
  retryCount: number = 0
): Promise<CronResponse> {
  const startTime = Date.now();
  const jobLog: CronLog = {
    jobId,
    jobType: jobName,
    status: 'started',
    duration: 0,
    timestamp: new Date().toISOString(),
    retryCount,
  };

  try {
    // Execute with timeout
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(
        () => reject(new Error(`Cron job "${jobName}" exceeded timeout of ${CRON_TIMEOUT_MS}ms`)),
        CRON_TIMEOUT_MS
      )
    );

    const result = await Promise.race([handler(), timeoutPromise]);

    const duration = Date.now() - startTime;
    jobLog.status = 'completed';
    jobLog.duration = duration;
    jobLog.metadata = { result };

    await logCronExecution(jobLog);

    return {
      success: true,
      jobId,
      executedAt: new Date().toISOString(),
      duration,
      message: `Cron job "${jobName}" completed successfully`,
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);
    const isRetryable = isRetryableError(error);

    jobLog.status = isRetryable && retryCount < CRON_MAX_RETRIES ? 'retrying' : 'failed';
    jobLog.duration = duration;
    jobLog.error = errorMessage;

    await logCronExecution(jobLog);

    return {
      success: false,
      jobId,
      executedAt: new Date().toISOString(),
      duration,
      message: `Cron job "${jobName}" failed: ${errorMessage}`,
      retryable: isRetryable && retryCount < CRON_MAX_RETRIES,
    };
  }
}

/**
 * Determine if error is retryable
 */
function isRetryableError(error: any): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    // Retryable: network errors, timeouts, rate limits
    return (
      message.includes('timeout') ||
      message.includes('econnrefused') ||
      message.includes('enotfound') ||
      message.includes('429') ||
      message.includes('503')
    );
  }
  return false;
}

/**
 * Generate request for manual cron trigger (for testing/debugging)
 */
export function generateCronRequest(
  retryCount: number = 0
): CronRequest {
  return {
    secret: CRON_SECRET,
    timestamp: Math.floor(Date.now() / 1000),
    retryCount,
  };
}

/**
 * Format cron URL for external scheduling services
 * Usage: Post this URL to Easycron, AWS EventBridge, Google Cloud Scheduler, etc.
 */
export function getCronUrl(baseUrl: string, jobPath: string): string {
  const req = generateCronRequest();
  const params = new URLSearchParams({
    secret: req.secret,
    timestamp: req.timestamp.toString(),
    retryCount: req.retryCount.toString(),
  });
  return `${baseUrl}${jobPath}?${params.toString()}`;
}

/**
 * Standard response format for cron endpoints
 */
export function cronResponse(data: CronResponse) {
  return json(data, {
    status: data.success ? 200 : 500,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    },
  });
}

/**
 * Health check for cron infrastructure
 */
export async function performCronHealthCheck(): Promise<{
  healthy: boolean;
  checks: Record<string, boolean>;
  timestamp: string;
}> {
  return {
    healthy: true,
    checks: {
      cronSecretConfigured: !!CRON_SECRET,
      timeoutConfigured: CRON_TIMEOUT_MS > 0,
      maxRetriesConfigured: CRON_MAX_RETRIES > 0,
    },
    timestamp: new Date().toISOString(),
  };
}
