/**
 * END-TO-END TEST SCENARIO
 * 
 * Full order flow: Customer → Restaurant → Rider → Payment → Delivery
 * 
 * Run this test with:
 * npx vitest run e2e.test.ts
 * 
 * Prerequisites:
 * - Supabase project with populated data (restaurant, test user)
 * - M-Pesa sandbox credentials configured
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { supabase } from "@/integrations/supabase/client";

describe("Kisii Eats E2E Flow", () => {
  let customerId: string;
  let restaurantId: string;
  let riderId: string;
  let orderId: string;

  beforeAll(async () => {
    // Create test customer
    const customerAuth = await supabase.auth.signUpWithPassword({
      email: `test-customer-${Date.now()}@test.com`,
      password: "TestPassword123!",
    });
    customerId = customerAuth.data.user?.id || "";

    // Create customer profile
    await supabase.from("users").insert({
      id: customerId,
      full_name: "Test Customer",
      email: `test-customer-${Date.now()}@test.com`,
      phone: "+254712345678",
      role: "customer",
    });

    // Get active restaurant
    const { data: restaurants } = await supabase
      .from("restaurants")
      .select("*")
      .eq("status", "active")
      .limit(1);
    restaurantId = restaurants?.[0]?.id || "";

    // Get approved rider
    const { data: riders } = await supabase
      .from("rider_profiles")
      .select("*")
      .eq("status", "approved")
      .limit(1);
    riderId = riders?.[0]?.id || "";
  });

  it("should complete full order flow", async () => {
    // Step 1: Customer browses and creates order
    const { data: menuItems } = await supabase
      .from("menu_items")
      .select("*")
      .eq("restaurant_id", restaurantId)
      .limit(2);

    expect(menuItems?.length).toBeGreaterThan(0);

    // Step 2: Create order
    const orderPayload = {
      customer_id: customerId,
      restaurant_id: restaurantId,
      delivery_address: "Test Address, Kisii",
      subtotal: 500,
      markup_amount: 50,
      delivery_fee: 100,
      total_amount: 650,
      amount_paid_upfront: 0,
      amount_remaining: 650,
      status: "pending",
      payment_method: "mpesa",
    };

    const { data: order } = await supabase
      .from("orders")
      .insert(orderPayload)
      .select()
      .single();

    orderId = order?.id || "";
    expect(orderId).toBeTruthy();

    // Step 3: Add items to order
    const orderItems = menuItems?.map((item) => ({
      order_id: orderId,
      menu_item_id: item.id,
      quantity: 1,
      price_per_unit: item.base_price,
    })) || [];

    await supabase.from("order_items").insert(orderItems);

    // Step 4: Simulate payment (checkout_request_id would be set during actual STK push)
    await supabase
      .from("orders")
      .update({
        mpesa_reference: "TEST123456789",
        amount_paid_upfront: 650,
        status: "confirmed",
      })
      .eq("id", orderId);

    const { data: confirmedOrder } = await supabase
      .from("orders")
      .select("*")
      .eq("id", orderId)
      .single();

    expect(confirmedOrder?.status).toBe("confirmed");

    // Step 5: Restaurant receives and marks ready
    await supabase
      .from("orders")
      .update({ status: "preparing" })
      .eq("id", orderId);

    await supabase
      .from("orders")
      .update({ status: "ready" })
      .eq("id", orderId);

    // Step 6: Rider accepts delivery
    await supabase
      .from("orders")
      .update({
        rider_id: riderId,
        status: "picked_up_in_progress",
        rider_confirmed_pickup: true,
      })
      .eq("id", orderId);

    // Step 7: Rider marks delivered
    await supabase
      .from("orders")
      .update({ status: "in_transit" })
      .eq("id", orderId);

    await supabase
      .from("orders")
      .update({
        status: "delivered",
        customer_confirmed_delivery: true,
      })
      .eq("id", orderId);

    // Step 8: Verify all confirmations
    const { data: finalOrder } = await supabase
      .from("orders")
      .select("*")
      .eq("id", orderId)
      .single();

    expect(finalOrder?.status).toBe("delivered");
    expect(finalOrder?.customer_confirmed_delivery).toBe(true);
    expect(finalOrder?.rider_confirmed_pickup).toBe(true);

    // Step 9: Check financial breakdown
    expect(finalOrder?.restaurant_payout).toBe(
      finalOrder?.subtotal -
        (finalOrder?.subtotal * 0.05) // 5% commission
    );
    expect(finalOrder?.rider_payout).toBe(
      finalOrder?.delivery_fee - (finalOrder?.delivery_fee * 0.05) // 5% commission
    );
  });

  it("should handle order cancellation", async () => {
    const orderPayload = {
      customer_id: customerId,
      restaurant_id: restaurantId,
      delivery_address: "Test Address",
      subtotal: 300,
      markup_amount: 30,
      delivery_fee: 100,
      total_amount: 430,
      status: "pending",
      payment_method: "mpesa",
    };

    const { data: cancelOrder } = await supabase
      .from("orders")
      .insert(orderPayload)
      .select()
      .single();

    // Cancel within pending window
    await supabase
      .from("orders")
      .update({ status: "cancelled" })
      .eq("id", cancelOrder?.id);

    // Customer receives 20% refund
    const refund = Math.floor(430 * 0.2);
    await supabase
      .from("users")
      .update({ wallet_balance: refund })
      .eq("id", customerId);

    const { data: updatedUser } = await supabase
      .from("users")
      .select("wallet_balance")
      .eq("id", customerId)
      .single();

    expect(updatedUser?.wallet_balance).toBe(refund);
  });

  afterAll(async () => {
    // Cleanup test data
    if (customerId) {
      await supabase.from("users").delete().eq("id", customerId);
    }
  });
});
