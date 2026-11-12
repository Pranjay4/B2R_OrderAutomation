import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "TradeScheme | Distributor catalogue", description: "Published trade schemes for your retail partners." };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
