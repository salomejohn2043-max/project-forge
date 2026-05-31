import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface OrderItem {
  menuItemId: string;
  name: string;
  basePrice: number;
  markedUpPrice: number;
  quantity: number;
}

interface CreateOrderPayload {
  customerId: string;
  restaurantId: string;
  deliveryAddress: string;
  deliveryLocationLat: number;
  deliveryLocationLon: number;
  deliveryFee: number;
  items: OrderItem[];
  paymentOption: "30" | "50" | "100";
  amountPaidUpfront: number;
  amountRemaining: number;
  markupAmount: number;
}

export async function createOrder(payload: CreateOrderPayload) {
  try {
    // Calculate total
    const subtotal = payload.items.reduce(
      (sum, item) => sum + item.markedUpPrice * item.quantity,
      0
    );
    const totalAmount = subtotal + payload.deliveryFee;

    // Create order
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .insert({
        customer_id: payload.customerId,
        restaurant_id: payload.restaurantId,
        delivery_address: payload.deliveryAddress,
        delivery_location: `POINT(${payload.deliveryLocationLon} ${payload.deliveryLocationLat})`,
        delivery_fee: payload.deliveryFee,
        subtotal,
        total_amount: totalAmount,
        payment_option: payload.paymentOption,
        amount_paid_upfront: payload.amountPaidUpfront,
        amount_remaining: payload.amountRemaining,
        markup_amount: payload.markupAmount,
        payment_status: payload.paymentOption === "100" ? "complete" : "partial",
        status: "pending",
      })
      .select()
      .single();

    if (orderError) throw orderError;

    // Add order items
    for (const item of payload.items) {
      const { error: itemError } = await supabase.from("order_items").insert({
        order_id: order.id,
        menu_item_id: item.menuItemId,
        name: item.name,
        base_price: item.basePrice,
        marked_up_price: item.markedUpPrice,
        quantity: item.quantity,
        subtotal: item.markedUpPrice * item.quantity,
      });

      if (itemError) throw itemError;
    }

    return order;
  } catch (error) {
    console.error("Failed to create order:", error);
    toast.error("Failed to create order");
    throw error;
  }
}

export async function updateOrderStatus(
  orderId: string,
  status: string
) {
  try {
    const { error } = await supabase
      .from("orders")
      .update({ status })
      .eq("id", orderId);

    if (error) throw error;
    toast.success("Order status updated");
  } catch (error) {
    console.error("Failed to update order status:", error);
    toast.error("Failed to update order status");
    throw error;
  }
}

export async function confirmRestaurantDispatch(orderId: string) {
  try {
    const { error } = await supabase
      .from("orders")
      .update({
        restaurant_confirmed_dispatch: true,
        restaurant_confirmed_at: new Date().toISOString(),
      })
      .eq("id", orderId);

    if (error) throw error;
  } catch (error) {
    console.error("Failed to confirm dispatch:", error);
    throw error;
  }
}

export async function confirmRiderPickup(orderId: string) {
  try {
    const { error } = await supabase
      .from("orders")
      .update({
        rider_confirmed_pickup: true,
        rider_confirmed_at: new Date().toISOString(),
        status: "picked_up",
      })
      .eq("id", orderId);

    if (error) throw error;
  } catch (error) {
    console.error("Failed to confirm pickup:", error);
    throw error;
  }
}

export async function confirmCustomerDelivery(orderId: string) {
  try {
    const { error } = await supabase
      .from("orders")
      .update({
        customer_confirmed_delivery: true,
        customer_confirmed_at: new Date().toISOString(),
        status: "delivered",
      })
      .eq("id", orderId);

    if (error) throw error;
  } catch (error) {
    console.error("Failed to confirm delivery:", error);
    throw error;
  }
}
