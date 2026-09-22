import type { Metadata } from "next";
import { IBM_Plex_Mono } from "next/font/google";
import { brand } from "@/content/site";
import "./globals.css";

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: `${brand.name} Inc.`,
  description: brand.description,
  openGraph: {
    title: `${brand.name} Inc.`,
    description: brand.description,
    type: "website",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: `${brand.name} Inc.`,
    description: brand.description,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${plexMono.variable} antialiased`}>
      <body>{children}</body>
    </html>
  );
}
