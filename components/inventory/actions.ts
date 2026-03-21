"use server";

import { createClient } from "@supabase/supabase-js";
import * as XLSX from "xlsx";

/* ======================================================
   Supabase Client (Service Role)
====================================================== */

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const SALES_BUCKET = "sales-uploads";

/* ======================================================
   Shared Utilities
====================================================== */

function parseNumber(value: unknown): number {
  if (value == null) return 0;
  const cleaned = String(value).replace(/,/g, "").trim();
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : 0;
}

function parseDate(value: unknown): string | null {
  if (!value) return null;

  // Excel numeric date
  if (typeof value === "number") {
    const excelEpoch = new Date(1899, 11, 30);
    const date = new Date(excelEpoch.getTime() + value * 86400000);
    return date.toISOString().split("T")[0];
  }

  const parsed = new Date(String(value));
  return isNaN(parsed.getTime()) ? null : parsed.toISOString().split("T")[0];
}

function chunkArray<T>(arr: T[], size: number) {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function insertInChunks(table: string, rows: Record<string, unknown>[], chunkSize = 1000) {
  for (const chunk of chunkArray(rows, chunkSize)) {
    const { error } = await supabase.from(table).insert(chunk);
    if (error) throw error;
  }
}

function basename(path: string) {
  const p = path.replace(/\\/g, "/");
  const idx = p.lastIndexOf("/");
  return idx >= 0 ? p.slice(idx + 1) : p;
}

async function downloadFromStorage(path: string): Promise<Buffer> {
  const { data, error } = await supabase.storage
    .from(SALES_BUCKET)
    .download(path);

  if (error) throw error;
  if (!data) throw new Error(`File not found in storage: ${path}`);
  return Buffer.from(await data.arrayBuffer());
}

/* ======================================================
   INVENTORY INGESTION
====================================================== */


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
  const buffer = Buffer.from(await file.arrayBuffer());
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];

  const rawRows = XLSX.utils.sheet_to_json<string[]>(sheet, {
    header: 1,
    defval: "",
    blankrows: false,
  });

  if (rawRows.length < 5) {
    throw new Error("Spreadsheet does not contain enough rows");
  }

  const headerIndex = rawRows.findIndex((row) =>
    row.some((cell) =>
      String(cell).toLowerCase().includes("part")
    )
  );

  if (headerIndex === -1) {
    throw new Error("Could not find header row (Part column missing)");
  }

  const headerRow = rawRows[headerIndex].map((h) =>
    String(h).trim()
  );

  const normalize = (v: unknown) =>
    String(v).replace(/\s+/g, " ").trim().toLowerCase();

  const getCol = (name: string) =>
    headerRow.findIndex(
      (h) => normalize(h) === name.toLowerCase()
    );

  const colPart = getCol("Part");
  const colDesc = getCol("Description");
  const colUom = getCol("UOM");
  const colOnHand = getCol("On Hand");
  const colAllocated = getCol("Allocated");
  const colNotAvailable = getCol("Not Available");
  const colDropShip = getCol("Drop Ship");
  const colAvailable = getCol("Available");
  const colOnOrder = getCol("On Order");
  const colCommitted = getCol("Committed");
  const colShort = getCol("Short");

  if (colPart === -1) {
    throw new Error("Part column not found in header");
  }

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

  const items: Record<string, unknown>[] = [];

  for (let i = headerIndex + 1; i < rawRows.length; i++) {
    const row = rawRows[i];

    const part = String(row[colPart] ?? "").trim();

    if (!part) continue;

    items.push({
      upload_id: upload.id,
      warehouse,
      part,
      description: row[colDesc] ?? "",
      uom: row[colUom] ?? "",
      on_hand: parseNumber(row[colOnHand]),
      allocated: parseNumber(row[colAllocated]),
      not_available: parseNumber(row[colNotAvailable]),
      drop_ship: parseNumber(row[colDropShip]),
      available: parseNumber(row[colAvailable]),
      on_order: parseNumber(row[colOnOrder]),
      committed: parseNumber(row[colCommitted]),
      short: parseNumber(row[colShort]),
    });
  }

  if (!items.length) {
    throw new Error("No inventory rows parsed from file");
  }

  await insertInChunks("inventory_snapshot_items", items, 2000);

  return { uploadId: upload.id, rowsInserted: items.length };
}



/* ======================================================
   SALES INGESTION (Orders.xls + Items.csv from Storage)
   - Client uploads both files to Storage
   - Server downloads by path, parses, inserts in chunks
   - Writes sales_uploads audit row and statuses
   - Keeps ONLY the most recent upload’s rows in raw tables
====================================================== */

export async function uploadSalesData({
  ordersPath,
  itemsPath,
  pulledDate,
  userId,
}: {
  ordersPath: string;
  itemsPath: string;
  pulledDate: string;
  userId?: string;
}) {
  // 1) Create upload batch record
  const { data: upload, error: uploadErr } = await supabase
    .from("sales_uploads")
    .insert({
      pulled_date: pulledDate,
      original_filename_orders: basename(ordersPath),
      original_filename_items: basename(itemsPath),
      uploaded_by: userId,
      status: "processing",
    })
    .select()
    .single();

  if (uploadErr) throw uploadErr;
  const uploadId = upload.id as string;

  try {
    /* --------------------------------------------------
       Download + Parse Sales Orders (Excel)
    -------------------------------------------------- */
    const ordersBuffer = await downloadFromStorage(ordersPath);

    const ordersWorkbook = XLSX.read(ordersBuffer, { type: "buffer" });
    const ordersSheet =
      ordersWorkbook.Sheets[ordersWorkbook.SheetNames[0]];

    const ordersRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ordersSheet, {
      defval: "",
    });

    if (!ordersRows.length) throw new Error("Sales Orders file is empty");

    const ordersToInsert = ordersRows.map((row) => ({
      id: parseNumber(row["id"] ?? row["ID"]),
      billtoname: row["billToName"] ?? row["Bill To Name"] ?? null,
      billtoaddress: row["billToAddress"] ?? row["Bill To Address"] ?? null,
      billtocity: row["billToCity"] ?? row["Bill To City"] ?? null,
      billtostate: row["billToState"] ?? row["Bill To State"] ?? null,
      billtozip: row["billToZip"] ?? row["Bill To Zip"] ?? null,
      billtocountry: row["billToCountry"] ?? row["Bill To Country"] ?? null,
      customercontact:
        row["customerContact"] ?? row["Customer Contact"] ?? null,
      customerid: row["customerId"] ?? row["Customer ID"] ?? null,
      customerpo: row["customerPo"] ?? row["Customer PO"] ?? null,
      datecompleted: parseDate(row["dateCompleted"] ?? row["Date Completed"]),
      email: row["email"] ?? row["Email"] ?? null,
      num: row["num"] ?? row["Order Number"] ?? null,
      phone: row["phone"] ?? row["Phone"] ?? null,
      shiptoname: row["shipToName"] ?? row["Ship To Name"] ?? null,
      shiptoaddress: row["shipToAddress"] ?? row["Ship To Address"] ?? null,
      shiptocity: row["shipToCity"] ?? row["Ship To City"] ?? null,
      shiptostate: row["shipToState"] ?? row["Ship To State"] ?? null,
      shiptozip: row["shipToZip"] ?? row["Ship To Zip"] ?? null,
      shiptocountry:
        row["shipToCountry"] ?? row["Ship To Country"] ?? null,
      status: row["status"] ?? row["Status"] ?? null,
      totalprice: parseNumber(row["totalPrice"] ?? row["Total Price"]),
      customfields: row["customfields"] ?? null,
      channel: row["channel"] ?? row["Channel"] ?? null,
      upload_id: uploadId,
    }));

    await insertInChunks("sales_orders_raw", ordersToInsert, 1000);

    /* --------------------------------------------------
       Download + Parse Sales Items (CSV)
    -------------------------------------------------- */
    const itemsBuffer = await downloadFromStorage(itemsPath);

    const itemsWorkbook = XLSX.read(itemsBuffer, { type: "buffer" });
    const itemsSheet = itemsWorkbook.Sheets[itemsWorkbook.SheetNames[0]];

    const itemsRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(itemsSheet, {
      defval: "",
    });

    if (!itemsRows.length) throw new Error("Sales Items file is empty");

    const itemsToInsert = itemsRows.map((row) => ({
      id: parseNumber(row["id"] ?? row["ID"]),
      description: row["description"] ?? row["Description"] ?? null,
      productid: parseNumber(row["productId"] ?? row["Product ID"]),
      productnum:
        row["productNum"] ??
        row["productNu"] ??
        row["productnum"] ??
        row["Product Number"] ??
        null,
      qtyfulfilled: parseNumber(row["qtyFulfilled"] ?? row["Qty Fulfilled"]),
      qtyordered: parseNumber(row["qtyOrdered"] ?? row["Qty Ordered"]),
      soid: parseNumber(row["soId"] ?? row["soid"] ?? row["Sales Order ID"]),
      solineitem: parseNumber(
        row["soLineItem"] ?? row["soLineitem"] ?? row["Line Item"]
      ),
      statusid: parseNumber(row["statusId"] ?? row["Status ID"]),
      totalcost: parseNumber(row["totalCost"] ?? row["Total Cost"]),
      totalprice: parseNumber(row["totalPrice"] ?? row["Total Price"]),
      typename: row["typeName"] ?? row["Type Name"] ?? null,
      upload_id: uploadId,
    }));

    await insertInChunks("so_items_raw", itemsToInsert, 1000);

    /* --------------------------------------------------
       Cleanup: keep ONLY this upload’s rows
       (delete everything else)
    -------------------------------------------------- */

    const { error: delOrdersErr } = await supabase
      .from("sales_orders_raw")
      .delete()
      .neq("upload_id", uploadId);

    if (delOrdersErr) throw delOrdersErr;

    const { error: delItemsErr } = await supabase
      .from("so_items_raw")
      .delete()
      .neq("upload_id", uploadId);

    if (delItemsErr) throw delItemsErr;

    /* --------------------------------------------------
       Mark upload complete
    -------------------------------------------------- */
    const { error: doneErr } = await supabase
      .from("sales_uploads")
      .update({
        status: "complete",
        orders_rows: ordersToInsert.length,
        items_rows: itemsToInsert.length,
        error_text: null,
      })
      .eq("id", uploadId);

    if (doneErr) throw doneErr;

    return {
      uploadId,
      ordersInserted: ordersToInsert.length,
      itemsInserted: itemsToInsert.length,
    };
  } catch (e: unknown) {
    // Mark upload failed (best-effort)
    const message = e instanceof Error ? e.message : "Upload failed";
    await supabase
      .from("sales_uploads")
      .update({
        status: "failed",
        error_text: message,
      })
      .eq("id", uploadId);

    throw e;
  }
}