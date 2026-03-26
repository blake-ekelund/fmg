"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export type CustomerContact = {
  customerid?: string;
  person_key?: string;
  customer_name: string | null;
  email: string | null;
  phone: string | null;
  billto_address: string | null;
  billto_city: string | null;
  billto_state: string | null;
  billto_zip: string | null;
  shipto_address: string | null;
  shipto_city: string | null;
  shipto_state: string | null;
  shipto_zip: string | null;
  first_order_date: string | null;
  last_order_date: string | null;
  order_count: number | null;
  lifetime_revenue: number | null;
  primary_channel: string | null;
};

export default function useCustomerContact(
  customerId: string | null,
  isD2C = false
) {
  const [contact, setContact] = useState<CustomerContact | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!customerId) return;

    let cancelled = false;

    async function load() {
      setLoading(true);

      const table = isD2C ? "d2c_customer_contact" : "customer_contact_summary";
      const filterField = isD2C ? "person_key" : "customerid";

      const { data, error } = await supabase
        .from(table)
        .select("*")
        .eq(filterField, customerId)
        .single();

      if (!cancelled) {
        if (error) {
          console.error("Contact view error:", error);
          setContact(null);
        } else {
          setContact(data);
        }
        setLoading(false);
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [customerId, isD2C]);

  return { contact, loading };
}
