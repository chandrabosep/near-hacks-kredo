import type { Metadata } from "next";
import { JetBrains_Mono, Onest } from "next/font/google";
import { Providers } from "@/components/providers";
import "./globals.css";

const onest = Onest({ variable: "--font-onest", subsets: ["latin"], weight: ["300", "400", "500", "600", "700"] });
const jetbrains = JetBrains_Mono({ variable: "--font-jetbrains", subsets: ["latin"], weight: ["400"] });

export const metadata: Metadata = {
  title: { default: "Kredo", template: "%s · Kredo" },
  description: "The shared value network for applications. Users carry one balance across every app, and each app is paid in USDT for what its users spend. Built on Whitechain.",
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
