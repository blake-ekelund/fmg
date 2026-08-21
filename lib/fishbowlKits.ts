/**
 * Expand Fishbowl kits into the flat line list its CSV import will accept.
 *
 * Fishbowl expands a kit for us on import — but only one level deep. A kit
 * whose components include another kit ("Sassy Love Mini Hand Creme Display
 * PREPACK" 512-03-99 contains the COMPLETE display 502-03-99, itself a kit)
 * is rejected outright: "Multi-level kits are not supported through csv
 * import." Worse, it names only ONE offending line when several are bad, and
 * reports "only some information was imported".
 *
 * The way through is to stop asking Fishbowl to expand anything and send the
 * expansion ourselves. Its own /api/export/SalesOrderDetails shows the shape,
 * taken here from SO 24043:
 *
 *   TypeID  Product      Qty  Price   ShowItem  KitItem
 *   80      517-08-99     1    0.00   true      false    ← the kit itself
 *   80      502-05-99     1    0.00   true      true     ← nested kit, a member
 *   10      500-02-99     1   15.00   true      true     ← components, members
 *   10      135-00-10     6    5.00   true      true
 *
 * `KitItem` is the flag that binds a line to the kit above it, and a nested
 * kit is just another member line. Sent this way there is nothing left for
 * Fishbowl to expand, so the multi-level limit never applies.
 *
 * Prices come from `product.price`, which is exactly what Fishbowl itself
 * uses: on SO 24663 (our own import of single-level kit 512-01-99) every
 * component landed at its product price — 15.00, 5.00, 2.50 — and the kit
 * line at 0.00, with the price we sent on the kit line discarded. So
 * expanding changes no money; it only spells out what Fishbowl would have
 * written anyway.
 */

/** One kit → component edge, as read from Fishbowl's `kititem` table. */
export type KitEdge = {
  /** Product number of the kit this component belongs to. */
  kit: string;
  /** Product number of the component. */
  component: string;
  description: string;
  /** `product.price` — the per-unit price Fishbowl gives this component. */
  price: number;
  /** `kititem.defaultQty` — per ONE of the parent kit. */
  qty: number;
  /** True when the component is itself a kit (it has its own kititem rows). */
  isKit: boolean;
};

/** One import row's worth of expanded kit. */
export type KitLine = {
  product: string;
  description: string;
  /** 0.00 for kit lines; the component price otherwise. */
  price: number;
  qty: number;
  /** Kit lines go out as SOItemTypeID 80, components as 10. */
  isKit: boolean;
  /** False for the top-level kit line, true for every descendant. */
  isMember: boolean;
};

/** Guards against a kit that (however impossibly) contains itself. */
const MAX_KIT_DEPTH = 10;

/** Which of `partNums` are kits — i.e. have at least one component edge. */
export function kitProductNums(partNums: string[], edges: KitEdge[]): string[] {
  const kits = new Set(edges.map((e) => e.kit));
  return [...new Set(partNums)].filter((p) => kits.has(p));
}

/**
 * True when `part` is a kit with a kit inside it — the shape the CSV import
 * refuses, and so the only shape we need to pre-expand.
 */
export function isMultiLevelKit(part: string, edges: KitEdge[]): boolean {
  return edges.some((e) => e.kit === part && e.isKit);
}

/**
 * Flatten `root` into its import lines, depth-first, in the order Fishbowl's
 * export emits them: the kit, then each component — and where a component is
 * itself a kit, that kit followed immediately by its own members.
 *
 * `rootQty` is the ordered quantity of the kit; component quantities multiply
 * through it, so 2 of a display yields 12 of a 6-per-display creme.
 */
export function flattenKit(root: string, rootQty: number, edges: KitEdge[]): KitLine[] {
  const byKit = new Map<string, KitEdge[]>();
  for (const e of edges) {
    const list = byKit.get(e.kit);
    if (list) list.push(e);
    else byKit.set(e.kit, [e]);
  }

  const lines: KitLine[] = [];

  /**
   * `path` is the chain of kits we're inside. Fishbowl's data contains at
   * least one genuine cycle (500-02-99 ↔ 505-11-99.old, both at quantity 0),
   * so a component already on the path is emitted as a plain line and not
   * descended into — which is what Fishbowl does with it too.
   */
  const walk = (product: string, qty: number, path: string[]) => {
    if (path.length > MAX_KIT_DEPTH) {
      throw new Error(`Kit ${root} nests more than ${MAX_KIT_DEPTH} deep — refusing to expand.`);
    }
    const children = byKit.get(product);
    if (!children) return;
    for (const child of children) {
      const childQty = child.qty * qty;
      const cyclic = path.includes(child.component);
      const treatAsKit = child.isKit && !cyclic;
      lines.push({
        product: child.component,
        description: child.description,
        // A nested kit is a $0 header line, exactly like the root kit.
        price: treatAsKit ? 0 : child.price,
        qty: childQty,
        isKit: treatAsKit,
        isMember: true,
      });
      if (treatAsKit) walk(child.component, childQty, [...path, child.component]);
    }
  };

  const rootDescription =
    edges.find((e) => e.component === root)?.description ??
    edges.find((e) => e.kit === root)?.description ??
    root;

  lines.push({
    product: root,
    description: rootDescription,
    price: 0,
    qty: rootQty,
    isKit: true,
    isMember: false,
  });
  walk(root, rootQty, [root]);
  return lines;
}

/** What the expanded lines add up to — the SO's money for this kit. */
export function kitLinesTotal(lines: KitLine[]): number {
  return Number(lines.reduce((sum, l) => sum + l.price * l.qty, 0).toFixed(2));
}

/**
 * Rewrite import rows so every multi-level kit line becomes its full
 * expansion. Single-level kits are left exactly as they are — Fishbowl
 * expands those correctly on its own, and doing it for them would only be
 * more rows to get wrong.
 *
 * A replacement line inherits the whole SO header from the row it replaces,
 * so addresses, custom fields and Customer PO all carry through untouched;
 * only the item columns differ.
 */
export function expandKitRows(rows: string[][], edges: KitEdge[]): string[][] {
  const header = rows[0] ?? [];
  const idx = (name: string) => header.indexOf(name);
  const cProduct = idx("ProductNumber");
  const cType = idx("SOItemTypeID");
  const cDescr = idx("ProductDescription");
  const cQty = idx("ProductQuantity");
  const cPrice = idx("ProductPrice");
  const cKitItem = idx("KitItem");
  const cShowItem = idx("ShowItem");
  if (cProduct < 0 || cType < 0) return rows;

  const out: string[][] = [header];
  for (const row of rows.slice(1)) {
    const part = (row[cProduct] ?? "").trim();
    if (!isMultiLevelKit(part, edges)) {
      out.push(row);
      continue;
    }

    const orderedQty = Number(row[cQty] ?? "1") || 1;
    for (const line of flattenKit(part, orderedQty, edges)) {
      const next = [...row];
      // SOItemTypeID 80 = Kit, 10 = Sale. Kit lines carry no money; the
      // components do, exactly as Fishbowl writes them itself.
      next[cType] = line.isKit ? "80" : "10";
      next[cProduct] = line.product;
      if (cDescr >= 0 && line.description) next[cDescr] = line.description;
      if (cQty >= 0) next[cQty] = String(line.qty);
      if (cPrice >= 0) next[cPrice] = line.price.toFixed(2);
      // The flag that binds a line to the kit above it.
      if (cKitItem >= 0) next[cKitItem] = line.isMember ? "true" : "false";
      if (cShowItem >= 0) next[cShowItem] = "true";
      out.push(next);
    }
  }
  return out;
}
