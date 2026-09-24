import type { Metadata } from "next";
import { Manrope, Playfair_Display } from "next/font/google";
import { teaBrand } from "@/content/tea";

const display = Playfair_Display({
  variable: "--font-tea-display",
  subsets: ["latin"],
  weight: ["400", "500"],
  style: ["normal", "italic"],
});

const sans = Manrope({
  variable: "--font-tea-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: `${teaBrand.name} ${teaBrand.suffix}`,
  description: teaBrand.description,
  openGraph: {
    title: `${teaBrand.name} ${teaBrand.suffix}`,
    description: teaBrand.description,
    type: "website",
  },
};

export default function TeaLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <div className={`${display.variable} ${sans.variable}`}>{children}</div>;
}
