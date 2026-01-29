"use server";

import { createClient } from "@supabase/supabase-js";
import Papa from "papaparse";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY! // server-only
);

type InventoryRow = {
  sku: string;
  description: string;
  uom: string;
  on_hand: number;
  allocated: number;
  not_available: number;
  available: number;
  on_order: number;
  committed: number;
  short: number;
};

function parseNumber(value: unknown): number {
  if (value == null) return 0;
  const cleaned = String(value).replace(/,/g, "").trim();
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : 0;
}

function isValidSku(value: string): boolean {
  // Fishbowl SKUs look like 100-00-01
  return /^[A-Za-z0-9-]+$/.test(value);
}

export async function uploadInventorySnapshot(
  file: File,
  warehouse: string,
  userId?: string
) {
  if (!file) throw new Error("File is required");
  if (!warehouse) throw new Error("Warehouse is required");

  const csvText = await file.text();

  const parsed = Papa.parse<string[]>(csvText, {
    skipEmptyLines: true,
  });

  if (parsed.errors.length) {
    throw new Error("CSV parsing failed");
  }

  const rows = parsed.data;

  // Fishbowl headers are on row 5 → index 4
  const DATA_START_ROW = 5;

  // Insert upload record
  const { data: upload, error: uploadError } = await supabase
    .from("inventory_uploads")
    .insert({
      warehouse,
      uploaded_by: userId,
      original_filename: file.name,
    })
    .select()
    .single();

  if (uploadError) throw uploadError;

  const uploadId = upload.id;

  const items: InventoryRow[] = [];

  for (let i = DATA_START_ROW; i < rows.length; i++) {
    const row = rows[i];

    // Column B = index 1
    const sku = row[1]?.trim();

    // Stop parsing when SKU column is invalid (date / footer)
    if (!sku || !isValidSku(sku)) break;

    items.push({
      sku,
      description: row[2]?.trim() ?? "",
      uom: row[3]?.trim() ?? "",
      on_hand: parseNumber(row[4]),
      allocated: parseNumber(row[5]),
      not_available: parseNumber(row[6]),
      available: parseNumber(row[7]),
      on_order: parseNumber(row[8]),
      committed: parseNumber(row[9]),
      short: parseNumber(row[10]),
    });
  }

  if (!items.length) {
    throw new Error("No valid inventory rows found");
  }

  const { error: insertError } = await supabase
    .from("inventory_snapshot_items")
    .insert(
      items.map((item) => ({
        upload_id: uploadId,
        warehouse,
        ...item,
      }))
    );

  if (insertError) throw insertError;

  return {
    uploadId,
    rowsInserted: items.length,
  };
}
