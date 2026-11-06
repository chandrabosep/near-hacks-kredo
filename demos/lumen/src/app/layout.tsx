import type { Metadata } from "next";
import { Archivo, Inter } from "next/font/google";
import type { ReactNode } from "react";
import { Shell } from "@/components/shell";
import { isDemoMode } from "@/lib/media";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const archivo = Archivo({ subsets: ["latin"], variable: "--font-archivo", axes: ["wdth"] });

export const metadata: Metadata = {
  title: "Lumen",
  description: "Make images and video with AI. Paid per image and per second with Kredo credits.",
};

export const dynamic = "force-dynamic";

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${archivo.variable}`}>
      <body>
        <Shell
          demo={isDemoMode()}
          configured={Boolean(process.env.CREDITS_API_KEY)}
          pagesUrl={process.env.NEXT_PUBLIC_CREDITS_PAGES_URL ?? "https://kredo-omega.vercel.app"}
        >
          {children}
        </Shell>
      </body>
    </html>
  );
}
