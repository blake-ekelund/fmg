import type { GuideEntry } from "../types";

/**
 * User guide — Email section: Email Templates, Automations, Campaign Results,
 * Deliverability, plus the "Send Email" flow on the customer lists.
 * Written from the actual UI code; keep in sync when those pages change.
 */
export const emailGuide: GuideEntry[] = [
  /* ─────────────────────────── Email Templates ─────────────────────────── */
  {
    path: "/templates",
    title: "Email Templates",
    section: "Email",
    summary:
      "The one library of email templates: create them (wizard, AI, or HTML import), design them in the block editor, test them, and have AI grade them.",
    body: `## What it's for
Every marketing or sales email starts here. A template is a reusable email (subject, preview text, design) that you can later send to selected customers from the Customers pages or use as a step in an Automation. Visible to owner, admin, sales and marketing.

## What's on the page
**Library view** (when you first open the page):
- **Grade emails** button — has AI score every template (see below).
- **New template** button — opens the creation wizard.
- A table of templates with columns **Template** (name + subject), **Type** (Designed, HTML or Text), **Audience** (NI / Sassy and Wholesale / D2C tags), **Grade** (letter + score, if graded), **Sends** (how many recipients it has gone to; hover for number of sends), and **Updated**.
- Hover a row to see **Duplicate** (copy icon) and **Delete** (trash icon). Click anywhere else on the row to open the template.

**Editor view** (after opening or creating a template):
- Top bar: back arrow (returns to the library), the template name (click to rename), and buttons **Preview / Edit**, **Settings**, **Test across clients**, **Send test**, plus a save-status label.
- Left panel: the block palette, grouped as **Beginning** (Header, Hero Banner), **Middle** (Text, Image, Image + Caption, Columns, Product Card, Promotion, Button, plus **Section layouts**: Image + Text, Text + Image, Two Columns, Three Columns, Full-width Band), **End** (Social Links, Footer / Unsubscribe) and **Spacing** (Divider, Spacer).
- Center: the canvas — this is the real email exactly as it will be sent.
- Right panel: **Properties** for whichever block you click (text, colors, image, links, padding, etc.).

## How to…

### Create a new template
1. Click **New template**.
2. The wizard asks, one step at a time: **Brand** (Natural Inspirations, Sassy, or Both brands), **Audience** (Wholesale, Direct to consumer, or Both audiences), **Purpose** (pick one or more: Newsletter, Win-back / Recapture, Promotion / Sale, Product launch, Welcome / Onboarding, Announcement, Other), **Title**, and an optional **Description** (a note for the team). Click **Continue** between steps.
3. On the last step choose how to start:
   - **Generate with AI** — type a description of the email (e.g. the hero, products, offer and call-to-action you want) and click **Generate**. AI builds it from our own blocks and layouts in the chosen brand's voice, then it opens in the editor for you to tweak.
   - **Blank template** — an empty builder. Click **Create**.
   - **Plain-text email** — starts with a single text block. Click **Create**.
   - **Upload HTML** — click **Choose file** and pick an .html file; it is converted into editable blocks.
4. The template opens in the editor and is saved immediately — you don't need to press save.

### Build the email in the block editor
1. Click a block in the left palette to add it to the bottom of the email, or drag it onto an exact spot on the canvas.
2. Click a block on the canvas to edit it in the **Properties** panel on the right. Use the canvas controls to move a block up/down, drag to reorder, or delete it.
3. Section layouts are multi-column containers; you can add blocks into a column from the section's properties or by dragging.
4. **Promotion** can't be dragged — clicking it opens a picker so you choose a real promotion first.
5. Always finish with a **Footer / Unsubscribe** block. The Footer button glows amber until the email has one ("Every email needs a footer with an unsubscribe link").
6. Click **Preview** to hide the side panels and see an inbox preview (sender name, subject, preview text); click **Edit** to go back.

### Set subject line, preview text and sender
Click **Settings** in the top bar. The **Template settings** window has **Subject line**, **Preview text**, **From name**, **Brand** (Both / NI / Sassy), **Audience** (Both / Wholesale / D2C), **Purpose** chips and **Description**. Click **Done** — changes autosave.

### Insert merge fields (personalisation)
Merge fields are placeholders in double curly braces, such as {{firstName}}, that are replaced with each recipient's own data when the email is sent.
- In a rich-text block, click the **Insert merge field** button (curly-braces icon) in the text toolbar and pick a field.
- In plain-text bodies (and the HTML editor's message boxes), type "/" to open the merge-field menu, then arrow keys + Enter.
- Available fields: **Customer** — {{firstName}}, {{lastName}} (D2C shoppers only), {{customerName}} (company name for wholesale, full name for D2C), {{city}}, {{state}}, {{channel}}, {{lifetimeRevenue}}, {{lifetimeOrders}}, {{lastOrderDate}}, {{daysSinceLastOrder}}; **Sender** — {{senderName}}, {{senderFirstName}}, {{senderEmail}}; **Date** — {{currentYear}}, {{currentQuarter}}.
- The picker only shows fields that will fill in for the template's audience (e.g. wholesale templates don't offer first/last name, because wholesale contacts are companies).
- {{unsubscribeUrl}} is handled automatically on bulk sends; you don't place it by hand.
- {{discountCode:BATCH}} (with a unique-code batch name from Storefront Discounts) gives every recipient their own single-use code. Previews and tests show a sample code instead of using up real ones.
- Field names are case-sensitive. Uploaded HTML templates are checked: a misspelled field shows under **Merge field check** and the template won't save until it's fixed (status reads "Waiting on merge fields").

### Send yourself a test email
1. In the editor, click **Send test**.
2. **Send to** is pre-filled with your own address; change it if needed.
3. Optional: search a customer by name so the merge fields fill in with that customer's real data. The email still goes only to the address you typed — the customer gets nothing. Without a customer, sample values (Alex, Acme Goods Co.) are used.
4. Click **Send test**. The template is saved first, then the test goes out. You'll see a confirmation; check your inbox.

### Check how it looks in different email apps ("Test across clients")
1. Click **Test across clients**.
2. Pick a client tab (Apple Mail, Gmail, Outlook.com, Zoho Mail, Outlook (Windows) — the Outlook Windows view is marked "approx").
3. Use the toggles **Light/Dark**, **Images off** and **Mobile** to see those conditions.
4. The **Compatibility** panel on the right lists known problems for that client; the badge on each tab counts errors and warnings. The previews are approximations — the checks are the reliable signal.

### Grade emails with AI
1. On the library view click **Grade emails**. It scores every template (can take a minute; up to 60 per run — run again for the rest).
2. Each template gets a letter grade + score in the **Grade** column, across content, design, subject line, deliverability, accessibility and brand.
3. Click a grade badge to see the breakdown: each area's score, issues, strengths and a "Suggested" fix.
4. Where an issue offers **Fix this**, click it to have AI apply that change to the template. Fixes run one at a time per template ("Queued", "Fixing…", then "✓ Fixed"); they keep running if you close the window, and the row shows an "AI fixing" chip meanwhile.
5. A **stale** tag means the template was edited after grading — run **Grade emails** again to refresh.
6. **Open template** in the breakdown jumps into the editor.

### Duplicate or delete a template
Hover the row in the library and click the copy icon (**Duplicate**) or trash icon (**Delete**). Delete asks to confirm and is permanent. If the template is used by an automation, you'll be warned which ones; **Delete anyway** removes the email from those automation steps, and they'll need a new email before running.

### Send a template to customers (a blast)
Blasts are not sent from this page. Go to **Customers → Wholesale** or **Customers → D2C**, select customers, click **Send Email** and choose **Designed template**. See the "Send an email to customers" guide entry.

## Good to know
- **Autosave**: everything in the editor saves automatically about 1.5 seconds after you stop changing things. While you're typing in a field it waits and saves when you leave the field ("Saves when you leave the field"). The label shows "Saving…", "All changes saved", or "Not saved — retrying" if the connection blips (it keeps retrying). There is no Save button. Leaving the page with unsaved changes asks first.
- Older templates may be **Custom HTML** (an uploaded file kept as raw HTML) or **Text**. Custom HTML templates open in a code/preview editor with **Preview** / **Code** toggles and a sidebar for subject, preview text, from name, brand, channel, images, merge fields and an unsubscribe link snippet. New uploads made through the wizard are converted into blocks instead.
- From an automation's email step, **Edit this email** opens the template here directly.
- Sending a test or a client preview never emails customers.`,
  },

  /* ───────────────────────────── Automations ───────────────────────────── */
  {
    path: "/automations",
    title: "Automations",
    section: "Email",
    summary:
      "Build triggered email sequences (journeys): who gets them, what starts and stops them, which emails go out and when — plus the account-wide sending limits.",
    body: `## What it's for
An automation sends a series of saved email templates to customers automatically when something happens — e.g. a wholesale account becomes At Risk, or 7 days after a D2C shopper's first order. The automation runner checks twice a day, at 7:45am and 3:45pm Eastern. Visible to owner, admin and marketing.

## What's on the page
- **Sending limits** button (gauge icon, shows e.g. "Max 3/week · 2d apart") and **New automation** button at the top right.
- A search box (once there are more than 3 automations).
- One card per automation showing its name, **Live** or **Paused**, **Priority N** (a journey) or **One-off**, a plain-English summary (audience → trigger · number of emails), a "No emails" warning if it's live with no steps, and stats **In flow**, **Completed**, **Steps**. Click a card to expand it into the editor; click again to collapse.

**Inside an expanded automation:**
- Header: the name (click to rename), status (**Live**, **Off**, or **Test batch**), **Journey · Priority N** or **One-off**, a "Saved" flash after each change, totals **Enrolled / Sent / Orders / Revenue**, and buttons **Send test**, **Run now** (only when on), **Turn on / Turn off**, and a trash icon to delete.
- Three setup cards: **Who**, **Starts**, **Stops when**. Click one to open its settings below.
- **Journey**: the emails laid out left to right — a "Starts" card, then each **Email N** with its **Day**, subject, offer tag, and sent / open / click rates, joined by the wait between them, and an **Add email** button at the end.
- The selected email's inspector: **Email** picker, **When it sends**, subject / preview text / offer, **Results** (Sent, Opened, Clicked, Orders, Revenue) and a live **Preview** with **Desktop** / **Phone** toggles.
- **Batches** table (only when weekly batches have been released) with a **Compare batches** link to Campaign Results.

## How to…

### Create an automation
1. Click **New automation**. A new card appears expanded, named "New automation", starting as wholesale customers who become At Risk. It is off.
2. Click the name to rename it; press Enter.
3. Set **Who**, **Starts** and **Stops when** (below), then add emails.
4. Click **Turn on** when ready.

### Choose who gets it (Who)
1. Click the **Who** card.
2. **Audience**: D2C, Wholesale, or Both.
3. **D2C buyers of**: Any brand, Sassy, or NI (not shown for wholesale-only).
4. **Narrow it down**: minimum lifetime spend ($50+ … $100,000+), states (multi-select, searchable), and — for wholesale — wholesale channels (GIFT, SALON/SPA, PHARMACY, etc.).
5. **Who qualifies now** → click **Check eligible customers** to see how many would enroll, a sample list, any bad or flagged email addresses, and how many are "waiting on a higher-priority flow".

### Choose what starts it (Starts)
1. Click the **Starts** card and pick a **Trigger**:
   - **Status change** — when a customer becomes At Risk (180 days inactive) or Churned (365 days inactive).
   - **Order event** — a set time (1 day … 3 months, or Custom…) after a customer's first order or most recent order.
   - **Date** — on a chosen date, repeating Never (one-time), Every week, Every month, Every 3 months or Every year.
   - **Manual** — no automatic enrollment ("Customers are added by hand").
2. For Status change, **Release** can be **As they qualify** or **Weekly batches** (pick the weekday, a batch size cap, and a batch name + starting number; the next batch name is shown).
3. **Overlap**: see "Priority and overlap" below.
4. **Test batch**: see "Test safely" below.

### Choose what stops it (Stops when)
Tick any of: **They place an order** (for order-event triggers, also **…and restart them at email 1**), **They click a link**, **They reply** (only available when inbound mail is syncing; otherwise greyed out with the reason), **They're active again** (ordered in the last 180 days), and **No clicks after** 2 weeks / 1 month / 2 months / 3 months. These are checked before every send. Anyone who unsubscribes is always removed.

### Add emails and set the timing
1. Click **Add email** (in the journey strip, or the empty-state button). The new step is selected.
2. In the inspector, choose a template in **Email**. You can pick **Add later** to leave it blank for now — but the automation can't be turned on while any step has no email ("Pick an email" warning).
3. **When it sends** has two modes:
   - **Wait** — a delay after the previous email (for email 1, after enrolling): Same day, 1 day later, 3 days later, 1 week later, 2 weeks later, 1 month later, or **Custom…** (enter days or weeks).
   - **On date** — pin this email to an exact calendar date (defaults to a week out; change it with the date picker). Switching back to **Wait** removes the pinned date.
4. Use the arrows (**Move earlier** / **Move later**) to reorder and the trash icon (**Remove this email**) to delete a step (asks to confirm).
5. **Edit this email** opens the template in Email Templates in a new tab.
6. Every change saves automatically — there's no Save button (look for the "Saved" flash).

### Turn it on (and off)
- Click **Turn on**. It's blocked (with the reason shown) until there's at least one email and every step has an email chosen.
- Once on, it enrolls eligible customers at the next scheduled run (hover the **Live** badge to see "Next run in …").
- **Run now** (with a confirmation) enrolls eligible customers and sends the first step immediately instead of waiting. The confirmation says whether it's going to REAL customers or to the test address. This sends real email — it can't be undone.
- **Turn off** is always allowed and stops further sends.

### Test safely
- **Send test** (header): enter an address, optionally choose a real customer's data for the merge fields (click **Use a real customer's data** to load the list), then click **Send all N emails**. Every email in the sequence goes to that address right now, ignoring the waits. The customer is never emailed and nothing is recorded against the automation.
- **Test batch** (under Starts): tick "Run on real customers and the real schedule, but deliver every email to a tester", and set the test address. The status shows **Test batch** and a yellow banner reminds you where mail is going. **Clear test enrollments** deletes only the test enrollments so you can rehearse again (live data is untouched).

### Priority and overlap
Under **Starts → Overlap**:
- **Journey: one at a time** — a customer is in only one journey at a time. Pick a **Priority** (1 = highest). A higher-priority journey pauses this one until it's done; an equal or lower one waits.
- **One-off: can overlap** — sends even if the customer is mid-journey elsewhere. The sending limits still apply.

### Set sending limits (frequency cap)
1. Click the **Sending limits** button at the top of the page.
2. Set **Emails per 7 days** (0–50) and **Days between emails** (0–30). 0 turns that rule off. The default is 3 per week, 2 days apart.
3. Click **Save**.
This is account-wide: however many flows a customer is in, they get no more than this. Bulk blasts count toward it too. An email over the limit waits for the next open slot — it's never dropped. Test sends are never limited.

### Delete an automation
Click the trash icon in the header and confirm. This removes its enrollments and history too and can't be undone.

## Good to know
- Merge fields in the templates fill in per customer (see Email Templates).
- Per-email results (sent, opens, clicks, orders, revenue) appear on each journey card and in the inspector; open rates are noisy, clicks are more reliable.
- If an automation shows "unrecognized trigger", pick a trigger under **Starts** — otherwise it never enrolls anyone.
- Deleting a template used by an automation removes it from that step; the step then needs a new email.`,
  },

  /* ─────────────────────────── Campaign Results ────────────────────────── */
  {
    path: "/automations/cohorts",
    title: "Campaign Results",
    section: "Email",
    summary:
      "One table of every campaign blast and automation batch with open, click, win-back, no-action and unsubscribe results.",
    body: `## What it's for
See how your sends performed. It combines one-off **Campaign** blasts (designed templates sent from the customer lists) and **Automation** batches into one list, newest first. Each customer counts once, in their most-committed outcome. Visible to owner, admin and marketing.

## What's on the page
- A **← Automations** link back.
- **Show N test sends** checkbox (test sends are hidden by default because their mail went to a tester).
- A filter dropdown: **All results**, **Campaign blasts**, **All automation batches**, or a single automation.
- Four headline tiles for what's shown: **Open rate**, **Click rate**, **Win-backs** (automation batches only — customers who ordered since), and **No action**.
- A table with **Send** (Campaign/Automation tag, name, subject or automation name, "Test" tag), **Date**, **Reached**, **Opened**, **Clicked**, **Won back**, **No action**, **Unsub** and a **Mix** bar (won back → clicked → no action → unsubscribed). On phones it shows as cards.

## How to…
### Compare automation batches
Choose **All automation batches** or a specific automation in the dropdown. (An automation's **Compare batches** link also brings you here.)

### See just your blasts
Choose **Campaign blasts**. For campaigns, hover **Reached** to see delivered / skipped / failed counts; skipped + failed show as "(+N)".

### Include test sends
Tick **Show N test sends**. Test rows are highlighted and tagged "Test".

## Good to know
- Read-only — nothing here sends or changes anything.
- Open rate is noisy (Gmail and Apple Mail prefetch tracking pixels; some gateways block them). Clicks come from real link redirects and are the better measure.
- Win-backs are tracked only for automation batches; campaigns show "—".
- Replies aren't tracked: customers reply straight to the rep's mailbox.
- If you see "Showing the most recent enrollments only", older batches may be incomplete.`,
  },

  /* ──────────────────────────── Deliverability ─────────────────────────── */
  {
    path: "/email/deliverability",
    title: "Deliverability",
    section: "Email",
    summary:
      "Everyone the system will no longer email — unsubscribes, bounces and spam complaints — with reasons and trends.",
    body: `## What it's for
Shows the suppression list: people who unsubscribed, whose address bounced, or who marked us as spam. The system automatically skips these addresses on every bulk send and automation. Bounces and complaints come in automatically from our sending service. Visible to owner, admin and marketing.

## What's on the page
- Tiles: **Total Suppressed**, **Unsubscribed**, **Bounced**, **Spam Complaints**.
- **Last 30 Days** chart: daily new suppressions stacked by Unsubscribed / Bounced / Complained.
- **Why People Unsubscribe**: the reasons people gave when unsubscribing, with counts, and how many gave none.
- A table of suppressed people: **Customer** (name + WS/D2C tag, or "Unknown"), **Email**, **Status** (Unsubscribed, Bounced, Complained or Manual), **Reason / Detail**, **When**.
- Filter buttons **All**, **Bounced**, **Unsubscribed**, **Complained** and a search box (name, email or reason).

## How to…
### Find out why a customer isn't getting our emails
Type their name or email in the search box. If they appear, the **Status** tells you why (unsubscribed, bounced, or complained).

### Fix a bounced customer
1. Click **Bounced**. These addresses hard-bounced — the mailbox no longer exists.
2. Update the email address on the customer record in Fishbowl. Suppression matches by address, not by customer, so once the record has a new address they'll be emailed normally again.
3. A **New email on file** tag means that's already been done — emails to the new address send normally.

## Good to know
- This page is read-only; there is no button to un-suppress someone.
- Customers pages also have an email-status filter (Email bounced, New email on file, No email on file, etc.) to find these accounts from the customer side.`,
  },

  /* ──────────────────── Send Email from the Customers pages ─────────────── */
  {
    path: "/customers#email",
    title: "Send an email to customers",
    section: "Customers",
    summary:
      "Select customers on the Wholesale or D2C list and click Send Email to send a personal plain-text email or a designed-template blast.",
    body: `## What it's for
Emailing a chosen set of customers — either a quick personal note from your own Outlook, or a designed template (a blast) sent from the brand's domain. Available on **Customers → Wholesale** (/customers) and **Customers → D2C** (/customers/d2c).

## How to open it
1. On a customer list, tick the customers you want (use the filters, then **Select all N** to take everyone matching the filter).
2. In the selection bar click **Send Email**. The **Send Email** window shows how many recipients you selected.

## What's in the window
A toggle at the top: **Write a message** or **Designed template**.
- **Cc** (optional, comma-separated; copied on every recipient's email) and **Subject** appear in both modes.
- A **Preview · [first customer]** box shows the subject/message filled in for the first selected customer.

## How to…
### Send a personal plain-text email (Write a message)
1. Your Outlook must be connected — if not, a yellow note links to **Connect it** in Settings.
2. Optionally click **Templates** to load a saved subject + body.
3. Type the **Subject** and **Message**. Type "/" to insert merge fields like {{firstName}} or {{customerName}} (the hint below lists the fields for this audience).
4. Optionally **Save as template** (name it, then **Save**) to reuse it later.
5. Click **Send N emails**. Each customer gets their own email from your mailbox — recipients don't see each other. The result shows "Sent X of Y" (failures include customers with no email on file).

### Send a designed template (blast)
1. Click **Designed template**.
2. Pick a template from the list (built on Email Templates). Its subject fills in unless you already typed one.
3. Click **Preview** to see it with sample merge values.
4. Strongly recommended first: tick **Test run — send every copy to me instead** and enter your address. Each selected customer's email is rendered with their real data, but all copies come to you; customers get nothing. Click **Send N test copies to me**.
5. Untick Test run and click **Send N emails** to send for real. This cannot be undone once sending starts.
6. A progress panel shows queued / sending / done counts, failures, and anyone skipped up front (no email, unsubscribed, duplicate). Sending runs on the server — closing the window won't stop it. Click **Stop sending** to cancel the rest.

## Good to know
- Designed-template blasts go out from the brand's sending domain (not your Outlook) and don't need Outlook connected.
- Unsubscribed and bounced addresses are skipped automatically; the unsubscribe link is added for you.
- Blasts count toward the account's sending limits (see Automations → Sending limits).
- Results for blasts appear on **Campaign Results**.
- The **Templates** list inside "Write a message" is a separate set of quick saved text replies; designed templates come from the Email Templates page.`,
  },
];
