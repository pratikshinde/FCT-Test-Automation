import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FCT Admin",
  description: "Owner's portal for unique PCBs tested per customer.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
