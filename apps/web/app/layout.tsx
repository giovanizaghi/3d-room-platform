import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "3D Room Platform",
  description: "Render pipeline demo"
};

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
