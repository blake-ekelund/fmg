import type { GuideEntry } from "../types";

/**
 * User guide: Catalog (Products, Inventory, Variance Report), Sales Analysis
 * (All / Wholesale / D2C) and the Team pages (Rep Directory, rep detail,
 * rep analysis, Sales Hub, Rep Portal Preview).
 */
export const catalogSalesGuide: GuideEntry[] = [
  /* ───────────────────────────── Products list ───────────────────────────── */
  {
    path: "/products",
    title: "Products",
    section: "Catalog",
    summary:
      "The master list of every SKU, with filters for status, sales trend and missing media, and the place to create a new product.",
    body: `## What it's for
Products is the catalog: one row per SKU for both brands (Natural Inspirations and Sassy). Click any row to open that product's own page, where you edit its details, pricing, copy, photos and storefront publishing. Visible to owner, admin, full-access users and operations.

## What's on the page
- **Search box** ("Search SKU, name, fragrance…") — matches SKU, name, fragrance or part type.
- **Status dropdown** — **Current**, **Archived** or **All**, each with a count. "Current" means the product is included in the forecast; "Archived" means it isn't.
- **Trend dropdown** ("All trends") — tick one or more of **Growing**, **New**, **Stable**, **Declining**. Leaving all unticked shows every trend.
- **Needs media dropdown** — tick the kinds of media a product must be *missing*: **Copy**, **Front**, **Benefits**, **Lifestyle**, **Ingredients / Back**, **Fragrance**, **Other**, or **Missing anything** to tick them all. **Clear** turns the filter off.
- **New product** button (top right).
- **Table columns**: SKU, Name, Brand, Fragrance, Size, Type, Trend, Media, Forecast. Click any column header to sort; click again to reverse.
- The counts in every dropdown reflect your other active filters, so they tell you how many rows you'd see if you picked that option.
- The brand switch in the top bar (**All / NI / Sassy**) also filters this list.

## How to…
### Find a product
1. Type part of the SKU, name or fragrance in the search box.
2. Narrow further with the Status, Trend or Needs media dropdowns.
3. Click the row to open the product page.

### Add a new product
1. Click **New product**.
2. Enter the **SKU** — it must be unique and is used everywhere, so pick carefully.
3. For Sassy, enter the **Product name** (e.g. "Bougie Babe"); for both brands enter the **Form / format** (e.g. "Hand + Body Lotion 8oz"). The modal shows the resulting display name.
4. Pick the **Brand** (NI or Sassy). It defaults to the brand selected in the top bar, or NI when "All" is selected.
5. Click **Create product**. You're taken straight to the new product's page to fill in fragrance, size, pricing, copy and photos.

### Find products that still need photos or copy
1. Open **Needs media** and tick the missing items you care about (e.g. Front + Lifestyle), or **Missing anything**.
2. The list shows products missing *any* of the ticked items. The **Media** column shows **Complete**, **Missing**, or what's lacking (e.g. "Copy + Photos"); hover it to see which photo types are missing.

### Archive or restore a product
1. In the **Forecast** column, click the icon on that row (a green box = in forecast; a grey archive box = archived).
2. The change saves immediately. Archiving also unpublishes the product from the storefronts (it goes back to draft). Restoring does **not** republish it — you re-publish on the product page.

## Good to know
- **Trend** compares units sold in the last 90 days with the 90 days before: Growing = up 10% or more, Declining = down 10% or more, Stable = in between, New = sales only in the last ~6 months. A dash means no recent sales. Sales figures come from Fishbowl.
- Your filters and sort are kept in the address bar, so opening a product and pressing Back returns you to the same filtered list.
- A duplicate SKU is rejected with "SKU … already exists".`,
  },

  /* ──────────────────────────── Product detail ───────────────────────────── */
  {
    path: "/products/[part]",
    title: "Product page",
    section: "Catalog",
    summary:
      "Edit one product: details, pricing, marketing copy, storefront publishing and stock flag, inventory rules, sales history and photos — changes save automatically.",
    body: `## What it's for
This is everything about a single SKU. It is where you edit product descriptions and other copy that appears on the storefronts and retailer line sheets, set prices, publish to D2C/Wholesale, manage photos, and check its inventory forecast and sales.

## What's on the page
- Top bar: **Back to products**, and previous/next arrows that step through current (non-archived) products alphabetically, with a "3 / 120"-style position counter.
- Header: product name, SKU and a trend badge (Growing / New / Stable / Declining).
- Five tabs, each with a small status badge where it helps: **Details** (shows D2C / Wholesale / Both when published), **Inventory** (Healthy / Review / At Risk), **BOM**, **Sales** (trend), **Media** (Complete or "N missing").
- A **Delete this product** box at the bottom of every tab.

## Saving
Changes **save automatically** when you finish an input: leave a text field (or press Enter), pick from a dropdown, or click a toggle/option. Nothing saves on each keystroke. A small "Saving…" then "Saved" message appears bottom-right. There is no Save button for normal products.

## Details tab
- **Product** card: **Brand**, **Collection** (Sassy: Love/Everyday/Holiday; NI: one per fragrance line), **Product type** (Finished good / Component), **Product name** (Sassy only), **Form / format**, **Fragrance** (multi-select — pick several for a gift set, or type a new name and press Enter), **Is this a tester?** (NI only), **SKU / Part #** (locked), **Barcode (UPC / EAN)**, **Size**. The display name the storefronts show is rebuilt automatically from name + form (+ tester).
- Header buttons on the Product card:
  - **"N in stock"** — on-hand from the latest inventory snapshot. Click it to choose **In stock** or **Out of stock** ("Still shown, but buying is disabled").
  - **Published on** — tick **D2C** (the brand's website) and/or **Wholesale** (approved stockists). Untick both to keep it as a draft.
- **Pricing & quantity**: Retail (D2C) **Price** and optional **Compare-at** (shows "−X% off"); Wholesale **Price**, **Case pack** (units) and **Min. order** (cases). The Summary shows case total and the retailer margin, flagged "low" under 40%. Prices can be filled in even when that channel isn't selling yet.
- **Marketing copy**: a banner lists missing copy. Fields: **Infused with**, **Category path**, **Fragrance notes** (Top / Mid / Dry), **Short description** (keep under 160 characters — it's also the Google snippet), **Long description**, **Benefits** (use the bulleted-list button, one per line), **Ingredients**, **How to use**, **Retailer notes** (internal and line sheets only — never on the storefronts). The longer fields have Bold, Italic, Bulleted list and Numbered list buttons.
- **Product page colors**: Background, Headline, Body copy, Accent, Buy button, with a live preview. **Clear** falls back to the storefront's default palette.
- **Shipping & customs**: Weight (oz), Country of origin, HS code.

## How to…
### Edit a product description
1. Open the product, stay on **Details**.
2. Scroll to **Marketing copy** and edit **Short description** or **Long description**.
3. Click outside the field — it saves automatically.

### Publish a product to the website or wholesale
1. On **Details**, click **Published on** in the Product card.
2. Tick **D2C** and/or **Wholesale**. It saves as soon as you click.

### Mark a product out of stock
1. Click the green/red **"… in stock"** button and choose **Out of stock**. Shoppers still see it but can't buy it.

### Add or reorder photos (Media tab)
1. Open **Media**. The pills (**All photos**, Front, Benefits, Lifestyle, Ingredients, Fragrance, Other) filter the grid and show counts; amber pills are required types with no photo yet ("Still needed: …").
2. Choose **Tag as**, then click **Add photos** or drag image files onto the grid.
3. In **All photos**, drag photos to reorder — the photo marked **First** leads the storefront gallery.
4. Change a photo's type with the dropdown under it, or click the photo to edit **Title**, **Photo type**, **Tags**, **Alt text** and **Description**, then **Save changes** (this pop-up needs the Save click). **Copy link** / **Open full size** are there too.

### Adjust inventory rules (Inventory tab)
1. Edit **Min Qty**, **Max Qty**, **Lead Time (mo)** and **Avg Monthly Demand**.
2. The **12-Month Projection** chart and table update; months below Min are amber, below zero red.
3. **Include in Forecast** off = archived: removed from forecasting and taken off the storefronts.

### Check what a product is made of (BOM tab)
The **BOM** tab shows the product's bill of materials from Fishbowl (read-only):
- **Can build now** (and **Incl. on order**): how many units the components on hand could make, and which component runs out first (the **bottleneck**, highlighted amber).
- **Material cost / unit**: rolled up from each component's last vendor price (Fishbowl average cost when there's no vendor price).
- Per component: quantity per unit (converted when the BOM uses a different unit, e.g. "1 6thb = 0.167 bx" for a shipper per 6), **On hand** (hover for stock by location: Kapra, FMG, Point B…; Amazon stock isn't counted), **On order** (hover for the open POs), **Covers** (finished units that component alone could supply), cost, and **Shared with** — click it to list every other product that uses the same component.
- A component that's itself made from a BOM (e.g. the lotion inside a tester) links to its own product page.
- **Plan a purchase** opens Purchasing focused on this product.

## Good to know
- **Sales** tab: last 12 months of revenue, units and average price from Fishbowl, plus TTM totals. Read-only.
- If Avg Monthly Demand is 0, the page pre-fills it from the last 3 months of sales, and Lead Time defaults to 3 months; these save with your next edit.
- Archived products always stay draft — un-archive before publishing.
- **Delete** → **Confirm Delete** permanently removes the product and cannot be undone. Deleting a photo also asks for confirmation and is permanent. Consider archiving instead.`,
  },

  /* ───────────────────────────── Inventory ───────────────────────────────── */
  {
    path: "/inventory",
    title: "Inventory",
    section: "Catalog",
    summary:
      "Inventory forecast for every current product: Point B available stock next to Fishbowl's count and the variance, on order, average monthly demand and projected stock for the next 12 months, colour-coded by risk.",
    body: `## What it's for
Shows whether each current product will run out. For every product included in the forecast it combines stock available at the Point B warehouse and on order with average monthly demand and projects stock month by month. Point B is the warehouse, so its count is the source of truth; Fishbowl's count is shown alongside so you can see where the two disagree. Visible to owner, admin, full-access users and operations.

## What's on the page
- **Search** ("Search part, name, fragrance…") — also matches status words like "at risk".
- **Status** dropdown (multi-select): **At risk**, **Review**, **Healthy**, **No demand**, with counts. Nothing ticked = all.
- **Monthly / Quarterly** toggle (desktop) — 12 monthly columns or 4 quarter-end columns.
- **Export** (desktop) — downloads a CSV. On a phone this is **Email to me** instead.
- **Refresh inventory** — in one click: pulls a fresh Fishbowl snapshot, updates the Sassy and NI storefronts' stock from Point B, and re-reads Point B here. A line under the toolbar says what happened (e.g. "Fishbowl re-pulled (540 parts) · stores updated from Point B (285 in stock) · Point B re-read live"). Nothing changes in Fishbowl or Point B.
- **Point B** chip — "Loading Point B…", then "Point B live" (or "Point B live · N on Fishbowl" when some parts had to use Fishbowl's count). Red "Point B unavailable · using Fishbowl" means the live read failed and the whole forecast is on Fishbowl. Click it to open the Variance Report.
- **Fishbowl** badge on the right, e.g. "Fishbowl Oct 20 · 1d ago" — the age of the Fishbowl snapshot. It turns amber when 14+ days old. Owners/admins also see an **Upload** link here (goes to Integrations).
- Table: status dot, Part, Name, Brand (when the top bar is on "All"), Fragrance, **PB Avail**, **Fishbowl**, **Variance**, **On Order** (editable), **Avg / Mo** (editable), then the projection columns. Click a header to sort.

## The three stock columns
- **PB Avail** — what Point B can actually sell right now: physical stock minus anything on hold (Suspense / QC Hold), minus stock committed to open orders, and minus stock already picked for orders but not yet shipped. **The forecast and status run on this number.** Hover it to see the physical / held / committed / picked breakdown.
- **Fishbowl** — on hand in the latest Fishbowl snapshot.
- **Variance** — Point B **physical** minus Fishbowl on hand (both totals, the same rule as the Variance Report). Blue **+** = Point B holds more than Fishbowl thinks; red **−** = less; "—" = can't be compared (hover for why).
- An amber **FB** tag in the PB Avail column means that part is forecast on Fishbowl's number instead, because Point B doesn't stock it or counts it in a different unit (e.g. cases vs eaches). Hover for the reason.

## Status meanings
Months of supply = (PB available + on order) ÷ avg monthly demand.
- **Healthy**: more than 3 months. **Review**: 1.5–3 months. **At risk**: 1.5 months or less (row tinted red). **No demand**: avg demand is 0.
- Projection cells: red = less than one month of demand left, yellow = under three months, green = three months or more.

## How to…
### See what's about to run out
1. Open the **Status** dropdown and tick **At risk** (and **Review** if you want).
2. Sort by status or PB Avail by clicking the column header.

### Find where Fishbowl and Point B disagree
1. Click the **Variance** header to sort the biggest gaps to the top or bottom.
2. For the full reconciliation (held, committed, units, notes, archiving), click the **Point B** chip to open the Variance Report.

### Get the very latest numbers
Click **Refresh inventory**. Point B is already read live every time the page opens; the button also pulls a fresh Fishbowl snapshot instead of waiting for the next scheduled one.

### Change a product's demand or on-order quantity
1. Click into the **On Order** or **Avg / Mo** box on that row and type the number.
2. It saves automatically about half a second after you stop typing; the projections update immediately.

### Export the forecast
1. Filter the list the way you want (search, status, brand in the top bar).
2. Click **Export** — the CSV contains only the rows you see, always with 12 monthly projection columns.
3. On a phone, tap **Email to me** — the same CSV is emailed to your own address as an attachment.

### Open a product
Click any row (outside the editable boxes) to go to its product page.

## Good to know
- **Point B** numbers are read live from the warehouse system every time the page loads, so they're never stale. Stock on hold (Suspense / QC Hold) can only be released by Point B, not from this page.
- **Fishbowl** numbers and **On Order** come from a Fishbowl snapshot refreshed about three times a day (roughly 4 AM, 12 PM and 8 PM Eastern), or whenever someone clicks **Refresh inventory**. An **On Order** number you type is saved to the current snapshot only, so the next refresh replaces it with Fishbowl's figure.
- Because committed and picked stock is taken out of PB Avail *and* average demand is still subtracted month by month, the forecast leans slightly cautious until those orders ship.
- The Sassy and NI storefronts use the same PB Avail number to decide what shows as in stock (it's saved for them every 15 minutes). If Point B hasn't been saved for 6 hours, the stores fall back to Fishbowl's count.
- The Dashboard's **Review understock / Review overstock** counts use the same Point B-first numbers, so they match what this page shows when you click through.
- The CSV export includes the forecast on-hand and its source, Point B available, Point B physical, Fishbowl on hand and variance.
- **Avg / Mo** defaults to last-90-days units ÷ 3. Typing a number saves it to the product as a manual override; setting it back to 0 returns it to the automatic figure.
- Only products included in the forecast appear here; archived ones don't.
- Links from the Dashboard can open this page pre-filtered to understock (At risk + Review) or to **Overstock · slow movers**, shown as a violet chip you can clear with its ×.
- On a phone the view is monthly only, sorted by part, shown as cards with **Show 25 more**.`,
  },

  /* ─────────────────────────── Purchasing ───────────────────────────── */
  {
    path: "/inventory/purchasing",
    title: "Purchasing",
    section: "Catalog",
    summary:
      "Work out which ingredients to order, one product family at a time: what's running low, what Kapra can make with what's on hand, and an order list per vendor coloured by how soon it has to go out.",
    body: `## What it's for
Turns "what's running low" (the Inventory page) into "what ingredients do I order, from whom, and how soon". It reads each product's recipe (bill of materials) from Fishbowl and works one **family** at a time — products that share an ingredient (the same tube, bottle, pump, fill or label) or the same product line, so testers sit with their parents. Read-only: nothing is ordered in Fishbowl. Visible to owner, admin, full-access users and operations.

## What's on the page
- **Families** (left) — most urgent first. Each shows red / amber dots for products at risk / to review, how many products, and roughly what its order costs (red when something must be ordered now). Click one to work on it.
- **The family's products** (middle) — the Inventory page's own columns and colours: status dot, On Hand, On Order, Avg / Mo, **Months left**. Then **Can make** (units the ingredients on hand and on order could make; "→ 1,450" in green is what the order list would add) and **Make** (editable — blue once you've changed it).
- The **status** dropdown works like the Inventory page: the ticked statuses are the products you're ordering for (At risk + Review by default). **Stock for N months** sets how much to make.
- Click a product to see its **recipe**: each ingredient, how much per unit, what we have, what the whole family needs, what's short, and where it is (Kapra, the FMG location, "made by Kapra" for fill). "In N products" marks a shared ingredient.
- **Order list** (right) — the total, then one line per vendor with a coloured dot: **red = order now** (the products would run out before it could arrive and be filled), **amber = order soon**, **green = can wait**. Click a vendor to see and change quantities, see which products one buy covers, and **Copy order** (ready to paste into an email). **Download this order list** saves it as a spreadsheet.
- **Send to Kapra first** — ingredients the plan needs that are sitting somewhere other than Kapra.
- **Check in Fishbowl first** — ingredients that show zero everywhere with nothing on order. They may just not be counted in Fishbowl, so they're left out of the total.
- **Ingredients & minimums** (button above the products, or **Minimums & prices** under the order list) opens a drawer with every ingredient in the family, grouped by vendor:
  - Per vendor: **Run minimum** (the whole order must reach this many units — e.g. Kapra's batch size), **Each item at least** (e.g. 500 of each fragrance) and **Lead time**.
  - Per ingredient: **Price**, **Min**, **Multiple** (order in packs of) and **Lead** time. A blank box uses the vendor's rule, then Fishbowl — the grey number shows what's in effect, and blue boxes are your changes. Saves when you leave a box, for everyone.
- When a vendor's order is under its run minimum, the order list says how far under, and **Top up** spreads the extra across that vendor's items in proportion to how much each needs.

## How to…
### Order for the most urgent family
1. Click the top family on the left.
2. Check the **Make** numbers (change any you disagree with).
3. Open each red vendor in the **Order list**, adjust quantities if needed, and **Copy order**.

### Start from the Inventory page
Click **Order ingredients** on the Inventory page — Purchasing opens with the same status filter.

## Good to know
- Fill ("goop") is made and held by Kapra and ordered from them with each run, so zero fill in stock is normal.
- "How soon" = months left on the most urgent product using the ingredient, minus the vendor's lead time plus 2 weeks for filling. When Fishbowl has no lead time, 8 weeks is assumed (shown as "~8 wk?").
- Ingredient stock counts Kapra, the FMG location and Point B (live); Amazon stock isn't counted.
- Prices come from the most recent purchase order for each ingredient (hover a cost to see which PO date), else Fishbowl's vendor price, else average cost — unless you've typed a price. Order quantities follow the minimums and multiples you set; without one, they're the exact shortfall.`,
  },
  /* ─────────────────────────── Variance Report ───────────────────────────── */
  {
    path: "/inventory/variance",
    title: "Variance Report",
    section: "Catalog",
    summary:
      "Compares Fishbowl's on-hand counts with the live physical count at the Point B warehouse so stock discrepancies can be reconciled.",
    body: `## What it's for
Point B is the warehouse, so its physical count is the truth. This report puts Fishbowl's inventory snapshot next to Point B's live count, part by part, so you can spot where Fishbowl is wrong (or paperwork is still in flight). Visible to owner, admin, full-access users and operations.

## What's on the page
- **Export** — downloads the rows currently shown as a CSV.
- **Refresh** — re-reads Fishbowl and Point B.
- Summary tiles: **Compared** (parts in both systems), **Differ**, **Total gap** (absolute units), **Fishbowl** total, **Point B** total.
- View tabs: **Differences** (default), **Needs a look** (flagged rows), **All parts**, **Archived**.
- Search ("Search part or description…") and a count with the snapshot time.
- Table: Part, Fishbowl, Point B, **Units**, Variance, %, Held, Committed, Notes, and an archive button.

## Reading the numbers
- **Variance = Point B minus Fishbowl.** Green (+) means Point B has more than Fishbowl records; red (−) means less.
- Point B's figure is physical stock with committed allocations excluded, so both sides mean the same thing.
- "—" means the part doesn't exist in that system (different from a count of 0).
- Notes flags: **Not at Point B**, **Not in Fishbowl**, **Mixed UOM**, **Unit mismatch**, **Held stock**.
- Parts counted in different units (e.g. eaches vs cases) get no variance and are left out of the totals.

## How to…
### Work through discrepancies
1. Stay on **Differences** (or **Needs a look** for flagged parts).
2. Search for a part if needed.
3. Fix the count in Fishbowl, then click **Refresh** after the next Fishbowl snapshot to confirm.

### Correct a unit-of-measure label
1. Click the unit in the **Units** column for that part.
2. Type the correct Fishbowl unit (e.g. EA) and press Enter or click the check mark. Leaving it blank clears the override; Esc or × cancels.
3. Use this only when the label was wrong — if the two systems genuinely pack differently, archive the row instead.

### Archive a settled part
1. Click the archive icon at the end of the row. It leaves the report and every total.
2. To bring it back, open the **Archived** tab and click the restore icon.

### Export
Click **Export** to download what's currently shown (respects the tab and search).

## Good to know
- The Fishbowl snapshot should refresh three times a day. If it's more than about 26 hours old, an amber warning appears — differences may just be staleness.
- Archiving and unit corrections are saved for everyone and can be undone (restore / blank the unit).
- If a blue banner says a migration is needed, the report still works but saving changes won't until it's applied — tell an admin.`,
  },

  /* ──────────────────────────── Sales Analysis ───────────────────────────── */
  {
    path: "/sales",
    title: "Sales Analysis (All)",
    section: "Sales",
    summary:
      "Trailing-12-month revenue for the whole business — top products, fragrance mix, monthly trend vs last year, the D2C vs Wholesale split and a month-by-month matrix.",
    body: `## What it's for
A read-only view of sales over the 12 months ending in a month you choose, compared with the 12 months before. "All" includes every order, wholesale and D2C together. Visible to owner, admin, full-access users and sales. (See also Sales Analysis (Wholesale) and (D2C), which are the same page limited to one channel.)

## What's on the page
- KPI cards: **TTM Revenue**, **Avg Monthly**, **Products**, **Fragrances**, each with a ▲/▼ change "vs prior TTM".
- Filter bar: search ("Search SKU, product, fragrance…"), a **month** dropdown and a **year** dropdown (the window ends at that month), and a toggle **Top 15 Products** / **Fragrance Mix**.
- Charts: **Top 15 Products — TTM Revenue** (or **Fragrance Mix — TTM Revenue**) as ranked bars, and **Monthly Revenue** vs the same month last year.
- **D2C vs Wholesale** (All page only): Wholesale and D2C TTM cards with share and year-over-year change, plus a monthly channel chart.
- **Matrix**: one row per product (top 15, the rest folded into "Other") or per fragrance, with a column per month, a TTM total and a **Total Sales** line. Click a row to expand it — products break down by fragrance, fragrances by product.

## How to…
### Look at a different period
1. Pick the end **month** and **year**. The page shows the 12 months ending there and compares with the 12 months before.

### See how one product or fragrance is doing
1. Type a SKU, product name or fragrance in the search box. KPIs, charts and the matrix all narrow to matching rows, and the year-over-year comparison is narrowed the same way.

### Compare fragrances
1. Click **Fragrance Mix**. Named fragrances (Sea Salt, Grapefruit, Lavender, Eucalyptus, Coconut, Agave Pear, Cypres, Orange Ginger) are broken out; everything else is "Other".

### Filter by brand
Use the **All / NI / Sassy** switch in the top bar.

## Good to know
- Sales come from Fishbowl orders, synced automatically several times a day. Revenue is the order line totals.
- Avg Monthly divides by months that actually had sales, not a flat 12.
- The D2C vs Wholesale section ignores the search box (it says "not filtered by the search above"); it may note when the prior year isn't fully covered.
- Your search, month and year are kept in the address bar, so you can bookmark or share a view.
- There is no export button on this page.`,
  },
  {
    path: "/sales/wholesale",
    title: "Sales Analysis (Wholesale)",
    section: "Sales",
    summary:
      "The Sales Analysis page limited to orders from wholesale accounts — TTM revenue, top products, fragrance mix and monthly trend.",
    body: `## What it's for
Exactly the same layout and controls as **Sales Analysis (All)**, but counting only orders from wholesale accounts (stores, distributors, marketplaces). Visible to owner, admin, full-access users and sales.

## What's on the page
- KPI cards: **TTM Revenue**, **Avg Monthly**, **Products**, **Fragrances**, with change vs the prior 12 months.
- Search, end **month** and **year**, and the **Top 15 Products** / **Fragrance Mix** toggle.
- Ranked-bar chart, **Monthly Revenue** vs last year, and the month-by-month matrix (click a row to expand).
- There is no D2C vs Wholesale section here — that only appears on the All page.

## How to…
### Find the best-selling wholesale products for a period
1. Pick the end month and year.
2. Leave **Top 15 Products** selected and read the ranked bars or the matrix TTM column.

### Check one SKU's wholesale trend
1. Type the SKU or name in the search box.
2. Read the **Monthly Revenue** chart for this year vs last year.

## Good to know
- Data comes from Fishbowl orders, split into wholesale vs D2C by customer.
- If the page says "Channel breakdown isn't available yet", the channel data hasn't been set up in the database; the All page still works. Ask an admin.
- Brand filtering uses the top-bar **All / NI / Sassy** switch.`,
  },
  {
    path: "/sales/d2c",
    title: "Sales Analysis (D2C)",
    section: "Sales",
    summary:
      "The Sales Analysis page limited to direct-to-consumer storefront orders — TTM revenue, top products, fragrance mix and monthly trend.",
    body: `## What it's for
Same layout and controls as **Sales Analysis (All)**, but counting only orders from the D2C storefronts (the brand websites). Visible to owner, admin, full-access users and sales.

## What's on the page
- KPI cards: **TTM Revenue**, **Avg Monthly**, **Products**, **Fragrances**, with change vs the prior 12 months.
- Search, end **month** and **year**, and the **Top 15 Products** / **Fragrance Mix** toggle.
- Ranked-bar chart, **Monthly Revenue** vs last year, and the expandable month-by-month matrix.

## How to…
### See D2C revenue for the last 12 months
1. Leave month/year at the current month (the default) and read **TTM Revenue**.

### See which fragrances sell best online
1. Click **Fragrance Mix** and read the ranked bars.
2. Click a fragrance row in the matrix to see which products drove it.

## Good to know
- Data comes from Fishbowl orders (storefront orders are pushed into Fishbowl), synced several times a day.
- If you see "Channel breakdown isn't available yet", use the All page and ask an admin.
- Use the top-bar brand switch to look at NI or Sassy alone.`,
  },

  /* ──────────────────────────── Rep Directory ────────────────────────────── */
  {
    path: "/sales-team",
    title: "Rep Directory",
    section: "Team",
    summary:
      "The roster of independent sales reps and agencies — search, add reps, email selected reps from your Outlook, and invite reps to the rep portal.",
    body: `## What it's for
The directory of the outside sales reps who sell FMG brands, grouped by agency. Use it to look up a rep's contact details, email a group of reps, add new reps, and give reps a login to the rep portal. Visible to owner, admin, full-access users and sales.

## What's on the page
- Summary tiles (desktop): **Reps**, **Agencies**, **States**, **No email**.
- Search ("Search name, agency, territory, location"), an **All agencies** dropdown (includes "No agency" when some reps have none), and **Clear** when filtered.
- **Add rep** and **Email N reps** buttons.
- Table: checkbox, **Rep**, **Agency** (with agency code), **Territory**, **Location**, **Email**, **Phone**, **Portal**. Click a column header to sort. 25 reps per page with **Prev** / **Next**.
- Clicking a row opens that rep's page.

## How to…
### Email a group of reps
1. Tick the checkbox next to each rep, or the header checkbox to select every rep in the current filter (all pages). Reps with no email can't be selected.
2. Click **Email N reps**.
3. Optionally add **Cc** addresses (comma-separated; cc'd on every copy).
4. Write the **Subject** and **Message** (plain text). You can use merge fields: {{firstName}}, {{repName}}, {{agency}}, {{territory}}, {{city}}, {{state}}, and sender fields {{senderName}}, {{senderFirstName}}, {{senderEmail}}.
5. Check the **Preview** for the first recipient, then click **Send N emails**.
6. The result shows "Sent X of Y" and lists any failures.

### Add a rep
1. Click **Add rep**.
2. Fill in **Name** (required) and any of Agency, Agency code, Email, Phone, Street address, City, State, Zip, Territory / Role, Samples tier.
3. Click **Add rep**.

### Invite a rep to the rep portal
1. Find the rep (they need an email on file) and click **Invite** in the Portal column.
2. A banner confirms "Invite email sent." or "Account already existed — portal access refreshed."

### Find who covers a region
Type a state, city or territory in the search, or sort by **Location** or **Territory**.

## Good to know
- Emails send from **your own connected Outlook** account, one separate email per rep (they don't see each other). If Outlook isn't connected, the pop-up links you to Settings to connect it and Send stays disabled.
- Portal invites need an **agency code** on the rep; the portal only shows that agency's customers. The rep gets an email to set a password.
- Editing and deleting a rep happen on the rep's own page.
- If a yellow banner says you're seeing the built-in roster (read-only), adding, editing and invites are unavailable until an admin finishes setup.`,
  },
  {
    path: "/sales-team/[id]",
    title: "Rep details",
    section: "Team",
    summary:
      "One rep's contact details, agency assignment and agency teammates, with buttons to email, invite to the portal, or edit/delete the rep.",
    body: `## What it's for
The profile page for a single sales rep, opened by clicking a rep in the Rep Directory.

## What's on the page
- **Rep Directory** back link.
- Header with name, agency (and code), territory and location, plus action buttons:
  - **Email** (only if the rep has an email)
  - **Invite to portal** (only if the rep has an email and is in the editable roster) — changes to **Invited** when done
  - **Edit**
- **Contact** card: Email, Phone, Address (shown as a mailing block for sample/catalog shipments).
- **Assignment** card: Agency, Agency code, Territory, Samples tier.
- **Agency team** card: other reps at the same agency — click one to jump to their page.
- "Coming soon" placeholders for Sales performance, Accounts and Activity (not built yet).

## How to…
### Update a rep's details
1. Click **Edit**.
2. Change any field (Name is required).
3. Click **Save changes**. Changes are not saved until you click it.

### Delete a rep
1. Click **Edit**, then **Delete** at the bottom-left.
2. Confirm the browser prompt. This removes the rep from the roster and **cannot be undone**.

### Email this rep
1. Click **Email**, write the subject and message (merge fields like {{firstName}} work), and click **Send 1 email**. It sends from your connected Outlook.

### Give the rep portal access
1. Click **Invite to portal**. The rep receives an email to set a password and then sees only their agency's data. The rep must have an agency code.

## Good to know
- If a yellow banner says the rep comes from the built-in roster, editing and invites are unavailable until an admin finishes setting up the rep table.`,
  },
  {
    path: "/sales-team/rep-analysis/[rep]",
    title: "Rep analysis",
    section: "Team",
    summary:
      "A printable year-to-date vs last-year performance review for one rep group, with a revenue bridge, product and customer breakdowns and recommended actions.",
    body: `## What it's for
A one-page performance review for a rep group (agency), meant to be printed or saved as PDF and sent to the agency principal. You usually reach it from the Dashboard's "Needs you" list, where a declining rep group shows a **Build analysis** button.

## What's on the page
- **Print / Save PDF** button (uses your browser's print dialog; the controls are hidden on the printout).
- Title: rep group name and the window, e.g. "2026 vs 2025 year-to-date (Jan 1 – October 20)" — always Jan 1 through yesterday for both years.
- **Summary**: last-year YTD, this-year YTD, **Variance** ($ and %), and **Buyers** (accounts that bought this year / total accounts, and last year's count).
- **YTD bridge** waterfall from last year's total to this year's, split into **Volume**, **Mix**, **Price** (continuing products) and **New** / **Lost** (products gained or dropped).
- **Products**: group by **Collection**, **Product** or **SKU**; filter **All / Growing / Declining / New this year / Dropped**; search; sortable columns (last year, this year, the five bridge parts, Δ); 12 rows per page.
- **Customers**: accounts with activity, filter **All / Growing / Declining / New this year / Lost**, search, sortable, 15 per page. Biggest declines show first.
- **Recommended actions**: a short numbered list generated from the numbers (e.g. which account to shore up, whether price is dragging).

## How to…
### Send a review to an agency
1. Open the analysis (Dashboard → **Build analysis** on the rep).
2. Optionally set the product grouping and filters you want on the printout.
3. Click **Print / Save PDF** and choose "Save as PDF" in the print dialog.
4. Attach the PDF to an email yourself — this page does not send anything.

### Find the accounts driving a decline
1. In **Customers**, choose **Declining** (or **Lost**).
2. Sort by **Δ** to see the biggest drops first.

## Good to know
- Revenue is Fishbowl order-line totals, excluding shipping and subtotal lines — the same rules as the Dashboard.
- Customers are matched to the rep group by agency, so the totals agree with the Dashboard alert.
- The page is read-only; there is no sidebar link to it.`,
  },

  /* ───────────────────────────── Sales Hub ───────────────────────────────── */
  {
    path: "/sales-hub",
    title: "Sales Hub",
    section: "Team",
    summary:
      "Sales enablement by retail channel: brand one-liner and pitch, channel talking points, and TTM customers, revenue and top products for each channel.",
    body: `## What it's for
A cheat sheet for selling into each wholesale channel (Gift, Salon/Spa, Pharmacy, Natural/Grocery, Hospital, Distributor, Hardware, Web, Flower, Casinos, Social Seller). It pairs ready-to-use messaging with the actual sales numbers for that channel. Visible to owner, admin, full-access users and sales.

## What's on the page
- **Brand banner**: the brand's **One-Liner** (with a copy button) and **Target Consumer**.
- **Select Channel** list on the left (a dropdown at the top on phones), each with its trailing-12-month revenue, sorted by revenue.
- For the selected channel:
  - Header with the channel's selling point (copyable) and a **% YoY** badge.
  - KPIs: **Customers**, **TTM Revenue**, **Total Orders**, **Avg / Customer**.
  - **Talking Points** — numbered pitch points for that channel.
  - **Brand Elevator Pitch** (click to expand) — the pitch (copyable) and brand pillars.
  - **Product & Fragrance Breakdown** (TTM): top 20 products with Revenue, Units and % of Channel. Click a product with several fragrances to expand the fragrance split.

## How to…
### Prepare for a call with a salon or spa
1. Click **SALON/SPA** in the channel list.
2. Read the **Talking Points** and copy the selling point or one-liner with the copy icon.
3. Check **Product & Fragrance Breakdown** to lead with what sells best in that channel.

### Switch brand messaging
Use the **NI / Sassy** switch in the top bar. The messaging follows the selected brand; when **All** is selected the NI messaging is shown, while the numbers combine both brands.

### Copy text for an email
Click the copy icon next to the one-liner, channel selling point or elevator pitch; it turns into a check mark when copied.

## Good to know
- Numbers are trailing 12 months from Fishbowl sales; YoY compares with the 12 months before.
- Messaging is fixed content maintained by the team, not editable on this page.
- Reps see a similar Sales Hub inside the rep portal.`,
  },

  /* ───────────────────────── Rep Portal Preview ──────────────────────────── */
  {
    path: "/sales-team/portal-preview",
    title: "Rep Portal Preview",
    section: "Team",
    summary:
      "Admin-only view of the live rep portal exactly as a chosen rep's agency sees it, in desktop or mobile size.",
    body: `## What it's for
Lets owners and admins see what an outside rep sees when they log in to the rep portal, without logging in as them. It shows the real, live portal — not a copy — scoped to the selected rep's agency. Only owner and admin roles can open it.

## What's on the page
- **Rep Directory** back link.
- **Viewing as** dropdown — lists reps that have an agency code, as "Name · Agency (code)". The first such rep is selected by default.
- **Desktop** / **Mobile** buttons — show the portal full width or at phone width.
- **Reload preview** button (circular arrow).
- **Open** — opens the same scoped portal in a new browser tab.
- The portal itself, which has the tabs reps use: Customers, Orders, Availability, Sales Hub, Assets, Contact.

## How to…
### Check what a rep can see
1. Choose the rep in **Viewing as**.
2. Click through the portal tabs in the preview — you'll only see that agency's customers and orders.
3. Click **Mobile** to check the phone layout, since most reps use phones.

### Refresh after a change
Click **Reload preview** after updating data (e.g. a customer's rep or an asset) to see the latest.

## Good to know
- Reps without an agency code can't be previewed ("A rep needs an agency code before their portal view can be scoped"). Add one on the rep's page via **Edit**.
- Reps sign in at /portal and only ever see their own agency's customers.
- To give a rep access, use **Invite** in the Rep Directory.`,
  },
];
