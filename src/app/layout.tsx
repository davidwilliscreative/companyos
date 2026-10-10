import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CompanyOS (demo)",
  description: "Company intelligence and operating platform. Phase-one demo with synthetic data.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
