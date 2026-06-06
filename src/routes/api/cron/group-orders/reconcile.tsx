/**
 * Production Cron Endpoint: Group Order Reconciliation
 * Triggered hourly to close and reconcile group orders
 * Path: /api/cron/group-orders/reconcile
 */

import { createClient } from '@supabase/supabase-js';
import {
  validateCronRequest,
  executeCronJobWithTimeout,
  cronResponse,
} from '@/lib/cron';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ADMIN_KEY! // Use admin key for cron jobs
);

export async function POST(request: Request) {
  try {
    // Parse request
    const url = new URL(request.url);
    const secret = url.searchParams.get('secret') || '';
    const timestamp = parseInt(url.searchParams.get('timestamp') || '0', 10);
    const retryCount = parseInt(url.searchParams.get('retryCount') || '0', 10);

    // Validate
    const validation = validateCronRequest({
      secret,
      timestamp,
      retryCount,
    });

    if (!validation.valid) {
      return cronResponse({
        success: false,
        jobId: 'validation-failed',
        executedAt: new Date().toISOString(),
        duration: 0,
        message: `Validation failed: ${validation.error}`,
      });
    }

    // Execute job
    const jobId = `group-order-reconcile-${Date.now()}`;
    const response = await executeCronJobWithTimeout(
      jobId,
      'group-order-reconciliation',
      async () => {
        return await reconcileGroupOrders();
      },
      retryCount
    );

    return cronResponse(response);
  } catch (error) {
    console.error('[CRON] Unexpected error in group order reconciliation:', error);
    return cronResponse({
      success: false,
      jobId: 'unknown-error',
      executedAt: new Date().toISOString(),
      duration: 0,
      message: error instanceof Error ? error.message : 'Unknown error occurred',
    });
  }
}

/**
 * Main reconciliation logic
 */
async function reconcileGroupOrders() {
  // Get all active group orders that are past their deadline
  const { data: groupOrders, error: fetchError } = await supabase
    .from('group_orders')
    .select('id, restaurant_id, total_amount, status')
    .eq('status', 'active')
    .lt('deadline_at', new Date().toISOString());

  if (fetchError) {
    throw new Error(`Failed to fetch group orders: ${fetchError.message}`);
  }

  if (!groupOrders || groupOrders.length === 0) {
    return {
      reconciled: 0,
      message: 'No group orders to reconcile',
    };
  }

  // Process each group order
  const results = [];
  for (const groupOrder of groupOrders) {
    try {
      // Verify all members have paid
      const { data: unpaidMembers, error: unpaidError } = await supabase
        .from('group_order_members')
        .select('id')
        .eq('group_order_id', groupOrder.id)
        .is('payment_status', null);

      if (unpaidError) throw unpaidError;

      if (unpaidMembers && unpaidMembers.length > 0) {
        console.warn(
          `[CRON] Group order ${groupOrder.id} has unpaid members, skipping reconciliation`
        );
        results.push({
          groupOrderId: groupOrder.id,
          status: 'skipped',
          reason: 'unpaid-members',
        });
        continue;
      }

      // Close the group order
      const { error: updateError } = await supabase
        .from('group_orders')
        .update({
          status: 'closed',
          updated_at: new Date().toISOString(),
        })
        .eq('id', groupOrder.id);

      if (updateError) throw updateError;

      // Create a single consolidated order
      const { data: newOrder, error: createError } = await supabase
        .from('orders')
        .insert({
          restaurant_id: groupOrder.restaurant_id,
          customer_id: null, // Consolidated order has no single customer
          total_amount: groupOrder.total_amount,
          status: 'confirmed',
          is_group_order: true,
          group_order_id: groupOrder.id,
          created_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (createError) throw createError;

      results.push({
        groupOrderId: groupOrder.id,
        status: 'reconciled',
        orderId: newOrder.id,
      });
    } catch (error) {
      console.error(`[CRON] Failed to reconcile group order ${groupOrder.id}:`, error);
      results.push({
        groupOrderId: groupOrder.id,
        status: 'failed',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  return {
    reconciled: results.filter((r) => r.status === 'reconciled').length,
    skipped: results.filter((r) => r.status === 'skipped').length,
    failed: results.filter((r) => r.status === 'failed').length,
    details: results,
  };
}
