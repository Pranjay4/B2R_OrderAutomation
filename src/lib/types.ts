export type SchemeType = "buy_x_get_y" | "percentage" | "slab";

export type Slab = {
  minimum_quantity: number;
  maximum_quantity: number | null;
  discount_percentage: number;
};

export type Product = {
  id: string;
  sku: string;
  name: string;
  brand: string;
  category: string;
  pack_size: string;
  mrp: number;
  base_price: number;
  image_url: string | null;
  description: string | null;
  is_active: boolean;
  updated_at: string;
  schemes?: Scheme[];
};

export type Scheme = {
  id: string;
  product_id: string;
  scheme_type: SchemeType;
  minimum_quantity: number;
  free_quantity: number;
  discount_percentage: number;
  repeat_offer: boolean;
  starts_at: string;
  expires_at: string | null;
  status: "draft" | "published" | "inactive";
  stackable: boolean;
  notes: string | null;
  updated_at: string;
  scheme_slabs?: Slab[];
};

export type OrderLine = {
  product: Product;
  quantity: number;
};

export type CatalogueData = {
  products: Product[];
  isPreview: boolean;
};

export type Order = {
  id: string;
  order_number: string;
  customer_name: string;
  customer_phone: string;
  customer_business: string | null;
  delivery_address: string | null;
  notes: string | null;
  status: "new" | "confirmed" | "rejected" | "fulfilled";
  created_at: string;
  order_items?: Array<{
    product_name: string;
    sku: string;
    quantity: number;
    effective_price: number;
    free_quantity: number;
  }>;
};
