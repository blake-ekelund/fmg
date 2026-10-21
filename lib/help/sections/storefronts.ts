import type { GuideEntry } from "../types";

/**
 * User guide — Storefronts section (Orders, Prebookings, Customer Service,
 * Discounts, Feedback & Testimonials, Product Reviews, Accounts, Analytics).
 * Written from the actual UI code; keep in sync when those pages change.
 */
export const storefrontsGuide: GuideEntry[] = [
  // ───────────────────────────────────────────── Orders (list)
  {
    path: "/storefronts/purchases",
    title: "Orders",
    section: "Storefronts",
    summary:
      "Every order from sassyandco.com, naturalinspirations.com, Faire and MarketTime in one list, with where each one stands (needs Fishbowl, needs tracking, shipped).",
    body: `
## What it's for
One list of incoming orders — D2C and wholesale — from both storefronts plus the Faire and MarketTime marketplaces. The main job here is to see which orders still need to go into Fishbowl or still need tracking, and to open an order to act on it.

Visible to owner, admin, user, sales and operations roles.

## What's on the page
- **Sync MarketTime** and **Sync Faire** buttons (top right) — pull open marketplace orders right now instead of waiting for the automatic sync.
- A view switcher: **Orders** (real, completed business), **Abandoned carts** (D2C checkouts that were started but never paid — not real orders), and **Archived** (orders taken off the page but kept on file).
- A search box ("Search order #, buyer, email").
- Three filters: source (**All sources**, MarketTime, Faire, Sassy, Natural Inspirations), channel (**All channels**, D2C, Wholesale), and status (**All**, **Needs Fishbowl**, **Needs tracking**, **Shipped**, each with a count).
- The table: Order, Placed, Ship by, Shipped, Channel, Buyer, Items, Total, Status. Click any column heading to sort; click again to flip the direction.
- For Faire/MarketTime orders the Buyer cell also shows which Fishbowl customer the order will book under (green "→ name"), or an amber **No customer match** flag.
- 25 orders per page with **Prev** / **Next**.

### What the Status badge means
- **Needs Fishbowl** — not entered into Fishbowl yet.
- **Needs tracking** — in Fishbowl, but no tracking number recorded yet.
- **Shipped** — a tracking number is on the order.
- **Cancelled** — cancelled order.

## How to…
### Find orders that still need to go into Fishbowl
1. Stay on the **Orders** view.
2. Set the status filter to **Needs Fishbowl**.
3. Click an order row to open it and use **Create Fishbowl estimate** or **Mark manually** (see the order detail page guide).

### Pull in new Faire or MarketTime orders right now
1. Click **Sync Faire** or **Sync MarketTime**.
2. Wait for the spinning icon to stop. A line appears under the header, e.g. "Faire: 2 new orders · 14 open on Faire", or "nothing new".
3. If it says some "failed to import", tell whoever looks after the integration — those orders did not come in.

Clicking Sync twice is harmless; orders already on the page are not duplicated.

### Fix a marketplace order flagged "No customer match"
1. Click the order to open it.
2. In the **Fishbowl customer** box, click **Assign customer**, search, and pick the right Fishbowl customer.

### Look at abandoned carts
1. Click **Abandoned carts** in the view switcher.
2. These are D2C checkouts where payment never completed — useful for win-back, but they are not orders and should not be shipped.

### Find an old or finished order
1. Click **Archived**.
2. Search or filter as usual.

## Good to know
- **Syncing only imports.** Sync Faire / Sync MarketTime add orders to this page; they never push anything into Fishbowl by themselves.
- **Automatic syncs:** Faire and MarketTime are also checked automatically about every 30 minutes.
- **Automatic Fishbowl entry:** new storefront orders are pushed into Fishbowl as estimates automatically (right after checkout, plus a backstop check every 15 minutes). Marketplace orders with a matched customer are pushed the same way. Unpaid D2C checkouts are never pushed. If the 3PL (Point B) is short on stock, the order is held as **Needs Fishbowl** and retried automatically once stock arrives.
- **Automatic tracking:** about every 30 minutes the app checks Fishbowl for shipped cartons and fills in tracking. For storefront orders this also emails the customer a "your order shipped" message (once only).
- Twice a day the app also marks Faire/MarketTime orders that someone keyed into Fishbowl by hand, so their status catches up.
- **Archive:** there is no Archive button on this page. A Faire or MarketTime order that's archived but still open on the marketplace comes back onto the Orders view on the next Sync, with its Fishbowl entry intact.
- The page shows the latest 200 orders.
- Orders never create tasks in the Task List.
`,
  },

  // ───────────────────────────────────────────── Order detail
  {
    path: "/storefronts/purchases/[id]",
    title: "Order detail",
    section: "Storefronts",
    summary:
      "One order as a printable invoice, where you push it into Fishbowl, assign the Fishbowl customer for marketplace orders, check it against Fishbowl, and record tracking.",
    body: `
## What it's for
The full view of a single order (open it by clicking a row on **Orders**). It doubles as a printable invoice / packing document and is where you move the order through its stages: into Fishbowl, then shipped with tracking.

## What's on the page
- **← Purchases** link back to the list.
- Action buttons (top right):
  - **Print** — prints just the invoice section.
  - When the order is not yet in Fishbowl: **Create Fishbowl estimate** (for a marketplace order it reads **Create estimate — [customer name]**) and **Mark manually**. Storefront (Sassy/NI) orders also show a small dropdown of **TEST CUSTOMER #1** / **TEST CUSTOMER #2** — storefront estimates are still in a pilot and book under a test customer.
  - When the order is in Fishbowl: **Undo Fishbowl**.
- **Fishbowl customer** box (Faire/MarketTime orders only) — the Fishbowl customer this order books under, with **Assign customer** / **Change customer** and **Clear**.
- **Fishbowl check** box (Faire/MarketTime orders only) — **Run check** / **Re-check**.
- The invoice: order number and date, channel badge, payment note if not paid, status badge, **Bill to** / **Ship to**, Sales rep, Payment terms, Contact, the **Shipment** section, line items (with UPCs), and totals (Subtotal, Discount, Shipping, Gift mailer, Tax, Total).
- At the bottom: who entered it into Fishbowl and when (or "Not yet entered into Fishbowl."), plus any customer note.

## How to…
### Push an order into Fishbowl as an estimate
1. For a Faire/MarketTime order, make sure the **Fishbowl customer** box shows a customer (assign one first if it's amber — the button is disabled until you do).
2. Click **Create Fishbowl estimate** (or **Create estimate — [customer]**).
3. On success the bottom line reads "Estimate [number] created in Fishbowl by [you] on [date]" and the status becomes **Needs tracking**.

### When it says "Not pushed — Point B is short"
The warehouse doesn't have enough of one or more lines. The card lists the short items. Choose:
- **Push anyway** — create the estimate regardless (you'll ship short or wait).
- **Leave it** — do nothing; the automatic sweep retries by itself once Point B receives stock.

### Record that you keyed the order into Fishbowl yourself
1. Click **Mark manually**. This only stamps the order as entered (with your name and time) — nothing is sent to Fishbowl.
2. If that was a mistake, click **Undo Fishbowl**. Undo only clears the stamp in this app; it does **not** delete anything in Fishbowl.

### Assign or change the Fishbowl customer (Faire/MarketTime)
1. Click **Assign customer** (or **Change customer**).
2. Type at least two letters and press Enter or click **Search** — it searches active Fishbowl customers.
3. Click the right customer. If none match, create the customer in Fishbowl first, then search again.
4. You can only change the customer before the order is in Fishbowl.

### Add tracking by hand
1. In **Shipment**, pick a carrier (USPS, UPS or FedEx) and type the tracking number.
2. Click **Save**. The tracking number becomes a link to the carrier's tracking page, and the status becomes **Shipped**.
3. To fix it later click **Edit**; to remove it click **Clear**.

### Check a marketplace order against Fishbowl
1. In **Fishbowl check**, click **Run check**.
2. It shows the matching Fishbowl sales order and either "Fishbowl matches the marketplace order." or a list of differences (marketplace value vs Fishbowl value), plus whether Point B can fill every line.

### Print an invoice
Click **Print** — only the invoice prints, buttons are hidden.

## Good to know
- **Saving tracking emails the customer.** For Sassy/NI orders, saving tracking sends the customer their "your order shipped" email (only once, even if you edit it later). For Faire orders it tells Faire the order shipped instead. Normally tracking is filled in automatically from Fishbowl, so you rarely need to type it.
- Editing the tracking number doesn't change the original ship date.
- Each Fishbowl search and **Run check** briefly uses one of the limited Fishbowl license seats — that's why the check only runs when you click it.
- An unpaid D2C order shows "Checkout started but not paid…" in place of addresses — it's an abandoned cart, not a real order.
`,
  },

  // ───────────────────────────────────────────── Prebookings
  {
    path: "/storefronts/prebookings",
    title: "Prebookings",
    section: "Storefronts",
    summary:
      "Holiday prebook requests from the Sassy and NI storefronts — what each buyer reserved, totals across them, and a simple status to track follow-up.",
    body: `
## What it's for
Buyers reserve holiday product on the storefronts before the season. This page lists every request, who to contact, what they asked for, and an estimated value, so the team can follow up and convert them. No payment is taken on a prebook.

Visible to owner, admin, user, sales, marketing and operations roles.

## What's on the page
- **Add prebooking** button (top right) to enter one by hand (e.g. from a phone call or trade show).
- Total tiles for whatever is currently filtered: **Requests**, **HC case packs**, **GS case packs** (with the number of individual sets), **Lip packs**, **HC displays**, **Lip displays**, **Est. total**.
- Search box ("Search buyer, email, phone").
- Status buttons with counts: **All**, **New**, **Contacted**, **Converted**, **Archived**.
- Store dropdown: **Both stores**, **Sassy**, **NI**.
- Table: Business, Contact, Email (click to email), Phone, Requested date, Store, Total, Status.
- Click a row to expand it and see the line items (Product #, Item, Qty, Unit, Amount), the estimated total, and any buyer notes.

## How to…
### Work through new requests
1. Click the **New** status button.
2. Click a row to see what they reserved.
3. Contact the buyer (click their email), then change the row's Status dropdown to **Contacted**.

### Mark a prebook as converted or archive it
1. Use the colored **Status** dropdown on the row and choose **Converted** or **Archived**.
2. It saves immediately (a small spinner shows while saving). If it fails, the old status comes back and an error shows at the top.

### Add a prebooking by hand
1. Click **Add prebooking**.
2. Choose **Store** (Sassy or Natural Inspirations) and **Status**.
3. Fill in **Business name**, **Contact name** and **Email** (required) and **Phone** (optional).
4. Use the + / − counters to set quantities by personality (Mini Hand Crème, Gift Sets, Lip Butters) and the displays.
5. Add **Notes** if useful, check the **Est. total**, and click **Add prebooking**.

### See totals for one store or status
Pick the store and/or status filter — the total tiles at the top recalculate for just those rows.

## Good to know
- Totals are **estimates only**; nothing is charged and nothing is sent to Fishbowl from this page.
- Changing a status does not email the buyer.
- Gift sets sell in case packs of 4, which is why the GS tile shows both packs and individual sets.
- There is no delete — use **Archived** to get a request out of the way.
`,
  },

  // ───────────────────────────────────────────── Customer Service
  {
    path: "/storefronts/conversations",
    title: "Customer Service",
    section: "Storefronts",
    summary:
      "The inbox for the storefront chat concierge — read every chat, take over a conversation, reply to the shopper live, and leave internal notes.",
    body: `
## What it's for
Shoppers on sassyandco.com and naturalinspirations.com can chat with an AI concierge. Every conversation lands here. You can read what the bot said (and why), and take over a chat to answer the shopper yourself — your reply appears in their chat window within a few seconds.

Visible to owner, admin, user, sales, marketing and operations roles.

## What's on the page
- Status tabs: **Needs a human** (opens by default; an amber number shows how many are waiting), **With us**, **Bot handled**, **Closed**, **All**.
- Store dropdown (**Both stores**, **Sassy**, **Natural Inspirations**) and a "Search conversations…" box.
- Left: the inbox list — each card shows status, store (and "wholesale" if applicable), how long ago, the first question, which quick-start chip the shopper used, who it is (email/name or "Anonymous shopper"), message count and who has taken it.
- Right: the open conversation — the shopper, store, channel, start time and the page they were on; buttons **Hand back to bot** and **Close**; then the transcript.
- In the transcript: shopper messages, **Concierge** (bot) replies, team replies (green, with the staff name), and amber **Internal note** entries. Under bot replies there's a small "N tool calls" line you can click to see exactly what product/order information the bot looked up.
- The reply box at the bottom with an **Internal note (the shopper never sees this)** checkbox and a **Send** (or **Save** for notes) button.

## How to…
### Answer a shopper who needs a person
1. Open the **Needs a human** tab and click the conversation.
2. Read the transcript.
3. Type in the "Reply to the shopper…" box and click **Send** (or press Ctrl/Cmd + Enter).
4. Sending takes the conversation off the bot — it moves to **With us** and the bot stops answering it.

### Leave a note for the team
1. Tick **Internal note (the shopper never sees this)**.
2. Type your note and click **Save**. It appears in amber in the transcript and is never shown to the shopper.

### Give a conversation back to the bot
Click **Hand back to bot**. The concierge resumes answering that shopper.

### Close a conversation
Click **Close**. It moves to the **Closed** tab.

### Figure out why the bot said something wrong
Click the "tool calls" line under the bot's reply. If the data it looked up was empty or wrong, the product info needs fixing; if the data was right, the bot made it up.

## Good to know
- A conversation lands in **Needs a human** when the bot escalates it (for example, it can't help or the shopper asks for a person). The bot won't override a conversation someone on the team has already taken.
- The inbox and open conversation refresh automatically every few seconds — no need to reload.
- Opening a conversation marks it read.
- Replies go to the chat widget only — nothing is emailed from this page.
`,
  },

  // ───────────────────────────────────────────── Discounts
  {
    path: "/storefronts/discounts",
    title: "Discounts",
    section: "Storefronts",
    summary:
      "Create and manage discount codes for the Sassy and Natural Inspirations storefronts, including product-specific codes and batches of single-use codes, and see how much each is used.",
    body: `
## What it's for
Discount codes shoppers type at checkout on the two storefronts. Checkout only accepts codes that are active and inside their date window. (This is not the same as the Promotions page.)

Visible to owner, admin, user, sales, marketing and operations roles.

## What's on the page
- **New code** button (top right).
- Summary tiles: **Active codes**, **Uses**, **Spent**, **Discount given**.
- The codes table: **Code**, **Discount**, **Status**, **Window**, **Uses**, **Spent**, **Discount given** — click a heading to sort. Codes limited to certain products show what they apply to; batches show a **Unique** tag and "redeemed / generated".
- Row actions: click the **Status** chip to pause/activate, **Codes** (for unique-code batches), **Edit** (pencil), and a trash icon to delete.
- 10 codes per page.
- The brand switch in the top bar filters the list: picking Sassy or NI shows that store's codes plus codes for both stores, and the usage numbers switch to that store.

### Status
**Active** (on and in its window), **Scheduled** (start date is in the future), **Expired** (end date has passed), **Paused** (switched off).

## How to…
### Create a simple code (e.g. 15% off)
1. Click **New code**.
2. Type the **Code** (e.g. GLOWUP15).
3. Pick the **Store**: **Sassy**, **NI** or **Both**.
4. Under **Product discount** choose **% off** or **$ off** and enter the amount.
5. Optionally open **Limits, dates & note** to set a **Minimum subtotal**, **Starts** / **Ends** dates, **Max uses per customer**, and an **Internal note**.
6. Click **Create code**.

### Make a free-shipping code
1. In **New code**, set **Product discount** to **None** — Free shipping is then switched on automatically.
2. Or keep a % / $ discount and tick **Free shipping** to waive shipping on top of it.

### Limit a code to certain products, or give a free item
1. Tick **Only certain products**.
2. Narrow it with **Brand**, **Collection** and **Product title** (each narrows the next; leaving one empty means "all"). A sentence underneath tells you how many products qualify.
3. Optionally set **Apply to at most** N items per order.
4. For a free product, choose **Free item** as the Product discount — you must pick products, otherwise the save is blocked (it would make the whole cart free).

### Create a batch of single-use codes (e.g. for influencers)
1. In **New code**, tick **Unique one-time codes — generate a batch of single-use codes** (only available when creating).
2. The code field becomes **Batch name (prefix)**. Enter **How many to generate**.
3. Click **Create batch**.
4. On the row, click **Codes** to see them: **Copy available** copies unused codes, **Download CSV** exports all of them with status, and **Generate** adds more.

### Pause or reactivate a code
Click the code's **Status** chip. It toggles between Active and Paused right away.

### Edit a code
Click **Edit**, change fields, click **Save changes**.

### Delete a code
Click the trash icon, read the warning, then click **Delete code** (or **Delete batch**).

## Good to know
- **Deleting can't be undone.** Shoppers can no longer use the code; deleting a batch removes every generated code, including redeemed ones. Past orders keep their discount. Pausing is the safe alternative.
- Dates follow your local day: a start applies from midnight, an end lasts through the whole day. Leave dates blank for an always-on code.
- Uses, Spent and Discount given come from storefront orders that used the code. For unique batches, Uses is the number of codes redeemed.
- The reward codes handed out by **Feedback & Testimonials** come from a batch on this page; if that batch is missing, the feedback offer stays hidden on the storefront.
`,
  },

  // ───────────────────────────────────────────── Feedback & Testimonials
  {
    path: "/storefronts/feedback",
    title: "Feedback & Testimonials",
    section: "Storefronts",
    summary:
      "Feedback shoppers leave about the storefront itself (in the cart, in exchange for a reward code) — what broke, what they'd change, and which entries may be quoted.",
    body: `
## What it's for
In the cart, before checkout, shoppers can answer a short survey about the website and get a single-use reward code. This page collects those answers. These are reviews of the **store/website**, not of products (nobody had received an order yet). Product reviews live on **Product Reviews**.

Visible to owner, admin, user, sales, marketing and operations roles.

## What's on the page
- Roll-up tiles: **Responses**, **Avg. ease of use** (out of 5), **Reported bugs** ("said something broke"), and **Codes redeemed** (how many reward codes turned into an order, and the %).
- **How the site reads** — how often each describing word was picked; negative words are highlighted.
- Search box ("Search answers, name, email, code"), status tabs (**All**, **New**, **Reported bugs**, **Reviewed**, **Actioned**, **Archived**) and a store dropdown (**Both stores**, Sassy, NI).
- Each entry shows its status, the star rating, a **reported a bug** tag if they hit a problem, a **publishable** tag if they allowed quoting, the chosen words, their answers (**What broke**, **What they'd change**, **On the vibe**), and the reward code with **redeemed** or "code unspent".
- Buttons on each entry: **Mark reviewed**, **Mark actioned**, **Archive**.

## How to…
### Triage new feedback
1. Open the **New** tab.
2. Read each entry. Click **Mark reviewed** once read, or **Mark actioned** once you've fixed or acted on it.
3. Click **Archive** for anything that needs no follow-up.

### Find bug reports
Click the **Reported bugs** tab and read the **What broke** answers. Pass real bugs to whoever maintains the storefront.

### Find quotes for marketing
Look for entries tagged **publishable** — only those may be quoted publicly.

### See whether the reward offer is paying off
Check the **Codes redeemed** tile — it shows how many people who left feedback then bought with their code.

## Good to know
- Status changes save instantly; if a save fails the error shows at the top.
- Nothing on this page emails the shopper.
- The reward codes come from a unique-code batch on the **Discounts** page. If that batch doesn't exist, the storefront hides the feedback offer.
`,
  },

  // ───────────────────────────────────────────── Product Reviews
  {
    path: "/storefronts/reviews",
    title: "Product Reviews",
    section: "Storefronts",
    summary:
      "Moderate product reviews customers leave on each storefront's /review page — approve, reject, or send back to pending.",
    body: `
## What it's for
Customers review products on **sassyandco.com/review** and **naturalinspirations.com/review** — reached from the QR code on order inserts, email links and invoice links. Every review arrives **pending** and is moderated here. Only approved reviews whose author allowed featuring may ever be shown publicly.

Visible to owner, admin, user, sales, marketing and operations roles.

## What's on the page
- Tiles: **Reviews**, **Avg. rating**, **Awaiting moderation**, **Verified purchases**.
- Search box ("Search review, name, email, product"), status tabs (**Pending** — the default, **Approved**, **Rejected**, **All**) and a store dropdown (**Both stores**, Sassy, NI).
- Each review shows its status, stars, title and text, the product (or "Product not specified"), the reviewer, where it came from ("via insert QR", "via email link" or "via invoice link"), and tags: **verified purchase** (left from a real order link) and **may feature** (author agreed to be featured).
- Buttons: **Approve**, **Reject**, and **Back to pending** (once it's been decided).

## How to…
### Moderate new reviews
1. Open the **Pending** tab (the page opens there).
2. Read each review.
3. Click **Approve** for genuine, appropriate reviews, or **Reject** for spam, abuse or off-topic ones.

### Undo a decision
Click **Back to pending** on the review, then decide again.

### Find reviews you can use in marketing
Open **Approved** and look for the **may feature** tag. Without it, don't quote the review publicly.

### Start collecting more reviews
Share the review links, e.g. **sassyandco.com/review?src=insert** or **naturalinspirations.com/review?src=insert**, on order inserts.

## Good to know
- Changes save instantly; nothing is emailed to the reviewer.
- Approving is the gate — a review that isn't approved is never shown. Approval alone isn't enough to feature it; the author must also have allowed featuring.
- There's no incentive or discount attached to product reviews (unlike Feedback & Testimonials).
`,
  },

  // ───────────────────────────────────────────── Accounts
  {
    path: "/storefronts/accounts",
    title: "Accounts",
    section: "Storefronts",
    summary:
      "Every customer account from the Sassy and NI storefronts (D2C and wholesale) — approve or deny wholesale applications, and set rep, rep group and Fishbowl account number.",
    body: `
## What it's for
Everyone who has signed up on either storefront — D2C shoppers and wholesale buyers. For wholesale, this is where applications are approved or denied and where the Fishbowl account number is recorded. For any account, you can assign a sales rep and rep group. (This is separate from the Customers section.)

Visible to owner, admin, user, sales and operations roles.

## What's on the page
- Search box ("Search business, contact, email, account #…").
- Type buttons: **All**, **Wholesale**, **D2C** (with counts).
- Wholesale status buttons: **All**, **Pending**, **Approved**, **Denied** (hidden when D2C is selected; choosing a status shows wholesale accounts only).
- Store dropdown (**All stores**, **Sassy (sassyandco.com)**, **NI (naturalinspirations)**) and rep dropdown (**All reps**, **Unassigned**, then each rep name). A counter shows "X of Y".
- Table: **Account** (business, website, and for wholesale the business type, expected volume and tax ID), **Type**, **Store**, **Contact**, **Rep & group**, **Account #**, **Joined**, **Status**, **Actions**.
- Pending wholesale applications are always listed first.

## How to…
### Approve a wholesale account
1. Click **Wholesale**, then **Pending**.
2. Review the business details (website, business type, tax ID).
3. Click **Approve** on the row. The status chip turns green **Approved**.
4. Type their Fishbowl customer number in the **Account #** box ("Fishbowl #") and press Enter.

### Deny an application
Click **Deny** on the pending row.

### Revoke or restore wholesale access
- For an approved account, click **Revoke** (it becomes Denied).
- For a denied account, click **Approve** to restore access.

### Assign a rep and rep group
1. Click into the **Rep** box on the row and type a name (suggestions from earlier entries appear as you type).
2. Do the same in the **Rep group** box.
3. Press Enter or click away — it saves then. Press Esc to cancel your typing.

### Find accounts with no rep
Choose **Unassigned** in the rep dropdown.

## Good to know
- Rep, Rep group and Account # save when you leave the box (or press Enter) — there's no Save button. Clearing a box and leaving it removes the value.
- Approving, denying or revoking does **not** send the customer an email from this page — let them know separately if needed.
- D2C accounts show default values (rep "admin", rep group "NI House") until someone types a different value; those defaults are only shown, not stored, unless you edit them.
- D2C accounts have no approval — their Status just reads "Customer".
`,
  },

  // ───────────────────────────────────────────── Analytics
  {
    path: "/storefronts/analytics",
    title: "Analytics",
    section: "Storefronts",
    summary:
      "Website traffic and checkout numbers for the Sassy and NI storefronts over the last 7 or 30 days.",
    body: `
## What it's for
A quick read on how the storefront websites are doing: visitors, pageviews, time on page, clicks, completed checkouts, revenue, conversion rate and abandoned carts. The data comes from the storefronts' own tracking, not Google or Shopify.

Visible to owner, admin, user, sales, marketing and operations roles.

## What's on the page
- Time window buttons: **7 days** (default) and **30 days**.
- Traffic tiles: **Unique visitors**, **Pageviews**, **Avg. time on page**, **Button clicks**.
- **Conversions**: **Completed checkouts**, **Revenue**, **Conversion rate**, **Abandoned carts** (with "$X recoverable" when there's value in them).
- **Traffic over time** chart.
- Ranked lists: **Top pages**, **Top buttons**, **Devices**, **Top referrers** (where visitors came from).

## How to…
### See one store only
Use the brand switch in the top bar (Sassy, NI, or both). The whole page reloads for that store.

### Compare this week with the month
Click **7 days**, then **30 days**.

### Check how many carts were abandoned
Look at the **Abandoned carts** tile. To see the actual carts, go to **Orders** and choose **Abandoned carts**.

### See which pages or buttons get attention
Scroll to **Top pages** and **Top buttons**.

## Good to know
- **Conversion rate** = completed checkouts ÷ unique visitors for the chosen window.
- **Completed checkouts** counts paid D2C orders and all wholesale orders (wholesale is on terms, so it counts even if not yet paid). Cancelled orders are excluded. With both stores selected, marketplace (Faire/MarketTime) orders on the Orders page may be included in these counts.
- **Abandoned carts** are D2C checkouts started at least an hour ago and never paid.
- If the page says "Not collecting yet", tracking isn't switched on for the storefronts — ask the admin.
- This page is read-only; nothing here changes the stores.
`,
  },
];
