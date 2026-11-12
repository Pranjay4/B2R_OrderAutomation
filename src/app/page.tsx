import { getProducts } from "@/lib/data";
import Catalogue from "@/components/catalogue";
import type { Product } from "@/lib/types";

export const revalidate = 60;

export default async function Home() {
  let products: Product[] = [];
  let error = "";
  try { products = await getProducts(); } catch (caught) { error = caught instanceof Error ? caught.message : "Unable to load catalogue"; }
  return <Catalogue initialProducts={products} loadError={error} />;
}
