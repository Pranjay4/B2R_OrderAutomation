"use client";

import { Share2 } from "lucide-react";
import { useState } from "react";
import { calculateScheme } from "@/lib/calculator";
import type { Product } from "@/lib/types";

export default function ProductDetail({ product }: { product: Product }) {
  const scheme = product.schemes?.[0] ?? null;
  const calculation = calculateScheme(product, scheme, scheme?.minimum_quantity ?? 1);
  const [message, setMessage] = useState("");

  const share = async () => {
    const url = window.location.href;
    const text = `${product.name} (${product.sku}) - ${scheme ? calculation.currentLabel : "Standard distributor pricing"}.`;
    try {
      if (navigator.share) {
        await navigator.share({ title: product.name, text, url });
      } else {
        await navigator.clipboard.writeText(url);
        setMessage("Product link copied.");
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setMessage("Unable to share this product link. Copy the URL from your browser instead.");
    }
  };

  return (
    <main className="min-h-screen bg-paper">
      <header className="border-b border-line bg-white">
        <div className="container-shell flex min-h-20 items-center justify-between gap-4">
          <a href="/" className="text-xl font-black text-navy">TradeScheme</a>
          <a href="/" className="rounded-lg border border-line px-3 py-2 text-sm font-bold text-navy">Back to catalogue</a>
        </div>
      </header>
      <div className="container-shell py-8 sm:py-12">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="flex min-h-80 items-center justify-center rounded-3xl bg-white p-8 shadow-card">
            {product.image_url ? <img src={product.image_url} alt={product.name} className="max-h-96 max-w-full object-contain" /> : <div className="flex h-32 w-32 items-center justify-center rounded-full bg-paper text-5xl font-black text-navy">{product.brand.slice(0, 1)}</div>}
          </div>
          <section>
            <p className="eyebrow">{product.brand} · {product.sku}</p>
            <h1 className="mt-2 text-3xl font-black text-ink sm:text-4xl">{product.name}</h1>
            <p className="mt-3 text-slate-600">{product.pack_size} · {product.category}</p>
            <p className="mt-6 text-slate-600">{product.description || "Contact your distributor for product details and availability."}</p>
            <div className="mt-6 grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-line bg-white p-4"><p className="text-xs text-slate-500">MRP</p><p className="mt-1 text-xl font-bold">₹{product.mrp.toFixed(2)}</p></div>
              <div className="rounded-xl border border-line bg-white p-4"><p className="text-xs text-slate-500">Distributor price</p><p className="mt-1 text-xl font-bold">₹{product.base_price.toFixed(2)}</p></div>
            </div>
            <div className="mt-5 rounded-2xl bg-emerald-50 p-5">
              <p className="text-xs font-bold uppercase tracking-wide text-emerald-700">Published offer</p>
              <p className="mt-1 text-xl font-bold text-emerald-900">{scheme ? calculation.currentLabel : "Standard distributor pricing"}</p>
              <p className="mt-2 text-sm text-emerald-800">{scheme?.notes || "No published scheme is currently available for this product."}</p>
              {scheme && <p className="mt-2 text-sm text-emerald-800">Effective price from {scheme.minimum_quantity} units: ₹{calculation.effectivePrice.toFixed(2)} per unit.</p>}
            </div>
            <div className="mt-5 flex flex-col gap-3 sm:flex-row">
              <button type="button" onClick={share} className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-navy px-4 py-3 font-bold text-navy"><Share2 size={17} /> Share product</button>
              <a href={`https://wa.me/?text=${encodeURIComponent(`${product.name} (${product.sku}) ${window.location.href}`)}`} target="_blank" rel="noreferrer" className="flex flex-1 items-center justify-center rounded-xl bg-navy px-4 py-3 text-center font-bold text-white">Share on WhatsApp</a>
            </div>
            {message && <p role="status" aria-live="polite" className="mt-3 text-sm font-semibold text-emerald-700">{message}</p>}
          </section>
        </div>
      </div>
    </main>
  );
}
