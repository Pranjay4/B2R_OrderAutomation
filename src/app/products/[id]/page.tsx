import type { Metadata } from "next";
import { notFound } from "next/navigation";
import ProductDetail from "@/components/product-detail";
import { getProduct } from "@/lib/data";

type Props = { params: { id: string } };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const product = await getProduct(params.id);
  return product ? { title: `${product.name} | TradeScheme`, description: product.description || `View pricing and published schemes for ${product.name}.` } : { title: "Product not found | TradeScheme" };
}

export default async function ProductPage({ params }: Props) {
  const product = await getProduct(params.id);
  if (!product) notFound();
  return <ProductDetail product={product} />;
}
