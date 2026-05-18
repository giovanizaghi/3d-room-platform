import "./globals.css";
import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { RenderQueueProvider } from "./components/RenderQueueContext";
import { RenderQueuePanel } from "./components/RenderQueuePanel";
import { RenderQueueFAB } from "./components/RenderQueueFAB";
import { UndoSnackbar } from "./components/UndoSnackbar";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const jetbrains = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono" });

export const metadata: Metadata = {
  title: "3D Room Platform",
  description: "Distributed async rendering pipeline"
};

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.variable} ${jetbrains.variable} font-sans min-h-screen bg-bg-primary`}>
        <RenderQueueProvider>
          {children}
          <RenderQueuePanel />
          <RenderQueueFAB />
          <UndoSnackbar />
        </RenderQueueProvider>
      </body>
    </html>
  );
}
