import type { Metadata, Viewport } from "next";
import { Cairo } from "next/font/google";
import "./globals.css";

const cairo = Cairo({ subsets: ["arabic", "latin"], variable: "--font-cairo", display: "swap" });

export const metadata: Metadata = {
  title: { default: "عيادتي — حجز مواعيد العيادات", template: "%s | عيادتي" },
  description: "نظام حجز مواعيد للعيادات: صفحة حجز أونلاين، داشبورد للسكرتارية، وتذكيرات واتساب.",
};

export const viewport: Viewport = { themeColor: "#0f7867", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ar" dir="rtl" className={cairo.variable}>
      <body className="min-h-dvh font-sans antialiased">{children}</body>
    </html>
  );
}
