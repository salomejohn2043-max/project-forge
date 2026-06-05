/**
 * Cron Health Check Endpoint
 * Used to verify cron infrastructure is operational
 * Path: /api/cron/health
 */

import { json } from '@tanstack/start';
import { performCronHealthCheck, cronResponse } from '../../lib/cron';

export async function GET() {
  try {
    const health = await performCronHealthCheck();

    return cronResponse({
      success: health.healthy,
      jobId: 'health-check',
      executedAt: new Date().toISOString(),
      duration: 0,
      message: health.healthy
        ? 'Cron infrastructure is healthy'
        : 'Cron infrastructure has issues',
    });
  } catch (error) {
    return cronResponse({
      success: false,
      jobId: 'health-check-failed',
      executedAt: new Date().toISOString(),
      duration: 0,
      message: error instanceof Error ? error.message : 'Health check failed',
    });
  }
}
