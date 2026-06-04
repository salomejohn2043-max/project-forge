import { useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { KES } from "@/lib/settings";
import { statusLabel } from "@/lib/format";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

interface OrderDetailModalProps {
  orderId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface OrderDetail {
  id: string;
  status: string;
  customer_id: string;
  restaurant_id: string;
  rider_id?: string | null;
  delivery_address: string;
  total_amount: number;
  subtotal: number;
  markup_amount: number;
  delivery_fee: number;
  restaurant_commission: number;
  rider_commission: number;
  restaurant_payout: number;
  rider_payout: number;
  amount_paid_upfront: number;
  amount_remaining: number;
  mpesa_reference?: string | null;
  is_disbursed: boolean;
  created_at: string;
  updated_at: string;

  // Relations
  customer?: { full_name: string; phone: string; email: string } | null;
  restaurant?: { name: string; phone: string; address: string } | null;
  rider?: { user_id: string; users?: { full_name: string; phone: string } } | null;
  order_items?: Array<{
    menu_item_id: string;
    quantity: number;
    marked_up_price: number;
    name: string;
    subtotal: number;
  }>;
}

export function OrderDetailModal({
  orderId,
  open,
  onOpenChange,
}: OrderDetailModalProps) {
  const { data: order, isLoading } = useQuery({
    queryKey: ["order-detail", orderId],
    queryFn: async () => {
      if (!orderId) return null;
      const { data } = await supabase
        .from("orders")
        .select(
          `*,
          customer:users!orders_customer_id_fkey(*),
          restaurant:restaurants(*),
          order_items(*)`
        )
        .eq("id", orderId)
        .single();
      return data as unknown as OrderDetail;
    },
    enabled: open && !!orderId,
  });

  const handleDisburse = async () => {
    if (!order) return;
    try {
      const { error } = await supabase
        .from("orders")
        .update({ is_disbursed: true })
        .eq("id", orderId!);

      if (error) throw error;
      toast.success("Order disbursed");
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Disbursement failed");
    }
  };

  const handleCancel = async () => {
    if (!order) return;
    try {
      const { error } = await supabase
        .from("orders")
        .update({ status: "cancelled" })
        .eq("id", orderId!);

      if (error) throw error;
      toast.success("Order cancelled");
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Cancellation failed");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span>Order #{order?.id.slice(0, 6) || "..."}</span>
            {order && (
              <Badge variant="secondary">
                {statusLabel[order.status] || order.status}
              </Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : order ? (
          <div className="space-y-4">
            {/* Parties */}
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg bg-muted p-3">
                <div className="text-xs font-semibold uppercase text-muted-foreground">
                  Customer
                </div>
                <div className="mt-2 text-sm font-medium">
                  {order.customer?.full_name}
                </div>
                <div className="text-xs text-muted-foreground">
                  {order.customer?.phone}
                </div>
              </div>

              <div className="rounded-lg bg-muted p-3">
                <div className="text-xs font-semibold uppercase text-muted-foreground">
                  Restaurant
                </div>
                <div className="mt-2 text-sm font-medium">
                  {order.restaurant?.name}
                </div>
                <div className="text-xs text-muted-foreground">
                  {order.restaurant?.phone}
                </div>
              </div>

              <div className="rounded-lg bg-muted p-3">
                <div className="text-xs font-semibold uppercase text-muted-foreground">
                  Rider
                </div>
                {order.rider ? (
                  <>
                    <div className="mt-2 text-sm font-medium">
                      {order.rider.users?.full_name || "Unassigned"}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {order.rider.users?.phone}
                    </div>
                  </>
                ) : (
                  <div className="mt-2 text-xs text-muted-foreground">Not assigned</div>
                )}
              </div>
            </div>

            <Separator />

            {/* Items */}
            <div>
              <h4 className="text-sm font-semibold mb-2">Items</h4>
              <div className="space-y-1">
                {order.order_items?.map((item, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between text-sm rounded-lg border p-2"
                  >
                    <div>
                      <div className="font-medium">{item.menu_items?.name}</div>
                      <div className="text-xs text-muted-foreground">
                        Qty: {item.quantity} × {KES(item.price_per_unit)}
                      </div>
                    </div>
                    <div className="font-semibold">
                      {KES(item.quantity * item.price_per_unit)}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <Separator />

            {/* Financial Breakdown */}
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span>Subtotal</span>
                <span className="font-medium">{KES(order.subtotal)}</span>
              </div>
              <div className="flex justify-between">
                <span>Markup (platform fee)</span>
                <span className="font-medium text-green-600">
                  +{KES(order.markup_amount)}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Delivery Fee</span>
                <span className="font-medium">{KES(order.delivery_fee)}</span>
              </div>
              <div className="flex justify-between border-t pt-2 font-semibold">
                <span>Customer Total</span>
                <span>{KES(order.total_amount)}</span>
              </div>

              <Separator />

              <div className="rounded-lg bg-blue-50 p-3 space-y-1">
                <div className="text-xs uppercase font-semibold text-blue-900">
                  Disbursement Breakdown
                </div>
                <div className="flex justify-between text-xs">
                  <span>Restaurant Commission</span>
                  <span className="text-red-600">
                    -{KES(order.restaurant_commission)}
                  </span>
                </div>
                <div className="flex justify-between text-xs">
                  <span>Restaurant Payout</span>
                  <span className="font-semibold text-green-600">
                    {KES(order.restaurant_payout)}
                  </span>
                </div>

                <Separator className="my-2" />

                <div className="flex justify-between text-xs">
                  <span>Rider Commission</span>
                  <span className="text-red-600">
                    -{KES(order.rider_commission)}
                  </span>
                </div>
                <div className="flex justify-between text-xs">
                  <span>Rider Payout</span>
                  <span className="font-semibold text-green-600">
                    {KES(order.rider_payout)}
                  </span>
                </div>
              </div>

              <Separator />

              <div className="flex justify-between text-xs">
                <span>Amount Paid Upfront</span>
                <span className="font-medium">{KES(order.amount_paid_upfront)}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span>Amount Due at Delivery</span>
                <span className="font-medium">{KES(order.amount_remaining)}</span>
              </div>

              {order.mpesa_reference && (
                <div className="flex justify-between text-xs mt-2">
                  <span>M-Pesa Ref</span>
                  <span className="font-mono">{order.mpesa_reference}</span>
                </div>
              )}
            </div>

            <Separator />

            {/* Delivery Address */}
            <div>
              <h4 className="text-sm font-semibold mb-1">Delivery Address</h4>
              <div className="text-sm text-muted-foreground rounded-lg border p-2">
                {order.delivery_address}
              </div>
            </div>

            {/* Timestamps */}
            <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
              <div>
                <div className="font-semibold">Created</div>
                {new Date(order.created_at).toLocaleString()}
              </div>
              <div>
                <div className="font-semibold">Updated</div>
                {new Date(order.updated_at).toLocaleString()}
              </div>
            </div>

            <Separator />

            {/* Actions */}
            <div className="flex gap-2 pt-2">
              {!order.is_disbursed && order.status === "delivered" && (
                <Button onClick={handleDisburse} className="gap-2">
                  Disburse Payment
                </Button>
              )}
              {["pending", "confirmed"].includes(order.status) && (
                <Button
                  onClick={handleCancel}
                  variant="destructive"
                  className="gap-2"
                >
                  Cancel Order
                </Button>
              )}
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
