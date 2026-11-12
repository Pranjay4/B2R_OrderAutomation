import { getProducts } from "@/lib/data";
import Catalogue from "@/components/catalogue";
import type { CatalogueData } from "@/lib/types";

export const revalidate = 60;

export default async function Home() {
  let catalogue: CatalogueData = { products: [], isPreview: false };
  let error = "";
  try { catalogue = await getProducts(); } catch (caught) { error = caught instanceof Error ? caught.message : "Unable to load catalogue"; }
  return <Catalogue initialProducts={catalogue.products} isPreview={catalogue.isPreview} loadError={error} />;
}
