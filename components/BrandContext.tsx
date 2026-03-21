"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  type ReactNode,
} from "react";
import type { BrandFilter } from "@/types/brand";

type BrandContextValue = {
  brand: BrandFilter;
  setBrand: (b: BrandFilter) => void;
};

const BrandContext = createContext<BrandContextValue | null>(null);

const STORAGE_KEY = "fmg-brand-filter";

export function BrandProvider({ children }: { children: ReactNode }) {
  const [brand, setBrandState] = useState<BrandFilter>("all");
  const [loaded, setLoaded] = useState(false);

  // Hydrate from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "NI" || stored === "Sassy" || stored === "all") {
      setBrandState(stored);
    }
    setLoaded(true);
  }, []);

  function setBrand(b: BrandFilter) {
    setBrandState(b);
    localStorage.setItem(STORAGE_KEY, b);
  }

  // Prevent hydration mismatch — render children only after reading localStorage
  if (!loaded) return null;

  return (
    <BrandContext.Provider value={{ brand, setBrand }}>
      {children}
    </BrandContext.Provider>
  );
}

export function useBrand(): BrandContextValue {
  const ctx = useContext(BrandContext);
  if (!ctx) throw new Error("useBrand must be used within <BrandProvider>");
  return ctx;
}
