/**
 * OCR CLIENT — Menu Photo Parsing
 * Parse restaurant menu photos into structured items + categories using Google Vision API
 */

export interface OCRMenuItem {
  name: string;
  description?: string;
  price?: number;
  category: string;
}

export interface OCRParseResult {
  success: boolean;
  items: OCRMenuItem[];
  rawText?: string;
  error?: string;
}

/**
 * Extract text from image using Google Vision API
 * Requires VITE_GOOGLE_VISION_API_KEY
 */
export async function parseMenuImage(imageFile: File): Promise<OCRParseResult> {
  try {
    const apiKey = import.meta.env.VITE_GOOGLE_VISION_API_KEY;
    if (!apiKey) {
      throw new Error("Google Vision API key not configured");
    }

    // Convert image to base64
    const buffer = await imageFile.arrayBuffer();
    const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));

    // Call Google Vision API
    const response = await fetch(
      `https://vision.googleapis.com/v1/images:annotateRequest?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requests: [
            {
              image: { content: base64 },
              features: [{ type: "TEXT_DETECTION" }],
            },
          ],
        }),
      }
    );

    if (!response.ok) {
      throw new Error(`Vision API error: ${response.statusText}`);
    }

    const data = await response.json();
    const textAnnotations = data.responses?.[0]?.textAnnotations;

    if (!textAnnotations?.length) {
      return {
        success: false,
        items: [],
        error: "No text detected in image",
      };
    }

    // Extract full text
    const fullText = textAnnotations[0].description;

    // Parse items from text
    const items = parseMenuText(fullText);

    return {
      success: true,
      items,
      rawText: fullText,
    };
  } catch (error) {
    return {
      success: false,
      items: [],
      error: error instanceof Error ? error.message : "Unknown OCR error",
    };
  }
}

/**
 * Parse menu text into structured items
 * Heuristic-based pattern matching for Kenyan menus
 */
function parseMenuText(text: string): OCRMenuItem[] {
  const items: OCRMenuItem[] = [];
  const lines = text.split("\n").filter((l) => l.trim());

  let currentCategory = "General";
  const pricePattern = /KES?\s?(\d+(?:,\d{3})*(?:\.\d{2})?)/gi;

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip empty lines or very short lines
    if (!trimmed || trimmed.length < 2) continue;

    // Detect category headers (uppercase or followed by items)
    if (trimmed === trimmed.toUpperCase() && trimmed.length > 3) {
      currentCategory = trimmed;
      continue;
    }

    // Extract price
    const priceMatch = pricePattern.exec(trimmed);
    pricePattern.lastIndex = 0; // reset regex
    const price = priceMatch
      ? parseInt(priceMatch[1].replace(/,/g, ""), 10)
      : undefined;

    // Remove price from item name
    const nameWithoutPrice = trimmed
      .replace(pricePattern, "")
      .trim()
      .replace(/\s{2,}/g, " ");

    if (nameWithoutPrice) {
      items.push({
        name: nameWithoutPrice,
        category: currentCategory,
        price,
      });
    }
  }

  return items;
}

/**
 * Group items by category
 */
export function groupItemsByCategory(items: OCRMenuItem[]): Record<string, OCRMenuItem[]> {
  return items.reduce(
    (acc, item) => {
      if (!acc[item.category]) {
        acc[item.category] = [];
      }
      acc[item.category].push(item);
      return acc;
    },
    {} as Record<string, OCRMenuItem[]>
  );
}
