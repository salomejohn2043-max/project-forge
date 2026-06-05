import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Upload, Loader2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { extractMenuFromImage } from "@/lib/menu-ocr.functions";
import { Input } from "@/components/ui/input";

interface OCRMenuItem {
  name: string;
  description?: string;
  price?: number;
  category: string;
}

function groupItemsByCategory(items: OCRMenuItem[]): Record<string, OCRMenuItem[]> {
  return items.reduce(
    (acc, item) => {
      if (!acc[item.category]) acc[item.category] = [];
      acc[item.category].push(item);
      return acc;
    },
    {} as Record<string, OCRMenuItem[]>
  );
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? "");
      resolve(result.includes(",") ? result.split(",")[1] : result);
    };
    reader.onerror = () => reject(new Error("Could not read image file"));
    reader.readAsDataURL(file);
  });
}

interface MenuOCRUploadProps {
  restaurantId: string;
  restaurantName: string;
  onSuccess?: () => void;
}

export function MenuOCRUpload({ restaurantId, restaurantName, onSuccess }: MenuOCRUploadProps) {
  const extractMenu = useServerFn(extractMenuFromImage);
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [parsedItems, setParsedItems] = useState<OCRMenuItem[]>([]);
  const [step, setStep] = useState<"upload" | "review" | "confirm">("upload");

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    if (!selectedFile.type.startsWith("image/")) {
      toast.error("Please upload an image file");
      return;
    }

    setLoading(true);
    setFile(selectedFile);

    try {
      const imageBase64 = await fileToBase64(selectedFile);
      const result = await extractMenu({ data: { imageBase64, mimeType: selectedFile.type || "image/jpeg" } });
      const items = result.categories.flatMap((category) =>
        category.items.map((item) => ({ ...item, category: category.name }))
      );
      if (items.length > 0) {
        setParsedItems(items);
        setStep("review");
        toast.success(`Detected ${items.length} menu items`);
      } else {
        toast.error("Could not parse menu image");
        setFile(null);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not parse menu image");
      setFile(null);
    } finally {
      setLoading(false);
    }
  };

  const handleImport = async () => {
    setLoading(true);
    try {
      const categories = Array.from(
        new Set(parsedItems.map((i) => i.category))
      );

      const categoryMap: Record<string, string> = {};
      for (const catName of categories) {
        const { data: cat } = await supabase
          .from("menu_categories")
          .select("id")
          .eq("restaurant_id", restaurantId)
          .eq("name", catName)
          .single();

        if (cat) {
          categoryMap[catName] = cat.id;
        } else {
          const { data: newCat } = await supabase
            .from("menu_categories")
            .insert({
              restaurant_id: restaurantId,
              name: catName,
              display_order: categories.indexOf(catName),
            })
            .select("id")
            .single();

          if (newCat) {
            categoryMap[catName] = newCat.id;
          }
        }
      }

      const itemsToInsert = parsedItems.map((item) => ({
        restaurant_id: restaurantId,
        category_id: categoryMap[item.category],
        name: item.name,
        description: item.description || "",
        base_price: item.price || 0,
        is_available: true,
      }));

      const { error } = await supabase
        .from("menu_items")
        .insert(itemsToInsert);

      if (error) throw error;

      toast.success(`Imported ${itemsToInsert.length} menu items`);
      setStep("confirm");
      onSuccess?.();

      setTimeout(() => {
        setOpen(false);
        setStep("upload");
        setParsedItems([]);
        setFile(null);
      }, 1000);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Import failed");
    } finally {
      setLoading(false);
    }
  };

  const grouped = groupItemsByCategory(parsedItems);

  return (
    <>
      <Button onClick={() => setOpen(true)} variant="outline" className="gap-2">
        <Upload className="h-4 w-4" />
        Upload Menu
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {step === "upload" && "Upload Menu Photo"}
              {step === "review" && "Review Parsed Items"}
              {step === "confirm" && "Import Complete"}
            </DialogTitle>
          </DialogHeader>

          {step === "upload" && (
            <div className="space-y-4">
              <div className="rounded-lg border-2 border-dashed border-muted-foreground/25 p-8 text-center">
                <label className="cursor-pointer">
                  <div className="flex flex-col items-center gap-2">
                    <Upload className="h-8 w-8 text-muted-foreground" />
                    <span className="text-sm font-medium">Click to upload</span>
                    <span className="text-xs text-muted-foreground">PNG, JPG, WebP</span>
                  </div>
                  <Input
                    type="file"
                    accept="image/*"
                    onChange={handleUpload}
                    disabled={loading}
                    className="hidden"
                  />
                </label>
              </div>

              {file && (
                <div className="flex items-center gap-2 rounded-lg bg-muted p-3">
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Check className="h-4 w-4 text-green-600" />
                  )}
                  <span className="text-sm">{file.name}</span>
                </div>
              )}
            </div>
          )}

          {step === "review" && (
            <div className="space-y-4">
              {Object.entries(grouped).map(([category, items]) => (
                <div key={category} className="space-y-2">
                  <Badge variant="secondary">{category}</Badge>
                  <div className="space-y-1 pl-2">
                    {items.map((item, idx) => (
                      <div key={idx} className="text-sm">
                        <div className="font-medium">{item.name}</div>
                        {item.price && (
                          <div className="text-xs text-muted-foreground">
                            KES {item.price}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}

              <div className="flex gap-2 pt-4">
                <Button
                  variant="outline"
                  onClick={() => {
                    setStep("upload");
                    setParsedItems([]);
                    setFile(null);
                  }}
                >
                  Back
                </Button>
                <Button onClick={handleImport} disabled={loading} className="gap-2">
                  {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                  Import {parsedItems.length} Items
                </Button>
              </div>
            </div>
          )}

          {step === "confirm" && (
            <div className="flex flex-col items-center justify-center gap-3 py-6">
              <div className="rounded-full bg-green-100 p-3">
                <Check className="h-6 w-6 text-green-600" />
              </div>
              <div className="text-center">
                <h3 className="font-semibold">Menu Imported Successfully</h3>
                <p className="text-sm text-muted-foreground">
                  {parsedItems.length} items added to {restaurantName}
                </p>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
