import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * SmartPay STK Push integration — PLACEHOLDER.
 *
 * The real API key will be supplied by the project owner and stored as the
 * SMARTPAY_API_KEY secret in Lovable Cloud. Until then this server function
 * simulates a successful payment so the checkout flow keeps working end-to-end.
 *
 * To wire the real call (https://api.smartpaypesa.com/v1/stk/push):
 *   1. Add SMARTPAY_API_KEY via the secrets tool.
 *   2. Replace the simulated block below with the fetch shown in the comment.
 *   3. Remove the `simulated: true` field from the response.
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
      // PLACEHOLDER MODE — pretend the push succeeded so the rest of the
      // order flow can be exercised. Replace this whole branch once the key
      // is configured.
      return {
        success: true,
        simulated: true,
        checkout_request_id: `SIM_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
        merchant_request_id: `SIM_MR_${Date.now()}`,
        message: "SmartPay not yet configured — payment simulated.",
      };
    }

    // ---- REAL CALL (uncomment once SMARTPAY_API_KEY is set) ----
    // const res = await fetch("https://api.smartpaypesa.com/v1/stk/push", {
    //   method: "POST",
    //   headers: {
    //     "Content-Type": "application/json",
    //     Authorization: `Bearer ${apiKey}`,
    //   },
    //   body: JSON.stringify({
    //     phone: data.phone,
    //     amount: data.amount,
    //     account_reference: data.accountReference,
    //     description: data.description,
    //   }),
    // });
    // if (!res.ok) {
    //   const body = await res.text();
    //   throw new Error(`SmartPay ${res.status}: ${body.slice(0, 200)}`);
    // }
    // const json = await res.json();
    // return { success: true, simulated: false, ...json };

    throw new Error("SmartPay real-call branch not yet enabled.");
  });
