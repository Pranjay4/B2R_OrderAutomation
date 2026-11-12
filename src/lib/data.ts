import { createReadOnlyClient } from "./supabase/server";
import type { CatalogueData, Product, Scheme } from "./types";

const sampleProducts: Product[] = [
  {
    id: "sample-1",
    sku: "BIS-001",
    name: "Premium Rice 10kg",
    brand: "Bharat Foods",
    category: "Staples",
    pack_size: "10kg",
    mrp: 430,
    base_price: 375,
    image_url: "https://images.unsplash.com/photo-1586201375761-83865001e31c?auto=format&fit=crop&w=900&q=80",
    description: "High-quality rice for retail and food service counters.",
    is_active: true,
    updated_at: new Date().toISOString(),
    schemes: [{
      id: "sample-scheme-1",
      product_id: "sample-1",
      scheme_type: "buy_x_get_y",
      minimum_quantity: 10,
      free_quantity: 1,
      discount_percentage: 0,
      repeat_offer: true,
      starts_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString(),
      status: "published",
      stackable: false,
      notes: "Buy 10 packs and receive 1 extra free.",
      updated_at: new Date().toISOString(),
      scheme_slabs: []
    }]
  },
  {
    id: "sample-2",
    sku: "MIX-454",
    name: "Coconut Oil 1L",
    brand: "Sundar Agro",
    category: "Cooking Oil",
    pack_size: "1L x 12",
    mrp: 520,
    base_price: 472,
    image_url: "https://images.unsplash.com/photo-1471193945509-9ad0617afabf?auto=format&fit=crop&w=900&q=80",
    description: "Refined kitchen oil in a 1L retail pack.",
    is_active: true,
    updated_at: new Date().toISOString(),
    schemes: [{
      id: "sample-scheme-2",
      product_id: "sample-2",
      scheme_type: "percentage",
      minimum_quantity: 12,
      free_quantity: 0,
      discount_percentage: 8,
      repeat_offer: false,
      starts_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 1000 * 60 * 60 * 24 * 45).toISOString(),
      status: "published",
      stackable: false,
      notes: "8% off on minimum 12-unit orders.",
      updated_at: new Date().toISOString(),
      scheme_slabs: []
    }]
  },
  {
    id: "sample-3",
    sku: "SOAP-212",
    name: "Herbal Soap Pack",
    brand: "CleanCare",
    category: "Home Care",
    pack_size: "48 bars",
    mrp: 360,
    base_price: 298,
    image_url: "https://images.unsplash.com/photo-1556228578-8c89e6adf883?auto=format&fit=crop&w=900&q=80",
    description: "Household personal care pack for retail shelves.",
    is_active: true,
    updated_at: new Date().toISOString(),
    schemes: [{
      id: "sample-scheme-3",
      product_id: "sample-3",
      scheme_type: "slab",
      minimum_quantity: 1,
      free_quantity: 0,
      discount_percentage: 0,
      repeat_offer: false,
      starts_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 1000 * 60 * 60 * 24 * 60).toISOString(),
      status: "published",
      stackable: false,
      notes: "Tiered percentage discounts by quantity bracket.",
      updated_at: new Date().toISOString(),
      scheme_slabs: [
        { minimum_quantity: 1, maximum_quantity: 9, discount_percentage: 0 },
        { minimum_quantity: 10, maximum_quantity: 19, discount_percentage: 8 },
        { minimum_quantity: 20, maximum_quantity: 49, discount_percentage: 12 },
        { minimum_quantity: 50, maximum_quantity: null, discount_percentage: 15 }
      ]
    }]
  }
];

export async function getProducts(): Promise<CatalogueData> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) return { products: sampleProducts, isPreview: true };
  const supabase = await createReadOnlyClient();
  const { data, error } = await supabase.from("products").select("*, schemes(*, scheme_slabs(*))").eq("is_active", true).order("name");
  if (error) throw new Error(error.message);
  const now = Date.now();
  const products = (data ?? []).map((product) => ({
    ...product,
    schemes: (product.schemes ?? []).filter((scheme: Scheme) => scheme.status === "published" && new Date(scheme.starts_at).getTime() <= now && (!scheme.expires_at || new Date(scheme.expires_at).getTime() > now))
  })) as Product[];
  return { products, isPreview: false };
}
