import type { Slab } from "./types";

export function validateSlabs(slabs: Slab[]): string | null {
  const sorted = [...slabs].sort((a, b) => a.minimum_quantity - b.minimum_quantity);
  if (sorted.length === 0) return "Add at least one slab tier.";
  for (const slab of sorted) {
    if (!Number.isInteger(slab.minimum_quantity) || slab.minimum_quantity < 1) return "Each slab minimum must be a positive whole number.";
    if (slab.maximum_quantity !== null && (!Number.isInteger(slab.maximum_quantity) || slab.maximum_quantity < slab.minimum_quantity)) return "Each slab maximum must be empty or at least its minimum.";
    if (!Number.isFinite(slab.discount_percentage) || slab.discount_percentage < 0 || slab.discount_percentage > 100) return "Slab discounts must be between 0% and 100%.";
  }
  for (let index = 1; index < sorted.length; index += 1) {
    const previous = sorted[index - 1];
    const current = sorted[index];
    if (previous.maximum_quantity === null || previous.maximum_quantity >= current.minimum_quantity) return "Slab quantity ranges cannot overlap.";
  }
  return null;
}
