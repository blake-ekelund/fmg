import type { Metadata, Viewport } from "next";
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
  title: {
    default: "FMG Portal",
    template: "%s · FMG Portal",
  },
  description:
    "Fragrance Marketing Group's internal portal — inventory forecasting, sales analysis, storefront management, marketing and team operations in one place.",
  applicationName: "FMG Portal",
};

export const viewport: Viewport = {
  // Matches --color-brand-900, so mobile browser chrome blends into the nav bar.
  themeColor: "#10293a",
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
          "antialiased bg-surface-muted text-ink"
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
