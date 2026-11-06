import type { Metadata } from "next";
import { JetBrains_Mono, Onest } from "next/font/google";
import { Providers } from "@/components/providers";
import "./globals.css";

const onest = Onest({ variable: "--font-onest", subsets: ["latin"], weight: ["300", "400", "500", "600"] });
const jetbrains = JetBrains_Mono({ variable: "--font-jetbrains", subsets: ["latin"], weight: ["400"] });

export const metadata: Metadata = {
  title: { default: "Universal Credits", template: "%s · Universal Credits" },
  description: "One balance for every AI app. Buy credits once, spend them anywhere. Every credit is backed by USDT on Whitechain.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${onest.variable} ${jetbrains.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
