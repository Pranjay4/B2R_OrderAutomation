"use client";

import { Dispatch, FormEvent, SetStateAction, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  BarChart3,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  Database,
  Download,
  Edit3,
  Filter,
  LockKeyhole,
  LogOut,
  Package,
  Plus,
  RefreshCw,
  Search,
  Tags,
  Upload,
  X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { validateSlabs } from "@/lib/scheme-validation";
import type { Order, Product, Scheme, SchemeType } from "@/lib/types";

type View = "overview" | "orders" | "products" | "schemes";
type ProductForm = {
  sku: string;
  name: string;
  brand: string;
  category: string;
  pack_size: string;
  mrp: string;
  base_price: string;
  image_url: string;
};
type SchemeForm = {
  product_id: string;
  scheme_type: SchemeType;
  minimum_quantity: string;
  free_quantity: string;
  discount_percentage: string;
  repeat_offer: boolean;
  starts_at: string;
  expires_at: string;
  notes: string;
};
type SchemeSlabForm = {
  minimum_quantity: string;
  maximum_quantity: string;
  discount_percentage: string;
};

const emptyProduct: ProductForm = {
  sku: "",
  name: "",
  brand: "",
  category: "",
  pack_size: "",
  mrp: "",
  base_price: "",
  image_url: "",
};

const newScheme = (): SchemeForm => ({
  product_id: "",
  scheme_type: "buy_x_get_y",
  minimum_quantity: "1",
  free_quantity: "1",
  discount_percentage: "0",
  repeat_offer: true,
  starts_at: new Date().toISOString().slice(0, 16),
  expires_at: "",
  notes: "",
});
const newSlab = (): SchemeSlabForm => ({ minimum_quantity: "1", maximum_quantity: "", discount_percentage: "0" });

const formatDate = (value: string) =>
  new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(new Date(value));

const REQUEST_TIMEOUT_MS = 15000;
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const MAX_IMAGE_DIMENSION = 4000;

const csvEscape = (value: string | number | boolean | null) => `"${String(value ?? "").replaceAll('"', '""')}"`;

function parseCsvRow(row: string) {
  const values: string[] = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < row.length; index += 1) {
    const character = row[index];
    if (character === '"' && row[index + 1] === '"') {
      value += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === "," && !quoted) {
      values.push(value.trim());
      value = "";
    } else {
      value += character;
    }
  }
  values.push(value.trim());
  return values;
}

async function validateImageFile(file: File) {
  if (!IMAGE_TYPES.includes(file.type) || file.size > MAX_IMAGE_SIZE) {
    throw new Error("Product images must be JPG, PNG, or WebP files up to 5 MB.");
  }
  const objectUrl = URL.createObjectURL(file);
  try {
    const dimensions = await new Promise<{ width: number; height: number }>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
      image.onerror = () => reject(new Error("The selected image could not be read."));
      image.src = objectUrl;
    });
    if (!dimensions.width || !dimensions.height || dimensions.width > MAX_IMAGE_DIMENSION || dimensions.height > MAX_IMAGE_DIMENSION) {
      throw new Error("Product images must be valid images no larger than 4000 × 4000 pixels.");
    }
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function withTimeout<T>(request: PromiseLike<T>, label: string): Promise<T> {
  let timeoutId: number;
  const timeout = new Promise<T>((_, reject) => {
    timeoutId = window.setTimeout(() => reject(new Error(`${label} timed out after 15 seconds. Check your Supabase project and network connection, then retry.`)), REQUEST_TIMEOUT_MS);
  });
  return Promise.race([
    Promise.resolve(request),
    timeout,
  ]).finally(() => window.clearTimeout(timeoutId));
}

function SchemeSlabEditor({ slabs, setSlabs, product }: { slabs: SchemeSlabForm[]; setSlabs: Dispatch<SetStateAction<SchemeSlabForm[]>>; product?: Product }) {
  return <div className="mt-4 rounded-xl border border-line p-4">
    <div className="flex items-center justify-between"><div><p className="font-bold">Quantity tiers</p><p className="text-xs text-slate-500">Ranges must not overlap. Leave maximum empty for the final open-ended tier.</p></div><button type="button" onClick={() => setSlabs((current) => [...current, newSlab()])} className="rounded-lg border border-line px-3 py-2 text-sm font-bold">Add tier</button></div>
    <div className="mt-3 space-y-2">{slabs.map((slab, index) => <div key={index} className="grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]">
      <label className="text-xs font-bold text-slate-600">From units<input required type="number" min="1" aria-label={`Tier ${index + 1} minimum units`} value={slab.minimum_quantity} onChange={(event) => setSlabs((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, minimum_quantity: event.target.value } : item))} className="mt-1 w-full rounded-lg border border-line px-3 py-2 text-sm font-normal" /></label>
      <label className="text-xs font-bold text-slate-600">To units <span className="font-normal">(optional)</span><input type="number" min="1" aria-label={`Tier ${index + 1} maximum units`} value={slab.maximum_quantity} onChange={(event) => setSlabs((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, maximum_quantity: event.target.value } : item))} className="mt-1 w-full rounded-lg border border-line px-3 py-2 text-sm font-normal" /></label>
      <label className="text-xs font-bold text-slate-600">Discount<input required type="number" min="0" max="100" step="0.01" aria-label={`Tier ${index + 1} discount percentage`} value={slab.discount_percentage} onChange={(event) => setSlabs((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, discount_percentage: event.target.value } : item))} className="mt-1 w-full rounded-lg border border-line px-3 py-2 text-sm font-normal" /><span className="text-[11px] font-normal text-slate-500">{product ? `Effective: ₹${(product.base_price * (1 - (Number(slab.discount_percentage) || 0) / 100)).toFixed(2)} / unit` : "Enter a percentage off"}</span></label>
      <button type="button" disabled={slabs.length === 1} onClick={() => setSlabs((current) => current.filter((_, itemIndex) => itemIndex !== index))} className="rounded-lg border border-line px-3 py-2 text-sm font-bold disabled:opacity-40" aria-label={`Remove tier ${index + 1}`}>Remove</button>
    </div>)}</div>
  </div>;
}

function SchemePreview({ form, product, slabs }: { form: SchemeForm; product: Product | undefined; slabs: SchemeSlabForm[] }) {
  if (!product) {
    return <div className="mt-4 rounded-xl border border-dashed border-line bg-paper p-4 text-sm text-slate-500">Select a product to preview what this offer means.</div>;
  }
  const minimum = Math.max(1, Number(form.minimum_quantity) || 1);
  const free = Math.max(0, Number(form.free_quantity) || 0);
  const discount = Math.min(100, Math.max(0, Number(form.discount_percentage) || 0));
  const discountedPrice = product.base_price * (1 - discount / 100);
  const slabSummary = slabs
    .filter((slab) => Number(slab.minimum_quantity) > 0)
    .map((slab) => `${slab.minimum_quantity}${slab.maximum_quantity ? `–${slab.maximum_quantity}` : "+"} units: ${slab.discount_percentage}% off`)
    .join(" · ");
  const explanation = form.scheme_type === "buy_x_get_y"
    ? `Buy ${minimum} paid unit${minimum === 1 ? "" : "s"}, get ${free} free. The customer pays ₹${(minimum * product.base_price).toFixed(2)} and receives ${minimum + free} units.`
    : form.scheme_type === "percentage"
      ? `Buy at least ${minimum} unit${minimum === 1 ? "" : "s"} and save ${discount}%: ₹${product.base_price.toFixed(2)} becomes ₹${discountedPrice.toFixed(2)} per unit.`
      : slabSummary || "Add quantity tiers below to define the discount.";
  return <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4" aria-live="polite"><p className="text-xs font-bold uppercase tracking-wide text-emerald-700">Customer-facing preview</p><p className="mt-1 font-bold text-emerald-900">{explanation}</p><p className="mt-2 text-xs text-emerald-800">Product base price: ₹{product.base_price.toFixed(2)} per unit. This is a draft preview; publish the scheme after checking the dates and quantities.</p></div>;
}

export default function AdminPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authed, setAuthed] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [products, setProducts] = useState<Product[]>([]);
  const [schemes, setSchemes] = useState<Scheme[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [productForm, setProductForm] = useState<ProductForm>(emptyProduct);
  const [schemeForm, setSchemeForm] = useState<SchemeForm>(newScheme());
  const [slabForms, setSlabForms] = useState<SchemeSlabForm[]>([newSlab()]);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [editingScheme, setEditingScheme] = useState<Scheme | null>(null);
  const [view, setView] = useState<View>("overview");
  const [orderQuery, setOrderQuery] = useState("");
  const [orderStatus, setOrderStatus] = useState<"all" | Order["status"]>("all");
  const [productQuery, setProductQuery] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loadingData, setLoadingData] = useState(false);
  const [productImage, setProductImage] = useState<File | null>(null);
  const [importingProducts, setImportingProducts] = useState(false);
  const [orderAssignments, setOrderAssignments] = useState<Record<string, string>>({});
  const [orderNotes, setOrderNotes] = useState<Record<string, string>>({});

  const getSupabase = () => createClient();

  const loadData = async () => {
    setLoadingData(true);
    setError("");
    const supabase = getSupabase();
    try {
      const [productResult, schemeResult, orderResult] = await withTimeout(Promise.all([
        supabase.from("products").select("*").order("name"),
        supabase.from("schemes").select("*, scheme_slabs(*)").order("updated_at", { ascending: false }),
        supabase.from("orders").select("*, order_items(*)").order("created_at", { ascending: false }),
      ]), "Loading admin data");
      const firstError = productResult.error ?? schemeResult.error ?? orderResult.error;
      if (firstError) {
        setError(firstError.message);
        return;
      }
      setProducts((productResult.data ?? []) as Product[]);
      setSchemes((schemeResult.data ?? []) as Scheme[]);
      setOrders((orderResult.data ?? []) as Order[]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load admin data.");
    } finally {
      setLoadingData(false);
    }
  };

  useEffect(() => {
    const supabase = getSupabase();
    void withTimeout(supabase.auth.getSession(), "Checking your session").then(({ data }) => {
      setAuthed(Boolean(data.session));
    }).catch((caught) => {
      setError(caught instanceof Error ? caught.message : "Unable to check your session.");
    }).finally(() => setCheckingSession(false));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthed(Boolean(session));
      setCheckingSession(false);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (authed) void loadData();
  }, [authed]);

  const login = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const { error: loginError } = await withTimeout(getSupabase().auth.signInWithPassword({ email, password }), "Signing in");
      if (loginError) setError(loginError.message);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to connect to Supabase.");
    } finally {
      setBusy(false);
    }
  };

  const logout = async () => {
    await getSupabase().auth.signOut();
    setAuthed(false);
    setView("overview");
  };

  const saveProduct = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    const supabase = getSupabase();
    let imageUrl = productForm.image_url || null;
    let uploadedPath: string | null = null;
    if (productImage) {
      try {
        await validateImageFile(productImage);
      } catch (caught) {
        setBusy(false);
        setError(caught instanceof Error ? caught.message : "The selected product image is invalid.");
        return;
      }
      const extension = productImage.name.split(".").pop()?.toLowerCase() || "jpg";
      uploadedPath = `products/${crypto.randomUUID()}.${extension}`;
      const { error: uploadError } = await supabase.storage.from("product-images").upload(uploadedPath, productImage, { cacheControl: "3600", upsert: false, contentType: productImage.type });
      if (uploadError) {
        setBusy(false);
        setError(`Image upload failed: ${uploadError.message}`);
        return;
      }
      const { data: publicUrl } = supabase.storage.from("product-images").getPublicUrl(uploadedPath);
      imageUrl = publicUrl.publicUrl;
    }
    const payload = {
      ...productForm,
      image_url: imageUrl,
      mrp: Number(productForm.mrp),
      base_price: Number(productForm.base_price),
      updated_at: new Date().toISOString(),
    };
    const query = editingProduct
      ? supabase.from("products").update(payload).eq("id", editingProduct.id)
      : supabase.from("products").insert({ ...payload, is_active: true });
    const { error: saveError } = await query;
    if (saveError && uploadedPath) await supabase.storage.from("product-images").remove([uploadedPath]);
    setBusy(false);
    if (saveError) {
      setError(saveError.message);
      return;
    }
    setMessage(editingProduct ? "Product updated." : "Product added.");
    setProductForm(emptyProduct);
    setProductImage(null);
    setEditingProduct(null);
    await loadData();
  };

  const exportProducts = () => {
    const headers = ["sku", "name", "brand", "category", "pack_size", "mrp", "base_price", "image_url", "description", "is_active"];
    const rows = products.map((product) => headers.map((header) => csvEscape(product[header as keyof Product] as string | number | boolean | null)).join(","));
    const blob = new Blob([[headers.join(","), ...rows].join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `tradescheme-products-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const importProducts = async (file: File) => {
    setImportingProducts(true);
    setError("");
    try {
      const rows = (await file.text()).split(/\r?\n/).filter((row) => row.trim()).map(parseCsvRow);
      if (rows.length < 2) throw new Error("The CSV must include a header row and at least one product.");
      const headers = rows[0].map((header) => header.toLowerCase());
      const requiredHeaders = ["sku", "name", "brand", "category", "pack_size", "mrp", "base_price"];
      const missingHeader = requiredHeaders.find((header) => !headers.includes(header));
      if (missingHeader) throw new Error(`The CSV is missing the required "${missingHeader}" column.`);
      const imported = rows.slice(1).map((row, rowIndex) => {
        const values = Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ""]));
        const mrp = Number(values.mrp);
        const basePrice = Number(values.base_price);
        if (!values.sku || !values.name || !Number.isFinite(mrp) || !Number.isFinite(basePrice) || mrp < 0 || basePrice < 0) {
          throw new Error(`Invalid product data on CSV row ${rowIndex + 2}. Check SKU, name, MRP, and base price.`);
        }
        return {
          sku: values.sku,
          name: values.name,
          brand: values.brand,
          category: values.category,
          pack_size: values.pack_size,
          mrp,
          base_price: basePrice,
          image_url: values.image_url || null,
          description: values.description || null,
          is_active: values.is_active !== "false",
          updated_at: new Date().toISOString(),
        };
      });
      const { error: importError } = await getSupabase().from("products").upsert(imported, { onConflict: "sku" });
      if (importError) throw new Error(importError.message);
      setMessage(`${imported.length} product${imported.length === 1 ? "" : "s"} imported.`);
      await loadData();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to import products.");
    } finally {
      setImportingProducts(false);
    }
  };

  const toggleProduct = async (product: Product) => {
    setBusy(true);
    setError("");
    const { error: updateError } = await getSupabase()
      .from("products")
      .update({ is_active: !product.is_active, updated_at: new Date().toISOString() })
      .eq("id", product.id);
    setBusy(false);
    if (updateError) setError(updateError.message);
    else {
      setMessage(product.is_active ? "Product hidden from the catalogue." : "Product restored.");
      await loadData();
    }
  };

  const saveScheme = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    const slabs = slabForms.map((slab) => ({
      minimum_quantity: Number(slab.minimum_quantity),
      maximum_quantity: slab.maximum_quantity ? Number(slab.maximum_quantity) : null,
      discount_percentage: Number(slab.discount_percentage),
    }));
    if (schemeForm.scheme_type === "slab") {
      const slabError = validateSlabs(slabs);
      if (slabError) {
        setError(slabError);
        setBusy(false);
        return;
      }
    }
    const payload = {
      product_id: schemeForm.product_id,
      scheme_type: schemeForm.scheme_type,
      minimum_quantity: Number(schemeForm.minimum_quantity),
      free_quantity: Number(schemeForm.free_quantity),
      discount_percentage: Number(schemeForm.discount_percentage),
      repeat_offer: schemeForm.repeat_offer,
      starts_at: new Date(schemeForm.starts_at).toISOString(),
      expires_at: schemeForm.expires_at ? new Date(schemeForm.expires_at).toISOString() : null,
      notes: schemeForm.notes || null,
      updated_at: new Date().toISOString(),
    };
    const { error: saveError } = await getSupabase().rpc("save_scheme_with_slabs", {
      p_scheme_id: editingScheme?.id ?? null,
      p_product_id: payload.product_id,
      p_scheme_type: payload.scheme_type,
      p_minimum_quantity: payload.minimum_quantity,
      p_free_quantity: payload.free_quantity,
      p_discount_percentage: payload.discount_percentage,
      p_repeat_offer: payload.repeat_offer,
      p_starts_at: payload.starts_at,
      p_expires_at: payload.expires_at,
      p_notes: payload.notes,
      p_slabs: schemeForm.scheme_type === "slab" ? slabs : [],
    });
    setBusy(false);
    if (saveError) {
      setError(saveError.message);
      return;
    }
    setMessage(editingScheme ? "Scheme updated." : "Scheme saved as draft.");
    setSchemeForm(newScheme());
    setSlabForms([newSlab()]);
    setEditingScheme(null);
    await loadData();
  };

  const updateSchemeStatus = async (scheme: Scheme, status: Scheme["status"]) => {
    setBusy(true);
    setError("");
    const { error: updateError } = await getSupabase()
      .from("schemes")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", scheme.id);
    setBusy(false);
    if (updateError) setError(updateError.message);
    else {
      setMessage(status === "published" ? "Scheme published." : "Scheme deactivated.");
      await loadData();
    }
  };

  const updateOrder = async (order: Order, updates: Partial<Pick<Order, "status" | "assigned_to" | "internal_notes">>) => {
    setBusy(true);
    setError("");
    const payload = { ...updates, ...(updates.status && updates.status !== "new" && !order.acknowledged_at ? { acknowledged_at: new Date().toISOString() } : {}) };
    const { error: updateError } = await getSupabase().from("orders").update(payload).eq("id", order.id);
    setBusy(false);
    if (updateError) setError(updateError.message);
    else {
      setMessage(updates.status ? `Order marked ${updates.status}.` : "Order details saved.");
      await loadData();
    }
  };

  const exportOrders = () => {
    const headers = ["order_number", "customer_name", "customer_phone", "customer_business", "status", "assigned_to", "created_at", "acknowledged_at", "internal_notes"];
    const rows = orders.map((order) => headers.map((header) => csvEscape(order[header as keyof Order] as string | number | boolean | null)).join(","));
    const blob = new Blob([[headers.join(","), ...rows].join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `tradescheme-orders-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const copyOrderTemplate = async (order: Order, template: "received" | "confirmed" | "fulfilled") => {
    const templates = {
      received: `Hi ${order.customer_name}, we received your order request ${order.order_number}. We are checking availability and will confirm shortly.`,
      confirmed: `Hi ${order.customer_name}, your order ${order.order_number} is confirmed. We will share delivery details soon.`,
      fulfilled: `Hi ${order.customer_name}, order ${order.order_number} has been fulfilled. Thank you for your business.`,
    };
    await navigator.clipboard.writeText(templates[template]);
    setMessage("Response template copied.");
  };

  const filteredOrders = useMemo(() => orders.filter((order) => {
    const query = orderQuery.toLowerCase();
    const matchesQuery = !query || [order.order_number, order.customer_name, order.customer_phone, order.customer_business]
      .some((value) => value?.toLowerCase().includes(query));
    return matchesQuery && (orderStatus === "all" || order.status === orderStatus);
  }), [orders, orderQuery, orderStatus]);

  const filteredProducts = useMemo(() => products.filter((product) => {
    const matchesQuery = !productQuery || [product.name, product.sku, product.brand, product.category]
      .some((value) => value.toLowerCase().includes(productQuery.toLowerCase()));
    return matchesQuery && (showInactive || product.is_active);
  }), [products, productQuery, showInactive]);

  const beginProductEdit = (product: Product) => {
    setEditingProduct(product);
    setProductForm({
      sku: product.sku,
      name: product.name,
      brand: product.brand,
      category: product.category,
      pack_size: product.pack_size,
      mrp: String(product.mrp),
      base_price: String(product.base_price),
      image_url: product.image_url ?? "",
    });
    setProductImage(null);
    setView("products");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const beginSchemeEdit = (scheme: Scheme) => {
    setEditingScheme(scheme);
    setSchemeForm({
      product_id: scheme.product_id,
      scheme_type: scheme.scheme_type,
      minimum_quantity: String(scheme.minimum_quantity),
      free_quantity: String(scheme.free_quantity),
      discount_percentage: String(scheme.discount_percentage),
      repeat_offer: scheme.repeat_offer,
      starts_at: scheme.starts_at.slice(0, 16),
      expires_at: scheme.expires_at?.slice(0, 16) ?? "",
      notes: scheme.notes ?? "",
    });
    setSlabForms((scheme.scheme_slabs ?? []).map((slab) => ({
      minimum_quantity: String(slab.minimum_quantity),
      maximum_quantity: slab.maximum_quantity === null ? "" : String(slab.maximum_quantity),
      discount_percentage: String(slab.discount_percentage),
    })));
    setView("schemes");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  if (checkingSession) {
    return <main className="flex min-h-screen items-center justify-center bg-paper p-5"><div className="text-center"><RefreshCw className="mx-auto animate-spin text-mint" /><p className="mt-3 text-sm font-bold text-slate-600">Checking your session...</p>{error && <p role="alert" className="mt-3 max-w-sm text-sm text-red-700">{error}</p>}</div></main>;
  }

  if (!authed) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-paper p-5">
        <div className="card w-full max-w-md p-8">
          <a href="/" className="flex items-center gap-2 text-sm font-bold text-navy"><ArrowLeft size={16} /> Back to catalogue</a>
          <div className="mt-10 flex h-12 w-12 items-center justify-center rounded-2xl bg-navy text-white"><LockKeyhole /></div>
          <h1 className="mt-5 text-2xl font-black">Owner workspace</h1>
          <p className="mt-2 text-sm text-slate-500">Manage products, schemes, and incoming order requests.</p>
          <form onSubmit={login} className="mt-7 space-y-4">
            <label className="block"><span className="sr-only">Owner email</span><input required type="email" autoComplete="email" placeholder="Owner email" value={email} onChange={(event) => setEmail(event.target.value)} className="w-full rounded-xl border border-line px-4 py-3" /></label>
            <label className="block"><span className="sr-only">Password</span><input required type="password" autoComplete="current-password" placeholder="Password" value={password} onChange={(event) => setPassword(event.target.value)} className="w-full rounded-xl border border-line px-4 py-3" /></label>
            <button type="submit" disabled={busy} className="w-full rounded-xl bg-navy px-4 py-3 font-bold text-white">{busy ? "Signing in..." : "Sign in securely"}</button>
          </form>
          {error && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        </div>
      </main>
    );
  }

  const navItems: Array<{ id: View; label: string; icon: typeof BarChart3 }> = [
    { id: "overview", label: "Overview", icon: BarChart3 },
    { id: "orders", label: "Orders", icon: Database },
    { id: "products", label: "Products", icon: Package },
    { id: "schemes", label: "Schemes", icon: Tags },
  ];

  return (
    <main className="min-h-screen bg-paper">
      <header className="border-b border-line bg-white">
        <div className="container-shell flex min-h-20 items-center justify-between gap-4">
          <div className="flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-navy text-sm font-black text-white">TS</span><div><p className="font-black">TradeScheme Admin</p><p className="text-xs text-slate-500">Owner workspace</p></div></div>
          <div className="flex items-center gap-3"><a href="/" className="hidden items-center gap-2 text-sm font-bold text-navy sm:flex"><ArrowLeft size={16} /> Public catalogue</a><button type="button" onClick={logout} className="flex items-center gap-2 rounded-lg px-2 py-2 text-sm font-bold text-slate-600 hover:bg-paper"><LogOut size={16} /> Sign out</button></div>
        </div>
      </header>
      <div className="container-shell py-6">
        <nav className="mb-6 flex gap-2 overflow-x-auto border-b border-line pb-2" aria-label="Admin sections">
          {navItems.map(({ id, label, icon: Icon }) => <button key={id} type="button" onClick={() => setView(id)} aria-current={view === id ? "page" : undefined} className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-bold ${view === id ? "bg-navy text-white" : "text-slate-600 hover:bg-white"}`}><Icon size={16} /> {label}{id === "orders" && orders.filter((order) => order.status === "new").length > 0 && <span className="rounded-full bg-coral px-2 py-0.5 text-xs text-white">{orders.filter((order) => order.status === "new").length}</span>}</button>)}
        </nav>
        {message && <div className="mb-5 flex items-center justify-between rounded-xl bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800" role="status" aria-live="polite"><span className="flex items-center gap-2"><CheckCircle2 size={17} /> {message}</span><button type="button" onClick={() => setMessage("")} aria-label="Dismiss message"><X size={16} /></button></div>}
        {error && <div role="alert" className="mb-5 flex items-center gap-2 rounded-xl bg-red-50 px-4 py-3 text-sm font-bold text-red-700"><CircleAlert size={17} /> {error}</div>}
        {loadingData && <div className="mb-5 flex items-center justify-between rounded-xl bg-white px-4 py-3 text-sm font-bold text-slate-600 shadow-card"><span className="flex items-center gap-2"><RefreshCw size={17} className="animate-spin text-mint" /> Loading the latest workspace data...</span><button type="button" onClick={() => void loadData()} className="font-bold text-mint">Retry</button></div>}

        {view === "overview" && <section>
          <div className="mb-6"><p className="eyebrow">Daily control room</p><h1 className="mt-1 text-3xl font-black">Good morning, owner.</h1><p className="mt-2 text-sm text-slate-500">Keep the catalogue current and respond to order requests quickly.</p></div>
          <div className="grid gap-4 sm:grid-cols-3">
            <button type="button" onClick={() => setView("products")} className="card p-5 text-left transition hover:-translate-y-0.5 hover:border-mint"><Package className="text-mint" /><p className="mt-4 text-sm text-slate-500">Active products</p><p className="text-2xl font-black">{products.filter((product) => product.is_active).length}</p><p className="mt-2 flex items-center gap-1 text-xs font-bold text-mint">Manage products <ChevronRight size={14} /></p></button>
            <button type="button" onClick={() => setView("schemes")} className="card p-5 text-left transition hover:-translate-y-0.5 hover:border-mint"><Tags className="text-mint" /><p className="mt-4 text-sm text-slate-500">Published schemes</p><p className="text-2xl font-black">{schemes.filter((scheme) => scheme.status === "published").length}</p><p className="mt-2 flex items-center gap-1 text-xs font-bold text-mint">Manage schemes <ChevronRight size={14} /></p></button>
            <button type="button" onClick={() => setView("orders")} className="card p-5 text-left transition hover:-translate-y-0.5 hover:border-mint"><Database className="text-mint" /><p className="mt-4 text-sm text-slate-500">New orders</p><p className="text-2xl font-black">{orders.filter((order) => order.status === "new").length}</p><p className="mt-2 flex items-center gap-1 text-xs font-bold text-mint">Open order inbox <ChevronRight size={14} /></p></button>
          </div>
          <div className="card mt-6 p-6"><p className="eyebrow">Next actions</p><div className="mt-4 grid gap-3 sm:grid-cols-2"><button type="button" onClick={() => { setView("products"); setEditingProduct(null); setProductForm(emptyProduct); }} className="flex items-center justify-between rounded-xl border border-line p-4 text-left hover:border-mint"><span><span className="block font-bold">Add a product</span><span className="text-xs text-slate-500">Make a new SKU available</span></span><Plus size={18} className="text-mint" /></button><button type="button" onClick={() => { setView("schemes"); setEditingScheme(null); setSchemeForm(newScheme()); }} className="flex items-center justify-between rounded-xl border border-line p-4 text-left hover:border-mint"><span><span className="block font-bold">Create a scheme</span><span className="text-xs text-slate-500">Save as draft, then publish</span></span><Plus size={18} className="text-mint" /></button></div></div>
        </section>}

        {view === "orders" && <section>
          <div className="mb-6 flex flex-col justify-between gap-3 sm:flex-row sm:items-end"><div><p className="eyebrow">Order inbox</p><h1 className="mt-1 text-3xl font-black">Incoming requests</h1><p className="mt-2 text-sm text-slate-500">Review customer details, confirm availability, and move each request through fulfilment.</p></div><button type="button" onClick={exportOrders} className="flex items-center gap-2 self-start rounded-xl border border-line px-3 py-3 text-sm font-bold text-navy sm:self-auto"><Download size={17} /> Export orders</button></div>
          <div className="card mb-5 grid gap-3 p-4 md:grid-cols-[1fr_auto]"><label className="flex items-center gap-2 rounded-xl border border-line px-3"><Search size={17} className="text-slate-400" /><input value={orderQuery} onChange={(event) => setOrderQuery(event.target.value)} placeholder="Search reference, customer, phone..." className="w-full py-2 outline-none" /></label><label className="flex items-center gap-2"><Filter size={16} className="text-slate-500" /><select value={orderStatus} onChange={(event) => setOrderStatus(event.target.value as typeof orderStatus)} className="rounded-xl border border-line px-3 py-2"><option value="all">All statuses</option><option value="new">New</option><option value="confirmed">Confirmed</option><option value="rejected">Rejected</option><option value="fulfilled">Fulfilled</option></select></label></div>
          <div className="space-y-4">{filteredOrders.map((order) => { const ageHours = (Date.now() - new Date(order.created_at).getTime()) / 3_600_000; const slaBreached = order.status === "new" && ageHours >= 24; return <article key={order.id} className="card p-5"><div className="flex flex-col justify-between gap-4 md:flex-row"><div><div className="flex flex-wrap items-center gap-2"><span className="rounded-md bg-navy px-2 py-1 text-xs font-black text-white">{order.order_number || `TS-${order.id.slice(0, 8).toUpperCase()}`}</span><span className="rounded-md bg-paper px-2 py-1 text-xs font-bold capitalize text-slate-600">{order.status}</span>{slaBreached ? <span className="rounded-md bg-red-50 px-2 py-1 text-xs font-bold text-red-700">SLA overdue</span> : order.status === "new" && <span className="rounded-md bg-amber-50 px-2 py-1 text-xs font-bold text-amber-700">Respond within {Math.max(1, Math.ceil(24 - ageHours))}h</span>}</div><h2 className="mt-3 text-lg font-black">{order.customer_name}</h2><p className="text-sm text-slate-500">{order.customer_business || "Retail customer"} · {order.customer_phone}</p><p className="mt-1 text-xs text-slate-400">{formatDate(order.created_at)}</p></div><select aria-label={`Status for ${order.order_number}`} value={order.status} disabled={busy} onChange={(event) => void updateOrder(order, { status: event.target.value as Order["status"] })} className="h-10 rounded-xl border border-line px-3 text-sm font-bold"><option value="new">New</option><option value="confirmed">Confirmed</option><option value="rejected">Rejected</option><option value="fulfilled">Fulfilled</option></select></div><div className="mt-4 border-t border-line pt-4">{order.order_items?.map((item, index) => <div key={`${order.id}-${index}`} className="flex justify-between gap-3 py-1 text-sm"><span>{item.product_name} <span className="text-slate-400">× {item.quantity}</span></span><span className="font-bold">₹{item.effective_price.toFixed(2)} / unit</span></div>)}</div>{(order.delivery_address || order.notes) && <div className="mt-3 rounded-xl bg-paper p-3 text-sm text-slate-600"><strong>Customer notes:</strong> {[order.delivery_address, order.notes].filter(Boolean).join(" · ")}</div>}<div className="mt-4 grid gap-3 border-t border-line pt-4 sm:grid-cols-2"><label className="text-sm font-bold text-slate-600">Assigned owner<input value={orderAssignments[order.id] ?? order.assigned_to ?? ""} onChange={(event) => setOrderAssignments((current) => ({ ...current, [order.id]: event.target.value }))} onBlur={() => { const owner = orderAssignments[order.id] ?? order.assigned_to ?? ""; if (owner !== (order.assigned_to || "")) void updateOrder(order, { assigned_to: owner || null }); }} placeholder="Name or team" className="mt-1 w-full rounded-lg border border-line px-3 py-2 font-normal" /></label><label className="text-sm font-bold text-slate-600">Internal notes<textarea value={orderNotes[order.id] ?? order.internal_notes ?? ""} onChange={(event) => setOrderNotes((current) => ({ ...current, [order.id]: event.target.value }))} onBlur={() => { const notes = orderNotes[order.id] ?? order.internal_notes ?? ""; if (notes !== (order.internal_notes || "")) void updateOrder(order, { internal_notes: notes || null }); }} placeholder="Private fulfilment notes" rows={2} className="mt-1 w-full rounded-lg border border-line px-3 py-2 font-normal" /></label></div><div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={() => void copyOrderTemplate(order, "received")} className="rounded-lg border border-line px-3 py-2 text-xs font-bold">Copy received reply</button><button type="button" onClick={() => void copyOrderTemplate(order, "confirmed")} className="rounded-lg border border-line px-3 py-2 text-xs font-bold">Copy confirmed reply</button><button type="button" onClick={() => void copyOrderTemplate(order, "fulfilled")} className="rounded-lg border border-line px-3 py-2 text-xs font-bold">Copy fulfilled reply</button></div></article>; })}{filteredOrders.length === 0 && <div className="card p-10 text-center"><Database className="mx-auto text-slate-300" /><p className="mt-3 font-bold">No matching orders</p><p className="mt-1 text-sm text-slate-500">New client requests will appear here.</p></div>}</div>
        </section>}

        {view === "products" && <section>
          <div className="mb-6 flex flex-col justify-between gap-3 sm:flex-row sm:items-end"><div><p className="eyebrow">Catalogue management</p><h1 className="mt-1 text-3xl font-black">Products</h1><p className="mt-2 text-sm text-slate-500">Edit pricing or hide products without deleting their order history.</p></div><div className="flex flex-wrap gap-2"><button type="button" onClick={exportProducts} className="flex items-center gap-2 rounded-xl border border-line px-3 py-3 text-sm font-bold text-navy"><Download size={17} /> Export CSV</button><label className={`flex cursor-pointer items-center gap-2 rounded-xl border border-line px-3 py-3 text-sm font-bold text-navy ${importingProducts ? "cursor-wait opacity-60" : ""}`}><Upload size={17} /> {importingProducts ? "Importing..." : "Import CSV"}<input type="file" accept=".csv,text/csv" disabled={importingProducts} onChange={(event) => { const file = event.target.files?.[0]; if (file) void importProducts(file); event.currentTarget.value = ""; }} className="sr-only" /></label><button type="button" onClick={() => { setEditingProduct(null); setProductForm(emptyProduct); }} className="flex items-center gap-2 rounded-xl bg-navy px-4 py-3 text-sm font-bold text-white"><Plus size={17} /> Add product</button></div></div>
          <form onSubmit={saveProduct} className="card mb-6 p-5"><div className="mb-4 flex items-center justify-between"><h2 className="font-black">{editingProduct ? "Edit product" : "New product"}</h2>{editingProduct && <button type="button" onClick={() => { setEditingProduct(null); setProductForm(emptyProduct); setProductImage(null); }} className="text-sm font-bold text-slate-500">Cancel</button>}</div><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><input required placeholder="SKU" value={productForm.sku} onChange={(event) => setProductForm((current) => ({ ...current, sku: event.target.value }))} className="rounded-xl border border-line px-3 py-3" /><input required placeholder="Name" value={productForm.name} onChange={(event) => setProductForm((current) => ({ ...current, name: event.target.value }))} className="rounded-xl border border-line px-3 py-3" /><input required placeholder="Brand" value={productForm.brand} onChange={(event) => setProductForm((current) => ({ ...current, brand: event.target.value }))} className="rounded-xl border border-line px-3 py-3" /><input required placeholder="Category" value={productForm.category} onChange={(event) => setProductForm((current) => ({ ...current, category: event.target.value }))} className="rounded-xl border border-line px-3 py-3" /><input required placeholder="Pack size" value={productForm.pack_size} onChange={(event) => setProductForm((current) => ({ ...current, pack_size: event.target.value }))} className="rounded-xl border border-line px-3 py-3" /><input required type="number" min="0" step="0.01" placeholder="MRP" value={productForm.mrp} onChange={(event) => setProductForm((current) => ({ ...current, mrp: event.target.value }))} className="rounded-xl border border-line px-3 py-3" /><input required type="number" min="0" step="0.01" placeholder="Base price" value={productForm.base_price} onChange={(event) => setProductForm((current) => ({ ...current, base_price: event.target.value }))} className="rounded-xl border border-line px-3 py-3" /><label className="rounded-xl border border-line px-3 py-2 text-sm font-bold text-slate-600"><span className="block text-xs text-slate-500">Product image</span><input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setProductImage(event.target.files?.[0] ?? null)} className="mt-1 w-full text-sm" /><span className="mt-1 block text-xs font-normal text-slate-500">JPG, PNG, or WebP up to 5 MB, max 4000 × 4000 px</span></label></div>{(productImage || productForm.image_url) && <div className="mt-4 flex items-center gap-3 rounded-xl bg-paper p-3">{productForm.image_url && <img src={productForm.image_url} alt="Current product" className="h-16 w-16 rounded-lg object-contain" />}<span className="text-sm text-slate-600">{productImage ? `Selected: ${productImage.name}` : "Current product image"}</span></div>}<button type="submit" disabled={busy} className="mt-4 rounded-xl bg-mint px-4 py-3 text-sm font-bold text-white">{busy ? productImage ? "Uploading image..." : "Saving..." : editingProduct ? "Update product" : "Save product"}</button></form>
          <div className="card overflow-hidden"><div className="flex flex-col gap-3 border-b border-line p-4 sm:flex-row"><label className="flex flex-1 items-center gap-2 rounded-xl border border-line px-3"><Search size={17} className="text-slate-400" /><input value={productQuery} onChange={(event) => setProductQuery(event.target.value)} placeholder="Search products..." className="w-full py-2 outline-none" /></label><label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={showInactive} onChange={(event) => setShowInactive(event.target.checked)} /> Show hidden</label></div><div className="divide-y divide-line">{filteredProducts.map((product) => <div key={product.id} className="flex flex-col justify-between gap-3 p-4 sm:flex-row sm:items-center"><div><div className="flex items-center gap-2"><h2 className="font-black">{product.name}</h2><span className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase ${product.is_active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{product.is_active ? "Active" : "Hidden"}</span></div><p className="text-sm text-slate-500">{product.brand} · {product.sku} · ₹{product.base_price.toFixed(2)}</p></div><div className="flex gap-2"><button type="button" onClick={() => beginProductEdit(product)} className="flex items-center gap-1 rounded-lg border border-line px-3 py-2 text-sm font-bold"><Edit3 size={15} /> Edit</button><button type="button" disabled={busy} onClick={() => void toggleProduct(product)} className="rounded-lg border border-line px-3 py-2 text-sm font-bold text-slate-600">{product.is_active ? "Hide" : "Restore"}</button></div></div>)}{filteredProducts.length === 0 && <p className="p-8 text-center text-sm text-slate-500">No products match this search.</p>}</div></div>
        </section>}

        {view === "schemes" && <section>
          <div className="mb-6"><p className="eyebrow">Trade offer management</p><h1 className="mt-1 text-3xl font-black">Schemes</h1><p className="mt-2 text-sm text-slate-500">Draft, publish, edit, or deactivate offers without touching code.</p></div>
          <form onSubmit={saveScheme} className="card mb-6 p-5"><div className="mb-4 flex items-center justify-between"><div><h2 className="font-black">{editingScheme ? "Edit scheme" : "New scheme"}</h2><p className="mt-1 text-xs text-slate-500">Choose an offer type, then fill only the values that define it.</p></div>{editingScheme && <button type="button" onClick={() => { setEditingScheme(null); setSchemeForm(newScheme()); setSlabForms([newSlab()]); }} className="text-sm font-bold text-slate-500">Cancel</button>}</div><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"><label className="block text-sm font-bold text-slate-700 sm:col-span-2 lg:col-span-1"><span>Product</span><select required value={schemeForm.product_id} onChange={(event) => setSchemeForm((current) => ({ ...current, product_id: event.target.value }))} className="mt-1 w-full rounded-xl border border-line px-3 py-3 font-normal"><option value="">Select product</option>{products.filter((product) => product.is_active).map((product) => <option key={product.id} value={product.id}>{product.name} · {product.sku}</option>)}</select></label><label className="block text-sm font-bold text-slate-700"><span>Offer type</span><select value={schemeForm.scheme_type} onChange={(event) => setSchemeForm((current) => ({ ...current, scheme_type: event.target.value as SchemeType }))} className="mt-1 w-full rounded-xl border border-line px-3 py-3 font-normal"><option value="buy_x_get_y">Buy X, get Y free</option><option value="percentage">Percentage price discount</option><option value="slab">Quantity-based discount tiers</option></select></label>{schemeForm.scheme_type !== "slab" && <label className="block text-sm font-bold text-slate-700"><span>{schemeForm.scheme_type === "buy_x_get_y" ? "Paid units required" : "Minimum units to qualify"}</span><span className="block text-xs font-normal text-slate-500">{schemeForm.scheme_type === "buy_x_get_y" ? "How many units the customer pays for" : "Smallest order quantity that receives the discount"}</span><input required type="number" min="1" value={schemeForm.minimum_quantity} onChange={(event) => setSchemeForm((current) => ({ ...current, minimum_quantity: event.target.value }))} className="mt-1 w-full rounded-xl border border-line px-3 py-3 font-normal" /></label>}{schemeForm.scheme_type === "buy_x_get_y" && <label className="block text-sm font-bold text-slate-700"><span>Free units included</span><span className="block text-xs font-normal text-slate-500">Units added at no charge</span><input required type="number" min="1" value={schemeForm.free_quantity} onChange={(event) => setSchemeForm((current) => ({ ...current, free_quantity: event.target.value }))} className="mt-1 w-full rounded-xl border border-line px-3 py-3 font-normal" /></label>}{schemeForm.scheme_type === "percentage" && <label className="block text-sm font-bold text-slate-700"><span>Discount percentage</span><span className="block text-xs font-normal text-slate-500">Percentage removed from the base price</span><div className="mt-1 flex items-center"><input required type="number" min="0" max="100" step="0.01" value={schemeForm.discount_percentage} onChange={(event) => setSchemeForm((current) => ({ ...current, discount_percentage: event.target.value }))} className="w-full rounded-l-xl border border-line px-3 py-3 font-normal" /><span className="rounded-r-xl border border-l-0 border-line bg-paper px-3 py-3">%</span></div></label>}{schemeForm.scheme_type === "slab" && <div className="rounded-xl border border-dashed border-line bg-paper p-3 text-sm text-slate-600 sm:col-span-2 lg:col-span-3"><strong>How slab discounts work:</strong> customers receive the percentage attached to the quantity range they reach. Example: 10–19 units at 5% off means ₹100 becomes ₹95 per unit.</div>}<label className="block text-sm font-bold text-slate-700"><span>Starts</span><input required type="datetime-local" value={schemeForm.starts_at} onChange={(event) => setSchemeForm((current) => ({ ...current, starts_at: event.target.value }))} className="mt-1 w-full rounded-xl border border-line px-3 py-3 font-normal" /></label><label className="block text-sm font-bold text-slate-700"><span>Expires (optional)</span><input type="datetime-local" value={schemeForm.expires_at} onChange={(event) => setSchemeForm((current) => ({ ...current, expires_at: event.target.value }))} className="mt-1 w-full rounded-xl border border-line px-3 py-3 font-normal" /></label><label className="block text-sm font-bold text-slate-700 sm:col-span-2"><span>Notes</span><textarea placeholder="Example: Buy 10 cartons and receive 1 carton free." value={schemeForm.notes} onChange={(event) => setSchemeForm((current) => ({ ...current, notes: event.target.value }))} className="mt-1 min-h-12 w-full rounded-xl border border-line px-3 py-3 font-normal" /></label></div>{schemeForm.scheme_type === "slab" && <SchemeSlabEditor slabs={slabForms} setSlabs={setSlabForms} product={products.find((product) => product.id === schemeForm.product_id)} />}<SchemePreview form={schemeForm} product={products.find((product) => product.id === schemeForm.product_id)} slabs={slabForms} /><label className="mt-3 flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={schemeForm.repeat_offer} onChange={(event) => setSchemeForm((current) => ({ ...current, repeat_offer: event.target.checked }))} /> Repeat “Buy X, get Y free” for every qualifying batch</label><button type="submit" disabled={busy} className="mt-4 rounded-xl bg-mint px-4 py-3 text-sm font-bold text-white">{busy ? "Saving..." : editingScheme ? "Update scheme" : "Save as draft"}</button></form>
          <div className="space-y-3">{schemes.map((scheme) => <article key={scheme.id} className="card flex flex-col justify-between gap-4 p-5 sm:flex-row sm:items-center"><div><div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-paper px-2 py-1 text-xs font-black capitalize text-slate-600">{scheme.status}</span><span className="text-xs text-slate-400">{formatDate(scheme.updated_at)}</span></div><h2 className="mt-2 font-black">{products.find((product) => product.id === scheme.product_id)?.name ?? "Unknown product"}</h2><p className="text-sm text-slate-500">{scheme.scheme_type === "buy_x_get_y" ? `Buy ${scheme.minimum_quantity}, get ${scheme.free_quantity} free` : scheme.scheme_type === "percentage" ? `${scheme.discount_percentage}% discount from ${scheme.minimum_quantity} units` : "Quantity slab offer"}</p></div><div className="flex flex-wrap gap-2"><button type="button" onClick={() => beginSchemeEdit(scheme)} className="flex items-center gap-1 rounded-lg border border-line px-3 py-2 text-sm font-bold"><Edit3 size={15} /> Edit</button>{scheme.status !== "published" && <button type="button" disabled={busy} onClick={() => void updateSchemeStatus(scheme, "published")} className="rounded-lg bg-mint px-3 py-2 text-sm font-bold text-white">Publish</button>}{scheme.status === "published" && <button type="button" disabled={busy} onClick={() => void updateSchemeStatus(scheme, "inactive")} className="rounded-lg border border-line px-3 py-2 text-sm font-bold">Deactivate</button>}</div></article>)}{schemes.length === 0 && <div className="card p-8 text-center text-sm text-slate-500">No schemes yet. Create the first draft above.</div>}</div>
        </section>}
      </div>
    </main>
  );
}
