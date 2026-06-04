import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const Input = z.object({
  imageBase64: z.string().min(100).max(8_000_000),
  mimeType: z.string().default("image/jpeg"),
});

const MENU_PROMPT = `You are extracting a restaurant menu from a photo. Return ONLY a JSON object with this exact shape:

{
  "categories": [
    {
      "name": "Category name",
      "items": [
        { "name": "Item name", "description": "Short description or empty string", "price": 350 }
      ]
    }
  ]
}

Rules:
- Prices must be numbers in KES (Kenyan Shillings) — strip currency symbols.
- If no categories visible, use one "Menu" category.
- Skip section headers like "Drinks available" if they have no items.
- Be conservative — only include items you can clearly read.
- Return valid JSON, no markdown fences, no commentary.`;

export const extractMenuFromImage = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => Input.parse(input))
  .handler(async ({ data }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("Missing LOVABLE_API_KEY");

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: MENU_PROMPT },
              {
                type: "image_url",
                image_url: { url: `data:${data.mimeType};base64,${data.imageBase64}` },
              },
            ],
          },
        ],
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`AI Gateway ${res.status}: ${body.slice(0, 200)}`);
    }
    const json: any = await res.json();
    const text: string = json.choices?.[0]?.message?.content ?? "";
    const cleaned = text.replace(/```json\s*/g, "").replace(/```\s*$/g, "").trim();
    try {
      const parsed = JSON.parse(cleaned);
      return {
        categories: (parsed.categories ?? []).map((c: any) => ({
          name: String(c.name ?? "Menu"),
          items: (c.items ?? []).map((i: any) => ({
            name: String(i.name ?? ""),
            description: String(i.description ?? ""),
            price: Number(i.price ?? 0),
          })).filter((i: any) => i.name && i.price > 0),
        })).filter((c: any) => c.items.length > 0),
      };
    } catch {
      throw new Error("Could not parse AI response. Try a clearer photo.");
    }
  });
