import type { GuideEntry } from "../types";

/**
 * User guide: Dashboard, Daily Sales Log, Task List, Customers (wholesale +
 * D2C, list and detail pages) and Settings.
 */
export const coreGuide: GuideEntry[] = [
  /* ───────────────────────────── Dashboard ───────────────────────────── */
  {
    path: "/dashboard",
    title: "Dashboard",
    section: "",
    summary:
      "A one-screen read of the business: four headline numbers, a short ranked list of things to act on today, and the full widget wall one click away.",
    body: `
## What it's for
The Dashboard answers "is the business okay right now, and what needs me today?" It is the home page for owner, admin, user and marketing roles. (Sales staff land on Wholesale customers and operations staff land on the Task List instead.)

Everything on the page follows the **brand toggle** in the top bar (**All**, **NI**, **Sassy**). Switch it to see one brand's numbers; the choice is remembered in your browser.

## What's on the page
- **Greeting and summary line** — "Good morning, (name)", today's date, and a one-sentence read such as "Sales up $X YTD. October pacing to $Y. $Z at stake across N items."
- **Pulse tiles** (four clickable cards):
  - **Sales YTD** — this year's sales to date vs. the same period last year, with a green/red % arrow. Click to open Sales Analysis.
  - **This month** — month-to-date sales, which day of the month it is, and what the month is "on pace for". Click to open Sales Analysis.
  - **Customers** — active wholesale customers, how many are at risk (and what share of the book that is), and new customers this year. Click to open Wholesale customers.
  - **Inventory** — number of SKUs with less than 1.5 months of stock cover (counted on Point B available stock, the same as the Inventory page) ("need reorder" or "all covered"), plus how many are on watch. Click to open Inventory.
  - Under the tiles, one line splits YTD sales into **Wholesale** and **D2C** with each one's change vs. last year.
- **Do today** — at most five ranked "moves", each priced in dollars, with the total "at stake". Today these are rep agencies whose territory is down year-over-year ("Check in: (agency)"); clicking one opens that agency's rep analysis ("Build analysis"). Smaller items are counted but not shown ("these are the five worth your morning").
- **Standing reviews** — beneath the moves: "Review understock" and "Review overstock", each showing a SKU count. Click to open Inventory pre-filtered to that list.
- **Overdue tasks link** — if you have overdue tasks assigned to you, a "N overdue tasks" link appears next to "Do today" and opens the Task List.
- If nothing needs attention you see a green banner: "Nothing needs you today — no sliding territories or stock to review."
- **Full dashboard** — the divider at the bottom expands the detailed widgets (click **Hide detail** to collapse): **Monthly Sales** (monthly table, a Sales/Orders/AOV chart vs. last year, and a year-over-year driver analysis), **Wholesale** and **D2C** (tabs: Sales, Customers, Trends), **Inventory** (Overview, Stock Alerts, By Category), **Asset Library** (Overview, Recent, Third Party) and **Workflow Performance**. Each widget can be collapsed by clicking its header; that choice is remembered in your browser.
- **Blue + button** (bottom-right corner) — opens a menu with **New Task** (creates a task without leaving the page) and **Task Board** (goes to the Task List).

## How to…
**See one brand's numbers**
1. In the top bar, click **NI** or **Sassy** (or **All** for combined).
2. The tiles, moves and widgets reload for that brand.

**Open the daily sales for a month**
1. Click **Full dashboard** at the bottom.
2. In **Monthly Sales**, click any month row in the table.
3. You land on the Daily Sales Log for that month.

**Act on a rep that's sliding**
1. In **Do today**, click the rep agency row.
2. The rep analysis page opens for that agency, showing what's driving the decline.

**Review stock that needs reordering**
1. Under **Standing reviews**, click **Review understock** (or the **Inventory** tile).
2. Inventory opens filtered to understocked SKUs.

**Add a quick task**
1. Click the blue **+** button in the bottom-right corner.
2. Choose **New Task**, fill in the form and click **Create**.

## Good to know
- Sales numbers come from Fishbowl and are refreshed by the daily sync, so today's orders won't appear until tomorrow.
- "Sales YTD" compares the same window both years, so it's fair even early in the year.
- Lapsing and churned accounts deliberately do not appear in "Do today" — automated at-risk/churn emails and rep outreach already handle them.
- Moves under $500 of impact are left out as noise.
- The "overdue tasks" count only includes tasks whose Owner matches your first name.
`,
  },

  /* ─────────────────────────── Daily Sales Log ─────────────────────────── */
  {
    path: "/dashboard/daily-sales",
    title: "Daily Sales Log",
    section: "",
    summary:
      "Day-by-day sales, orders and average order value for one month, with a projection of where the month will land.",
    body: `
## What it's for
The Daily Sales Log shows every day of a month — orders, sales and average order value (AOV) — so you can see how the month is building and where it is on pace to finish. You reach it from the Dashboard: open **Full dashboard**, then click a month in the **Monthly Sales** table. Like the Dashboard, it follows the **brand toggle** in the top bar (All / NI / Sassy).

## What's on the page
- **Back to dashboard** link (top-left).
- **Month title** and a **month stepper** (left/right arrows) to move to the previous or next month. You can't step past the current month.
- A small note showing the date range covered, "from Fishbowl".
- **Daily log** table — one row per day with **Date**, **Orders**, **Sales** and **AOV**, and a **Month to date** total row pinned at the bottom.
- **Daily chart** — bars for each day, with a toggle for **Sales**, **Orders** or **AOV**. A dashed "run rate" line shows the month's average per day (or the average AOV). Hover a bar to see all three numbers for that day.
- **On pace for (month)** panel — projected **Sales**, **Orders** and **AOV** for the whole month at the current run rate, and how many days have elapsed.

## How to…
**Check how this month is tracking**
1. Open the page (it defaults to the current month).
2. Read the **On pace for** panel for the projected month-end total.
3. Compare individual days against the dashed run-rate line on the chart.

**Look at a past month**
1. Click the left arrow in the month stepper until you reach the month you want.
2. Past months show every day in full.

**Find the biggest day of the month**
1. On the chart, switch the toggle to **Sales**.
2. Hover the tallest bar to see its date and totals (or scan the **Sales** column in the table).

**Compare order count vs. order size**
1. Switch the chart toggle between **Orders** and **AOV** to see whether a strong day came from more orders or bigger ones.

## Good to know
- The current month runs from the 1st through **yesterday**. Today is never included, because the daily Fishbowl sync hasn't finished it yet.
- On the 1st of a month (or before the first sync) you'll see "No completed sales yet this month".
- Days with no sales still appear as zero rows so the chart and pace math are honest.
- The pace projection simply stretches the month-to-date run rate across the whole month; it doesn't account for seasonality.
- The page is read-only; nothing here can be edited or exported.
`,
  },

  /* ───────────────────────────── Reports ───────────────────────────── */
  {
    path: "/reports",
    title: "Reports",
    section: "",
    summary:
      "Custom dashboards — KPI tiles, charts, pivot tables and tables over the portal's data — built by asking Sage, kept live, and optionally emailed on a schedule.",
    body: `## What it's for
Your own reports on anything in the portal (sales, orders, customers, inventory, email, tasks…). Every time you open one it re-runs on today's data — "this month", "last 30 days" and the like always mean now, not when it was built. Reports are shared with the team, but each person only sees the numbers their role can see.

## The reports table
**Saved reports** lists every report with its owner, email schedule (and next send), when it last went out, and when it was last changed. **Search reports** filters it. Each row's buttons: **Open**, **Download Excel**, and — on reports you made (or any, for owners/admins) — **Rename**, **Change email schedule** (or **+ Add schedule**), **Pause / Resume emails**, and **Delete**.

## Report rules
The **Report rules** box on the Reports page lists what Sage follows when it builds, changes or recommends report widgets. **Team rules** are your own ("No pie charts", "Always show NI before Sassy") — type one and click **Add rule**, or just tell Sage "from now on…" and it saves it. Anyone can add; the author or an owner/admin removes. **Built-in rules** (click to expand) are the defaults, e.g. revenue counts only sales (not discounts or shipping), order totals only paid orders, saved reports use rolling dates, at most 4 KPI tiles each with a comparison, pies only for shares with 6 slices or fewer, tables as a top-N. Team rules win over the built-in ones. Rules guide Sage only — you can still change any widget by hand.

## Making a report
1. On **Reports**, describe it in **Build a report with Sage** (or click one of the example asks), e.g. "Monthly NI wholesale revenue by rep with a pivot by month, emailed to me the 1st at 7am". Sage builds it, opens it, and recommends what else to add.
2. Or open a **Start from a report** card to preview a starter report with live numbers, then **Save as my report**.

## On a report
- **Refresh** re-runs it; **Excel** downloads every widget as its own tab (KPIs on a Summary tab).
- **Email me a copy** sends you the report email now — a good test before scheduling.
- **Schedule email**: every day, weekdays, weekly or monthly at a time (Central, on the quarter hour), to any team members, with the Excel attached if you like. Untick "Sending is on" to pause; **Remove schedule** stops it.
- **Ask Sage to change it**: say "add a pivot of revenue by customer and month" or "make the trend a line chart" while you're on the report.
- **Sage recommends** → **Get recommendations**: Sage suggests 3–4 additions, each tested on live data; **Add** puts it on the report.
- Each widget's **⋯** menu: move up/down, half or full width, chart type (bar, stacked bar, line, area, pie), remove. Click the title to rename.

## Good to know
- Only the report's creator or an owner/admin can change, schedule or delete it.
- Scheduled emails only go to FMG team members and use the creator's access.
- Needs migration 20261031000000; until it's applied, starter reports preview but nothing saves.`,
  },

  /* ───────────────────────────── Task List ───────────────────────────── */
  {
    path: "/task-list",
    title: "Task List",
    section: "",
    summary:
      "The team's shared to-do list: create, assign, prioritize and complete tasks, one at a time or in bulk.",
    body: `
## What it's for
The Task List is the shared to-do list for the whole internal team. Every task has a name, status (To Do / In Progress / Done), priority, optional due date, owner, description and notes. It's available to owner, admin, user, sales, marketing and operations roles, and is the home page for operations staff.

## What's on the page
- **Search tasks…** box — filters by task name as you type.
- **Owner pills** — one per team member. Click a name to show only their tasks; click it again to clear.
- **Show completed / Hide completed** — Done tasks are hidden by default; this toggles them in.
- **New task** button (top-right).
- **Task table** with columns **Task**, **Status**, **Priority**, **Due Date** and **Owner**. Click a column header to sort by it; click again to reverse. Until you pick a column, tasks are sorted In Progress first, then To Do, then by priority (High first), then by due date.
- Each row shows a checkbox, the name (and description underneath), a **Status** dropdown you can change in place, a priority badge, the due date ("Today", "Tomorrow", "Yesterday" or a date), the owner's initial, and a trash icon on hover.
- Overdue tasks (due date passed and not Done) are tinted red with a warning icon.
- **Bulk action bar** — appears when one or more tasks are ticked.

## How to…
**Create a task**
1. Click **New task** (or **Create task** if the list is empty).
2. Enter a **Task Name** (required). Optionally set **Status**, **Owner**, **Priority** (defaults to Medium), **Due Date**, **Description** and **Notes**.
3. Click **Create**.

**Edit a task**
1. Click anywhere on the task's row.
2. Change any field in the **Edit Task** window.
3. Click **Update**. (Closing the window or clicking **Cancel** discards changes.)

**Mark a task done or in progress**
1. Use the **Status** dropdown on the row and pick **To Do**, **In Progress** or **Done**.
2. It saves immediately. Done tasks disappear from view unless **Show completed** is on.

**Update many tasks at once**
1. Tick the checkbox on each task you want. Hold **Shift** while clicking a checkbox to select every task between it and the last one you clicked. The checkbox in the header selects all visible tasks.
2. In the dark bulk bar, use **Status…**, **Priority…**, **Owner…** (including **No owner**) or the **Due** date picker. Each change applies right away to all selected tasks. **clear** removes the due date from all of them.
3. Click the **X** at the right of the bar to clear your selection.

**Delete tasks**
1. For one task: hover the row and click the trash icon, then **Delete task** to confirm.
2. For several: select them, click **Delete** in the bulk bar, then **Delete task** to confirm.

**See just your own tasks**
1. Click your name in the owner pills at the top.

## Good to know
- There is no Save button on the list itself — status changes and bulk edits save the moment you make them.
- Deleting a task is permanent and cannot be undone.
- Selections only apply to tasks you can currently see; if a filter hides a ticked task, it's left out of bulk actions.
- Owners are the named team members in the app. Accounts without a first name (for example subscribers) don't appear as owners.
- Orders from the storefronts, Faire or MarketTime never create tasks automatically.
- The "overdue tasks" link on the Dashboard counts tasks whose Owner matches your first name.
`,
  },

  /* ──────────────────────── Wholesale customers ──────────────────────── */
  {
    path: "/customers",
    title: "Wholesale",
    section: "Customers",
    summary:
      "Search, filter and export the wholesale customer list, and email or enroll selected customers in bulk.",
    body: `
## What it's for
This is the list of every wholesale (retail store) customer from Fishbowl, with their status, rep agency, last order and yearly sales. Use it to find an account, build a filtered list (for example "at-risk customers in Texas"), export it to a spreadsheet, or email a group. It's available to owner, admin, user and sales roles, and is the home page for sales staff.

The list follows the **brand toggle** in the top bar: choosing **NI** or **Sassy** shows only customers who have bought that brand.

## What's on the page
- **Search customer…** — matches customer name, customer ID, state, agency code or rep name.
- **Status** button — a multi-select of **Active**, **At Risk** and **Churned** with counts; leave everything unticked for **All**.
- **Filters** button — opens a second row of filters (the button shows how many are active):
  - **All channels** / **All agencies** dropdowns
  - **All states** (multi-select with search)
  - **Any spend** — lifetime spend buckets (Less than $1k, $1k–$5k, $5k–$25k, $25k–$100k, $100k+)
  - **Any last order** — Ordered in last 30/60/90 days, 6 or 12 months, or No order in over 12 months
  - **Any email status** — Email bounced, Unsubscribed / complained, New email on file, No email on file, Invalid / likely typo, Role address (info@, sales@…), Last campaign didn't send
  - **Has open order** — customers with a live estimate or an order still in progress in Fishbowl
  - **Repeat customers only** — more than one lifetime order
  - **Clear** — resets all of these filters
- **Export** (download icon) — choose columns, then **Download CSV**.
- **Customer table** — Customer (ID and name, with an email warning chip if relevant), Agency (and rep), Status, State, Last Order, Last $, and sales for 2026, 2025, 2024 and 2023. Click **Customer**, **Last Order**, **Last $** or a year header to sort. Default sort is most recent order first.
- **Previous / Next** — 25 customers per page.
- On a phone the table becomes cards.

**Status meanings:** Active = ordered within 180 days (or has an open order/estimate); At Risk = last order 181–365 days ago; Churned = over a year; No Orders = never ordered.

**Email chips** next to a name flag problems such as "Email bounced", "Unsubscribed", "Spam complaint", "New email on file", "No email", "Invalid email", "Likely typo", "Role address", "Duplicate address", "Send failed" or "Send skipped". Hover a chip for details.

## How to…
**Find a customer**
1. Type part of the name, customer ID, agency or rep in the search box.
2. Click the row to open the customer's detail page.

**Export customers to a spreadsheet**
1. Set the search, Status and filters you want.
2. Click the **Export** (download) button.
3. Tick or untick columns under **Pick columns** (name, ID, bill-to and ship-to address, channel, status, sales 2024–2026, last order date, email, phone).
4. Click **Download CSV (N)**. A file named customers_(date).csv downloads.

**Email a group of customers**
1. Tick the checkboxes next to the customers (the header checkbox selects the whole page).
2. To include everyone matching the filter, click **Select all N** in the floating bar.
3. Click **Send Email** and follow the steps in the Send Email window (see "Sending email" below).

**Enroll customers in a workflow**
1. Select customers, then click **Assign Workflow**.
2. Choose **At Risk — Win Back** or **Churned — Re-Engagement**.
3. Click **Enroll N Customers**. Customers already enrolled are skipped.

**Find customers whose email bounced**
1. Click **Filters** and set **Any email status** to **Email bounced**.

## Sending email
The **Send Email** window has two modes:
- **Write a message** — a plain-text email sent from **your own Outlook** (you must connect Outlook first in Settings → Email connection). Enter an optional **Cc**, a **Subject** and a **Message**; type "/" in the message to insert merge fields such as {{firstName}} or {{customerName}}. **Templates** loads a saved subject + body; **Save as template** saves the current draft. A preview shows how it reads for the first recipient. Up to 500 recipients per send.
- **Designed template** — pick a template built in Email → Templates. It is sent in the background from the brand's sending domain (not your Outlook). **Preview** shows the rendered email. Tick **Test run — send every copy to me instead** and enter your address to see each customer's version without emailing anyone. After sending, a progress bar shows sent/failed/skipped counts and a **Stop sending** button.

Click **Send N emails** to send. Each customer gets their own copy; recipients don't see each other.

## Good to know
- Sending email is real and immediate — there is no undo once sent. Use **Test run** for designed templates when in doubt.
- Unsubscribed and suppressed addresses are skipped automatically, as are customers with no email and duplicates.
- Designed-template sends keep running on the server even if you close the window.
- Your selection clears whenever you change page, search or filters. **Select all** is capped at 5,000 customers.
- The CSV export includes up to 5,000 customers and applies search, Status, channel, agency, state, spend and repeat filters plus the brand toggle — but **not** the Last order, Email status or Has open order filters.
- **Assign Workflow** uses the older Workflows feature, which only records the enrollment and is no longer a live sender. For real automated email journeys, use Automations.
`,
  },

  /* ─────────────────────── Wholesale customer detail ─────────────────────── */
  {
    path: "/customers/[id]",
    title: "Wholesale customer detail",
    section: "Customers",
    summary:
      "Everything about one wholesale account: contact and addresses, sales snapshot, full order history with line items, product mix, and email history.",
    body: `
## What it's for
Click any row on the Wholesale customer list to open this page. It pulls together the account's Fishbowl record, orders and sales, and every email sent to them, so you can prepare for a call or check what they buy.

## What's on the page
- **Back to wholesale customers** link, and **previous / next** arrows (top-right) that step to the neighbouring customer alphabetically by name.
- **Header** — customer name, status badge (Active / At Risk / Churned), customer ID, **Channel**, **TTM Trend** (last 12 months vs. the 12 before, as a % up or down) and **Lifetime Revenue**.
- **Banner for lapsing accounts** — At Risk customers show "This customer hasn't ordered in 6+ months"; Churned customers show "This customer hasn't ordered in over a year". Each has **Send Email** (opens your computer's email app) and **Call** (phone link) buttons when contact info exists.
- **Tabs:**
  - **Details** — Contact Information (name, email, phone, and territory Agency / Code / Sales Rep Name from Fishbowl), Account (Channel, Customer Since, Bill To and Ship To addresses), and a Sales Snapshot (Lifetime Revenue, Orders, Avg Order, Last Order, Days Since) with an **Order Activity (Last 24 Months)** chart.
  - **Orders** (badge = lifetime order count) — every order with **Order**, **Placed**, **Completed**, **Channel**, **Items**, **Total** and **Status** (Estimate, Open, Completed, Cancelled). Sortable by most columns, 25 per page with **Prev / Next**.
  - **Sales Analysis** — two tables, **Sales by Fragrance** and **Sales by Product**, with dollars per year, a total, and each item's share of that year.
  - **Emails** — **Campaigns** (default) and **1:1 threads**.

## How to…
**See what's in a past order**
1. Open the **Orders** tab.
2. Click an order row to expand it and see SKU, description, quantity and line total, plus the ship-to city/state.
3. Click **Download** inside the expanded order to save that order's lines as a CSV.

**Export order history**
1. On the **Orders** tab, click **Download this page**.
2. A CSV (all-orders.csv) downloads with every line item for the orders on the current page (up to 25 orders). Page through and download again for older orders.

**Check what campaign emails they've received**
1. Open the **Emails** tab (it opens on **Campaigns**).
2. The top row shows **Sent**, **Opened**, **Clicked**, orders placed within the attribution window, and **Median to order**.
3. The table lists each send as **Blast** or **Automation · step N**, with open/click counts and "Ordered Nd later" when an order followed. A note appears if the address is unsubscribed, bounced or marked as spam.

**Read or reply to your own email conversation with them**
1. On the **Emails** tab, click **1:1 threads**.
2. Click a thread to open it and reply. Only threads in **your** connected mailbox appear; if Outlook isn't connected you'll see a link to Settings → Email connection.

**Reach out to a lapsing account**
1. Use the **Send Email** or **Call** button in the At Risk / Churned banner, or the email/phone links on the **Details** tab.

## Good to know
- This page is read-only — contact details, addresses and territory come from Fishbowl and must be changed there. (Rep and account-number assignment for storefront accounts lives under Storefronts → Accounts.)
- The **Send Email** banner button opens your own email program; it doesn't send through the portal. To send a tracked portal email, select the customer on the list page and use **Send Email** there.
- The header status uses the last completed order only, so a customer with an open estimate can show At Risk here while the list shows Active.
- Previous/next arrows ignore whatever filters you had on the list.
`,
  },

  /* ─────────────────────────── D2C customers ─────────────────────────── */
  {
    path: "/customers/d2c",
    title: "D2C",
    section: "Customers",
    summary:
      "Search, filter and export direct-to-consumer (online shopper) customers, and email selected shoppers in bulk.",
    body: `
## What it's for
This is the list of individual shoppers who bought directly from the brand websites. Use it to look someone up, build a list (for example "repeat buyers who spent $100+"), export it, or email a group. It's available to owner, admin, user and sales roles.

## What's on the page
It works like the Wholesale list, with a few differences:
- **Search name or email…** — matches shopper name, email or state.
- **Status** — multi-select of **Active**, **At Risk** and **Churned** with counts (none ticked = **All**).
- **Filters** — **All states**, **Any spend** (Less than $50, $50–$100, $100–$250, $250–$1,000, $1,000+), **Any last order**, **Any email status** (same options as wholesale), **Repeat customers only**, and **Clear**. There are no channel, agency or "Has open order" filters for D2C.
- **Export** (download icon) — pick columns (Name, Email, State, Status, Orders, Revenue, Sales 2024–2026, Last Order Date) then **Download CSV**.
- **Table** — Customer (name and email, with an email warning chip if relevant), Status, State, Last Order, Orders, 2026, 2025, 2024, 2023, and lifetime Revenue. Sort by **Customer**, **Last Order** or a year column.
- **Previous / Next** — 25 shoppers per page.

**Status meanings:** Active = ordered within 180 days; At Risk = 181–365 days; Churned = over a year.

## How to…
**Find a shopper**
1. Type their name or email in the search box.
2. Click the row to open their detail page.

**Export a list of shoppers**
1. Set your search, Status and filters.
2. Click **Export**, choose columns under **Pick columns**, and click **Download CSV (N)**.
3. A file named d2c_customers_(date).csv downloads.

**Email a group of shoppers**
1. Tick the shoppers (or tick a few, then **Select all N** in the floating bar to include everyone matching the filter).
2. Click **Send Email**.
3. Choose **Write a message** (plain text from your connected Outlook) or **Designed template** (a template from Email → Templates, sent in the background from the brand's domain). For designed templates, use **Test run — send every copy to me instead** to check first.
4. Click **Send N emails**.

**Find your best repeat buyers**
1. Click **Filters**, turn on **Repeat customers only** and choose a spend bucket such as **$250 – $1,000**.
2. Sort by **2026** (or another year) to rank them.

## Good to know
- Unlike Wholesale, this list is **not** filtered by the NI / Sassy brand toggle; it always shows all D2C shoppers.
- Sending is immediate and can't be undone. Unsubscribed, bounced, no-email and duplicate addresses are skipped automatically.
- Plain-text sends are limited to 500 recipients; designed-template sends have no cap and keep running if you close the window.
- The CSV export includes up to 10,000 shoppers and applies search, Status, state, spend and repeat filters — but **not** the Last order or Email status filters.
- **Assign Workflow** also appears in the selection bar; it records an enrollment in the older Workflows feature, which no longer sends email. Use Automations for real email journeys.
- Your selection clears when you change page, search or filters.
`,
  },

  /* ────────────────────────── D2C customer detail ────────────────────────── */
  {
    path: "/customers/d2c/[id]",
    title: "D2C customer detail",
    section: "Customers",
    summary:
      "One online shopper's profile: contact info, lifetime value, orders with line items, product mix, and the emails they've received.",
    body: `
## What it's for
Click a shopper on the D2C list to open this page. Use it to answer a customer-service question ("what did I order?"), check a shopper's value, or see how they responded to emails.

## What's on the page
- **Back to D2C customers** link, plus **previous / next** arrows that step to the neighbouring shopper alphabetically.
- **Header** — name, status badge (Active / At Risk / Churned), their ID, **Channel**, **TTM Trend** (last 12 months vs. the prior 12) and **Lifetime Revenue**.
- **At Risk / Churned banner** with **Send Email** (opens your email app) and **Call** buttons when contact info is on file.
- **Tabs:**
  - **Details** — contact info (email and phone are clickable), Channel, Customer Since, Bill To / Ship To addresses, a Sales Snapshot (Lifetime Revenue, Orders, Avg Order, Last Order, Days Since) and a 24-month order activity chart.
  - **Orders** — every order with Order, Placed, Completed, Channel, Items, Total and Status; sortable, 25 per page.
  - **Sales Analysis** — **Sales by Fragrance** and **Sales by Product** by year.
  - **Emails** — **Campaigns** (blasts and automation emails with opens, clicks and any order that followed) and **1:1 threads** (your own Outlook conversations with this shopper).

## How to…
**Look up what a shopper ordered**
1. Open the **Orders** tab.
2. Click the order to expand its line items (SKU, description, quantity, line total).
3. Click **Download** in the expanded order for a CSV of that order.

**Download their order history**
1. On **Orders**, click **Download this page** to save every line item for the orders shown (up to 25 per page).

**See which emails they opened or clicked**
1. Open **Emails** → **Campaigns**.
2. Check the open/click columns and the summary row at the top. A note appears if they unsubscribed, bounced or marked mail as spam — further campaign mail to them is skipped.

**Reply to a shopper's email**
1. Open **Emails** → **1:1 threads**, click the conversation and reply. Requires your Outlook to be connected in Settings.

## Good to know
- The page is read-only; nothing about the shopper's record can be edited here.
- The banner **Send Email** button opens your own email program rather than sending through the portal. For a tracked send, select the shopper on the D2C list and use **Send Email**.
- **1:1 threads** only shows conversations in your own mailbox, not teammates'.
- Previous/next arrows go alphabetically through all D2C shoppers, not your filtered list.
`,
  },

  /* ───────────────────────────── Settings ───────────────────────────── */
  {
    path: "/settings",
    title: "Settings",
    section: "",
    summary:
      "Your profile, email signature and Outlook connection — plus, for owners and admins, team access, the automated-email sender, shared platform logins and brand settings.",
    body: `
## What it's for
Settings is where you manage your own account and, if you're an owner or admin, company-wide settings. Open it from your avatar in the top-right corner → **Settings**. Every signed-in user can reach it.

## What's on the page
A left-hand menu (a row of pills on phones) with two groups:

**Personal** (everyone)
- **Profile** — **Display name** (your first name), your **Email** (read-only) and your **Role** (read-only).
- **Email signature** — plain text appended to emails you send from the portal. Line breaks are kept.
- **Email connection** — connect **Microsoft Outlook** so the portal can send customer email from your own mailbox. Shows **Connected**, **Not connected** or **Needs reconnect**, with **Connect Outlook**, **Reconnect** and **Disconnect** buttons.

**Company** (owner and admin only)
- **Team** — the list of team members with their roles, a count per role, **Invite Member**, a role badge you can click to change someone's role, and a trash icon to remove someone.
- **Automated email** — choose which connected mailbox sends mail that has no person behind it (automations without an owner, the Fishbowl digest, storefront order notifications).
- **Platforms & logins** — shared logins and links for tools the team uses. **Add Platform**; each card has open-site, copy, show/hide password, edit and delete controls.
- **Brand settings** — for **NI** and **Sassy**: **Display name**, **Primary color** (color picker or hex code) and **Sender name**.

## How to…
**Connect your Outlook so you can email customers**
1. Go to **Settings → Email connection**.
2. Click **Connect Outlook** and sign in with Microsoft in the window that opens.
3. You return to Settings with "Outlook connected." and a green **Connected** pill.

**Fix "Needs reconnect"**
1. Go to **Email connection** and click **Reconnect**, then sign in again.

**Set your email signature**
1. Go to **Email signature**, type your signature and click **Save changes**.

**Change your display name**
1. Go to **Profile**, edit **Display name** and click **Save changes**.

**Change a teammate's role** (owner/admin)
1. Go to **Team** and click the person's role badge.
2. Pick the new role from the dropdown — it saves immediately.

**Add a team member** (owner/admin)
1. Go to **Team** → **Invite Member**.
2. Enter **Name**, **Email** and pick a **Role** (User, Admin, Sales, Marketing, Operations or Investor).
3. Click **Add Member**.

**Choose the automated-email sender** (owner/admin)
1. Go to **Automated email** and click the mailbox to use; it's marked **in use**. **Clear selection** returns to the automatic fallback.

## Good to know
- Profile, signature and brand settings only save when you click **Save changes** (the button is greyed out until something changes). Role changes and the automated-email sender save the moment you click.
- Only Outlook is supported. The portal sends on your behalf; it doesn't read your mailbox. Disconnecting stops you sending portal emails until you reconnect; emails already sent stay on customer records and your Outlook is untouched.
- **Invite Member** only adds the person to the team list — it doesn't send an invitation email or create their login. Ask Blake to set up their sign-in.
- Removing a team member takes away their access to the app. You can't edit or remove yourself or the Owner.
- Role meanings: **Owner** full access; **Admin** manage team and most settings; **User** standard access to everything; **Sales** customers, sales analysis and tasks; **Marketing** marketing tools and content; **Operations** task list, catalog, storefronts and marketing (no sales or financials); **Investor** read-only reports.
- If no automated-email sender is chosen, the oldest connected mailbox is used, and that can change as people connect or disconnect.
- Deleting a saved platform login is permanent.
`,
  },
];
