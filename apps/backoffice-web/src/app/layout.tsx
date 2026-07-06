import type { Metadata } from "next";
import type { ReactNode } from "react";
import { PwaBootstrap } from "@/components/pwa/pwa-bootstrap";
import "./globals.css";

export const metadata: Metadata = {
  title: "SSTiPOS",
  description: "Multi-tenant POS back office and IT admin",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      {
        url: "/icons/sstipos-browser-icon.png",
        sizes: "180x180",
        type: "image/png",
      },
    ],
    shortcut: "/icons/sstipos-browser-icon.png",
    apple: "/icons/sstipos-browser-icon.png",
  },
  appleWebApp: {
    capable: true,
    title: "SSTiPOS",
    statusBarStyle: "default",
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="th" className="m-0 h-full w-full p-0">
      <body className="m-0 h-full w-full overflow-hidden p-0">
        {children}
        <PwaBootstrap />
      </body>
    </html>
  );
}
