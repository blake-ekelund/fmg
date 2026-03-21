import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import clsx from "clsx";
import { Analytics } from "@vercel/analytics/next"

import LayoutShell from "@/components/LayoutShell";
import AuthGate from "@/components/AuthGate";
import { BrandProvider } from "@/components/BrandContext";
import { UserProvider } from "@/components/UserContext";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Fragrance Marketing Group",
  description: "FMG internal site",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <Analytics />
      <body
        className={clsx(
          geistSans.variable,
          geistMono.variable,
          "antialiased bg-white text-black"
        )}
      >
        <AuthGate>
          <UserProvider>
            <BrandProvider>
              <LayoutShell>{children}</LayoutShell>
            </BrandProvider>
          </UserProvider>
        </AuthGate>
      </body>
    </html>
  );
}
