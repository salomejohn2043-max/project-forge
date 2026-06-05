import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * SmartPay STK Push integration — FULLY WIRED
 *
 * The SMARTPAY_API_KEY is configured in Lovable Cloud secrets.
 * This server function sends real STK Push requests to SmartPay API.
 * 
 * To debug or switch to placeholder mode temporarily, uncomment the simulated branch below.
 */

const Input = z.object({
  phone: z.string().min(9).max(15),
  amount: z.number().int().min(1).max(300_000),
  accountReference: z.string().min(1).max(40).default("KISIIEATS"),
  description: z.string().min(1).max(80).default("Kisii Eats order"),
});

export const initiateSmartPayPush = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => Input.parse(input))
  .handler(async ({ data }) => {
    const apiKey = process.env.SMARTPAY_API_KEY;

    if (!apiKey) {
      throw new Error("Payment service not configured. Contact support.");
    }

    const res = await fetch("https://api.smartpaypesa.com/v1/stk/push", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        phone: data.phone,
        amount: data.amount,
        account_reference: data.accountReference,
        description: data.description,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`SmartPay ${res.status}: ${body.slice(0, 200)}`);
    }

    const json = await res.json();
    return { success: true, simulated: false, ...json };
  });

