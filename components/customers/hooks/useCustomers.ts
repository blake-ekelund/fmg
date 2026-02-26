import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Customer } from "../types";

export function useCustomers() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);

useEffect(() => {
  async function load() {
    const { data, error } = await supabase
      .from("customer_summary")
      .select("*");

    console.log("CUSTOMER DATA:", data);
    console.log("ERROR:", error);

    setCustomers(data ?? []);
    setLoading(false);
  }

  load();
}, []);

  return { customers, loading };
}