import { NextRequest, NextResponse } from "next/server";
import { normaliseOffProduct } from "../_lib/openfoodfacts";

const OFF_BASE = "https://world.openfoodfacts.org/api/v0/product";
const OFF_FIELDS = "product_name,brands,nutriments,serving_size,serving_quantity,image_front_small_url,categories_tags";

export async function GET(req: NextRequest) {
  const barcode = req.nextUrl.searchParams.get("code")?.trim();
  if (!barcode) return NextResponse.json({ error: "code required" }, { status: 400 });

  const url = `${OFF_BASE}/${encodeURIComponent(barcode)}.json?fields=${OFF_FIELDS}`;

  const res = await fetch(url, {
    headers: { "User-Agent": "GarminAICoach/1.0 (contact@garminaicoach.com)" },
    next: { revalidate: 3600 },
  });

  if (!res.ok) {
    return NextResponse.json({ found: false, error: "Open Food Facts unavailable" }, { status: 502 });
  }

  const json = await res.json();

  if (json.status === 0 || !json.product) {
    return NextResponse.json({ found: false });
  }

  const food = normaliseOffProduct(barcode, json.product);
  // Unlike a text search (where a nameless hit is just noise to filter out), a barcode
  // scan found a specific physical product — always surface something to edit/name.
  return NextResponse.json({ found: true, food: { ...food, description: food.description ?? "Unknown product" } });
}
