import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

import Sidebar from "@/components/Sidebar";
import MobileNav from "@/components/MobileNav";
import clsx from "clsx";

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
      <body
        className={clsx(
          geistSans.variable,
          geistMono.variable,
          "antialiased bg-white text-black"
        )}
      >
        <div className="min-h-screen">
          {/* Desktop sidebar (fixed) */}
          <Sidebar />

          {/* Main content area */}
          <div className="flex flex-col min-h-screen md:ml-64">
            {/* Mobile nav */}
            <MobileNav />

            {/* Page content */}
            <main className="flex-1">
              {children}
            </main>
          </div>
        </div>
      </body>
    </html>
  );
}
