"use server";

import { createClient } from "@supabase/supabase-js";
import * as XLSX from "xlsx";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function parseNumber(value: unknown): number {
  if (value == null) return 0;
  const cleaned = String(value).replace(/,/g, "").trim();
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : 0;
}

export async function uploadInventorySnapshot(
  file: File,
  {
    warehouse,
    pulledDate,
    userId,
  }: {
    warehouse: string;
    pulledDate: string;
    userId?: string;
  }
) {
  // Read Excel
  const buffer = Buffer.from(await file.arrayBuffer());
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];

  const rows = XLSX.utils.sheet_to_json<string[]>(sheet, {
    header: 1,
    defval: "",
    blankrows: false,
  });

  if (rows.length < 6) {
    throw new Error("Spreadsheet does not contain enough rows");
  }

  // 🔒 Known format:
  // Headers: Row 5 (index 4)
  // Data: Row 6+ (index 5)
  // Column A empty → real data starts at column 1
  const DATA_START_INDEX = 5;
  const COL_OFFSET = 1;

  // Insert upload record
  const { data: upload, error: uploadError } = await supabase
    .from("inventory_uploads")
    .insert({
      warehouse,
      pulled_date: pulledDate,
      original_filename: file.name,
      uploaded_by: userId,
    })
    .select()
    .single();

  if (uploadError) throw uploadError;

  const items = [];

  for (let i = DATA_START_INDEX; i < rows.length; i++) {
    const row = rows[i];

    const part = String(row[COL_OFFSET] ?? "").trim();
    if (!part) continue; // skip blank/footer rows

    items.push({
      upload_id: upload.id,
      warehouse,

      part,
      description: row[COL_OFFSET + 1] ?? "",
      uom: row[COL_OFFSET + 2] ?? "",

      on_hand: parseNumber(row[COL_OFFSET + 3]),
      allocated: parseNumber(row[COL_OFFSET + 4]),
      not_available: parseNumber(row[COL_OFFSET + 5]),
      drop_ship: parseNumber(row[COL_OFFSET + 6]),

      // COL_OFFSET + 7 → blank column (I), intentionally skipped

      available: parseNumber(row[COL_OFFSET + 8]),
      on_order: parseNumber(row[COL_OFFSET + 9]),
      committed: parseNumber(row[COL_OFFSET + 10]),
      short: parseNumber(row[COL_OFFSET + 11]),
    });
  }

  if (items.length === 0) {
    throw new Error("No inventory rows parsed from file");
  }

  const { error: insertError } = await supabase
    .from("inventory_snapshot_items")
    .insert(items);

  if (insertError) throw insertError;

  return {
    uploadId: upload.id,
    rowsInserted: items.length,
  };
}
