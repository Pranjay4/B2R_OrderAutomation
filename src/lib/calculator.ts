import type { Product, Scheme, Slab } from "./types";

export type Calculation = {
  quantity: number;
  paidQuantity: number;
  freeQuantity: number;
  totalUnits: number;
  totalPayable: number;
  discountAmount: number;
  effectivePrice: number;
  savingsPerUnit: number;
  currentLabel: string;
  nextQuantity: number | null;
  nextSavings: number;
};

const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const validQuantity = (quantity: number) =>
  Number.isFinite(quantity) ? Math.min(1_000_000, Math.max(0, Math.floor(quantity))) : 0;

export function calculateScheme(product: Product, scheme: Scheme | null, inputQuantity: number): Calculation {
  const quantity = validQuantity(inputQuantity);
  const basePrice = Math.max(0, product.base_price);
  if (!scheme || scheme.status !== "published" || quantity === 0) {
    return { quantity, paidQuantity: quantity, freeQuantity: 0, totalUnits: quantity, totalPayable: money(quantity * basePrice), discountAmount: 0, effectivePrice: quantity ? money(basePrice) : 0, savingsPerUnit: 0, currentLabel: "Standard distributor price", nextQuantity: scheme?.minimum_quantity ?? null, nextSavings: 0 };
  }

  if (scheme.scheme_type === "buy_x_get_y") {
    const minimum = Math.max(1, scheme.minimum_quantity);
    const groups = scheme.repeat_offer ? Math.floor(quantity / minimum) : quantity >= minimum ? 1 : 0;
    const freeQuantity = groups * Math.max(0, scheme.free_quantity);
    const paidQuantity = quantity;
    const totalUnits = paidQuantity + freeQuantity;
    const totalPayable = paidQuantity * basePrice;
    const nextQuantity = quantity < minimum ? minimum : scheme.repeat_offer ? (Math.floor(quantity / minimum) + 1) * minimum : null;
    return { quantity, paidQuantity, freeQuantity, totalUnits, totalPayable: money(totalPayable), discountAmount: money(freeQuantity * basePrice), effectivePrice: money(totalPayable / Math.max(1, totalUnits)), savingsPerUnit: money(basePrice - totalPayable / Math.max(1, totalUnits)), currentLabel: freeQuantity ? `Buy ${minimum}, get ${scheme.free_quantity} free` : `Buy ${minimum}, get ${scheme.free_quantity} free`, nextQuantity, nextSavings: money((nextQuantity ? scheme.free_quantity * basePrice / (nextQuantity + scheme.free_quantity) : 0)) };
  }

  const slabs = [...(scheme.scheme_slabs ?? [])].sort((a, b) => a.minimum_quantity - b.minimum_quantity);
  const applicable: Slab | undefined = scheme.scheme_type === "slab"
    ? slabs.filter((slab) => quantity >= slab.minimum_quantity && (slab.maximum_quantity === null || quantity <= slab.maximum_quantity)).at(-1)
    : quantity >= scheme.minimum_quantity
      ? { minimum_quantity: scheme.minimum_quantity, maximum_quantity: null, discount_percentage: scheme.discount_percentage }
      : undefined;
  const discount = applicable?.discount_percentage ?? 0;
  const unitPrice = basePrice * (1 - discount / 100);
  const totalPayable = quantity * unitPrice;
  const next = slabs.find((slab) => slab.minimum_quantity > quantity) ?? (scheme.scheme_type === "percentage" && quantity < scheme.minimum_quantity ? { minimum_quantity: scheme.minimum_quantity, maximum_quantity: null, discount_percentage: scheme.discount_percentage } : undefined);
  return { quantity, paidQuantity: quantity, freeQuantity: 0, totalUnits: quantity, totalPayable: money(totalPayable), discountAmount: money(quantity * basePrice - totalPayable), effectivePrice: money(unitPrice), savingsPerUnit: money(basePrice - unitPrice), currentLabel: applicable ? `${discount}% discount unlocked` : "Add more units to unlock", nextQuantity: next?.minimum_quantity ?? null, nextSavings: next ? money((next.discount_percentage - discount) * basePrice / 100) : 0 };
}
