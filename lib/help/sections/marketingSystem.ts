import type { GuideEntry } from "../types";

/**
 * User guide — Marketing section (Social Media, Blog Posts, Website, Image
 * Library, Photography) and the owner/admin System pages (System Handbook,
 * Order Check, Point B Fields, Technical Roadmap, Integrations).
 * Written from the actual UI code; keep in sync when those pages change.
 */
export const marketingSystemGuide: GuideEntry[] = [
  /* ─────────────────────────── Social Media ─────────────────────────── */
  {
    path: "/marketing/social",
    title: "Social Media",
    section: "Marketing",
    summary:
      "Write Instagram and Facebook posts once and send them to the brand's accounts right away or at a scheduled time, plan whole 3x grids, and preview the Instagram profile.",
    body: `## What it's for
This is where every Instagram and Facebook post for Natural Inspirations and Sassy is made and scheduled. A post is written once and goes to the brand's Instagram account and/or Facebook Page. Scheduled posts go out by themselves within about five minutes of their time. Visible to owner, admin, user, marketing and operations.

The brand switch in the top bar filters the list (All, NI, or Sassy).

## What's on the page
- Header buttons: **Preview grid**, **Plan a grid**, and **New post**.
- **Connected accounts** strip: one card per account (Instagram and Facebook for each brand) with the profile picture, handle and follower count. A connected account shows a check badge and the strip says how many accounts are "ready to post". Cards marked **Not connected yet** (dashed) or in amber (broken, with the reason) cannot post. If Meta isn't connected at all, a warning says nothing will post.
- Tabs, each with a count: **Scheduled**, **Drafts**, **Published**, **Needs attention** (failed posts, or posts that went out on only one platform).
- The post list: a thumbnail, the post name (or the start of the caption), brand pill, status pill, a grid badge if the post belongs to a planned grid set, each platform with a green check (posted) or red warning (failed), an external-link icon to open the live post, and the date/time. Failed posts show the error under the name. Click a row to open the post in the editor.
- A checkbox on every row plus **Select all**. Shift-click a checkbox to select a range.

## How to…

### Make a new post
1. Click **New post**. The wizard walks through **Brand**, **Where** (Instagram and/or Facebook), and **Format**: **Designed carousel** (2–10 branded slides), **Designed single image**, or **Your own photos or video**.
2. For a designed post, choose how to start: **Generate with AI**, **From a blog post**, or **Start blank**.
   - **Generate with AI**: pick a purpose (Education, Product spotlight, Launch / new, Community, Seasonal moment, Offer), optionally pick up to 4 products to feature, describe the post, set the number of slides (3–10, carousels only) and click **Generate**. It takes up to a minute.
   - **From a blog post**: pick any of the brand's blog posts (drafts, scheduled or published), optionally add an angle, and click **Generate**. If the article is scheduled, the post is set to go out at the same time.
   - **Start blank**: click **Create** to open the slide builder with the brand layouts.
3. "Your own photos or video" skips straight to **Create**.
4. The post opens in the editor as a draft. Nothing posts until you schedule it or click Post now.

### Schedule several posts at once
1. Open the **Drafts** (or **Scheduled**) tab and tick the posts.
2. In the dark bar at the bottom click **Schedule…** (or **Reschedule…** if any are already scheduled).
3. Pick the day and time of the first one and how they should go out: **All at once**, **One per day**, or **One per week**. They go in the order listed.
4. Click **Schedule N posts**. A progress message shows as each one is scheduled.

Other bulk buttons: **Schedule at their set times** (drafts that already have a date), **Move to drafts** (unschedules scheduled posts), and **Delete**. Deleting removes posts from this list only — anything already on Instagram or Facebook stays there.

### Plan a full Instagram grid
1. Click **Plan a grid**.
2. Choose the kind of set: **Story posts** (Claude designs every post, each with a job in the story) or **One big picture** (one photo split across the squares so the profile shows it whole).
3. Choose **Brand**, **Size** (6, 9 or 12 posts — 2, 3 or 4 rows; 3 rows is usual).
4. For One big picture, choose a photo from our images or upload one (at least 3000 px wide works best). You can also click **Design it** to add text, shapes and more photos, or start from a blank canvas.
5. Under **What's it about?** pick **An idea**, **A blog post**, or **A collection** and type an angle. For story sets, **Suggest 3 ideas** gives options.
6. Under **When** pick the first post date and time (picture sets can be **Spread out** or **All at once** 10 minutes apart). Tick **Also post to Facebook** if wanted. A warning appears if other scheduled posts fall inside those dates.
7. Click **Write the N posts** (or **Split into N posts**). You can close the planner with **Keep working — tell me when it's ready**; a notification brings you back.
8. Review, then **Save as N drafts**. Then click **Schedule all N** to schedule them, or open any of them to tweak first. **See it in Preview grid** shows how the profile will look.

### See how the Instagram profile will look on a future date
Click **Preview grid**. It shows the real Instagram profile plus every scheduled post that will be up by the chosen date (Today, In a week, In a month, Last scheduled post, or any date). Options: **Include drafts that have a date** and **Mark the scheduled posts**. Click a scheduled square to edit it; click a posted one to open it on Instagram.

### Fix a failed post
Open the **Needs attention** tab, click the post, read the reason shown, fix it, and click **Try again now** (or **Retry what failed** if it posted on one platform only).

## Good to know
- Posting and scheduling are live actions: once a post is published it is locked here. Edit or delete it on Instagram/Facebook directly.
- A brand whose accounts aren't connected can still have drafts planned, but they can't post.
- The AI only uses our own images: product photos, the Image Library and the brand's Unsplash photography.`,
  },

  /* ─────────────────────── Social post editor ─────────────────────── */
  {
    path: "/marketing/social/[id]",
    title: "Social Post Editor",
    section: "Marketing",
    summary:
      "Edit one social post — slides, caption, brand and platforms — then schedule it, post it now, or preview it as it will appear in the feed.",
    body: `## What it's for
The editor for a single Instagram/Facebook post, opened from the Social Media list or right after creating a post. Everything you change **autosaves** about 1.5 seconds after you stop (the top bar shows **Saving** / **Saved** / **Not saved**). Saving never posts anything — only **Schedule** or **Post now** does.

## What's on the page
**Top bar:** **Social posts** (back to the list), the post name box ("Name this post" — internal only), the save indicator, **Preview**, **More** (menu), **Schedule**, and **Post now**.

**Second line:** "Posting as [brand] on [Instagram] [Facebook]" — click the brand to switch it, and click a platform pill to turn it on or off. A short status sentence follows, e.g. "Draft — not scheduled yet", "Goes out tomorrow at 9:00 AM", "Posting now…", "Posted …", or "Didn't post — see the reason below".

**Designed posts (slides):**
- Left: the **Slides** strip (up to 10). Hover a slide for **Move up**, **Move down**, **Duplicate** and **Delete**. A warning triangle marks a slide with a problem. **Use my own photos instead** is at the bottom.
- Middle: the selected slide on a canvas. Click anything to edit it; double-click text to type on the slide. Above it: the **Add** menu, **Undo** (Ctrl+Z) and **Redo** (Ctrl+Shift+Z).
- Right: **Design** and **Layers** tabs for the selected item (font, color, highlight, shadow, outline, curved text, photo frame/fit, brightness/contrast/blur, opacity, rotation, align, bring to front/send to back, lock in place, duplicate, delete).
- Below: **Caption**, built from four parts — **Hook** (the first line people see, 150 characters), **Body**, **Call to action**, and **Hashtags** (type one and press Enter). **As posted** shows the final caption with a character count (Instagram max 2,200) and hashtag count.

**Photo / video posts:** a **Type** switch (**Single image**, **Carousel**, **Reel / video**), **Add image** (opens the image library, where you can also upload) or **Upload video** (MP4 or MOV, vertical 9:16 works best, 3 s–15 min), arrows to reorder or remove media, a **Caption** box, and **Design branded slides instead**.

## How to…

### Add things to a slide
1. Click **Add** above the slide.
2. Choose **Text** (Heading, Subhead, Body, Label, or **Ready-made text styles**), **Photo** (**From the library** or **Product photo**), a brand logo or sticker, a **Shape** (Rectangle, Circle, Arch, Line), or under **Slide**: **Change the background**, **New blank slide**, or **New slide from a layout**.

### Schedule a post
1. Click **Schedule**. If anything is wrong, the panel lists "Before it can be scheduled:" problems to fix first.
2. Pick a quick option (e.g. "Tomorrow, 9 AM"), or set **Day** and **Time**. Posts made from a blog post offer "Same time as the blog post".
3. Click **Schedule for …**. It goes out within 5 minutes of that time. The button turns green and shows the time.
4. To change the time, click the green button again. To cancel, use **More → Unschedule** (it returns to a draft).

### Post right now
Click **Post now**, read the confirmation ("This goes live on … right away"), and click **Post now** again. The slides are rendered and sent; results per platform appear with a **View** link.

### Preview before posting
Click **Preview** to see a close mock-up in the Instagram feed and on the Facebook Page.

### Delete a post
**More → Delete post** (drafts and scheduled posts; cannot be undone). For a posted one, the option is **Remove from list** — it stays up on Facebook and Instagram.

## Good to know
- AI-written slides are converted into editable slides the first time the post opens ("Getting the slides ready to edit…").
- Posts made from a blog post show "Made from the blog post" with a link to the article.
- If the brand can't post yet, an amber banner says why.
- Switching a designed post to own photos removes the slides but keeps the caption.`,
  },

  /* ─────────────────────────── Blog Posts ─────────────────────────── */
  {
    path: "/marketing/blog",
    title: "Blog Posts",
    section: "Marketing",
    summary:
      "The blog calendar for sassyandco.com and naturalinspirations.com: start new posts, see what's scheduled, drafted, published or archived, and schedule or archive many at once.",
    body: `## What it's for
Blog posts are written here, given a date, and go live on their brand's website by themselves — the site picks a post up within about five minutes of its scheduled time. Sassy posts appear on the Sassy blog; NI posts appear in the Natural Inspirations Journal. Visible to owner, admin, user, marketing and operations. The brand switch in the top bar filters the list.

## What's on the page
- **New post** button (top right).
- Tabs with counts: **Scheduled**, **Drafts**, **Published**, **Archived**.
- A table: checkbox, **Post** (title, status pill and the /blog/ link), **Brand**, a date column (**Goes live**, **Went live** or **Planned for**), **Tags**, and **Updated**. Click a title to open the editor.
- When posts are ticked, a bar appears with the actions that fit the tab: **Schedule…** / **Reschedule…**, **Unschedule** (Scheduled tab), **Archive** or **Restore to drafts** (Archived tab), **Delete**, and **Clear**.

## How to…

### Start a new blog post
1. Click **New post**.
2. Answer each step and click **Continue**: **Brand** (Sassy or Natural Inspirations), **Audience** (Shoppers, Retail partners, Everyone), **Purpose** (Product spotlight, Ingredient story, Ritual / how-to, Seasonal / gift guide, New arrival / launch, Brand story, News / announcement, Other — for NI this also picks the Journal category), **Title**, and an optional short **Description** (starts as the Google search description; 120–155 characters reads best).
3. Choose how to start:
   - **Generate with AI** — describe the post, then click **Generate**. Claude writes the whole post in the brand format.
   - **Brand template** — click **Create** to start from the format's outline.
   - **Upload HTML** — click **Choose file** and pick an .html file; words and pictures are kept, styling is replaced.
4. The new draft opens in the editor. Nothing is on the website yet.

### Schedule several posts at once
1. On **Drafts** (or **Scheduled**), tick the posts (shift-click for a range).
2. Click **Schedule…** (or **Reschedule…**).
3. Pick the first day and time and **All at once**, **One per day**, or **One per week**, then confirm. They go live in the order listed.

### Unschedule, archive, restore or delete
Tick posts and use **Unschedule** (back to Drafts, dates kept), **Archive** (published posts come off the website; scheduled ones won't go live; restore later), **Restore to drafts** (from Archived), or **Delete** (permanent). Each asks you to confirm.

## Good to know
- If some posts fail in a bulk action, they stay ticked and the error says why.
- To write a social post from an article, open the article and use **Make a social post**.`,
  },

  /* ─────────────────────────── Blog editor ─────────────────────────── */
  {
    path: "/marketing/blog/[id]",
    title: "Blog Post Editor",
    section: "Marketing",
    summary:
      "Write and design one blog post in the brand-locked block builder, set its title, URL, tags, hero image and search description, then save, schedule, publish or archive it.",
    body: `## What it's for
The editor for one blog post. **Saving and publishing are separate:** **Save** (or Ctrl+S) stores your changes without changing whether the post is on the website. The publishing buttons (**Schedule**, **Publish now**, **Unschedule** / **Take off the site**, **Archive**) save the fields **and** change the post's status. There is no autosave here — the toolbar says **Unsaved changes** until you save.

## What's on the page
**Toolbar:** **Blog Posts** (back), brand and status pills, save status, view switch **Edit / HTML / Preview**, **Make a social post**, **Preview on site**, and **Save**.

**Builder (Edit view):**
- Left palette: **Blocks** — Heading, Paragraph, Image, List, Quote, Button, Product, Divider — and **Sections** — Image + Text, Text + Image, Two columns, Gallery, Callout. Click a tile to add it, or drag it onto the post.
- Middle: the post as it will look in the brand format. Click a block to select it; drop image files straight onto the post to upload them.
- Right panel tabs: **Block** (settings for the selected block, with Move up/down, Duplicate, Delete) and **Post settings**.

**Post settings** holds: **Title**; **Publishing** (status sentence, **Publish date & time** in your local time, and the buttons below); **Brand**; **URL** (/blog/…, follows the title until you edit it — changing it on a live post changes the link); **Tags** (on NI the first tag is the Journal category: Ingredient stories, Rituals, New arrivals, or The philosophy); **Search description** (120–155 characters is the sweet spot); **Hero image** (**Library**, **Upload**, **Remove**, or paste a URL); **About this post** (Audience, Purpose, **Team note** — internal only); and **Delete post**.

## How to…

### Schedule a post to go live
1. Open **Post settings** and set **Publish date & time**.
2. Click **Schedule** (it says **Update schedule** if already scheduled). The status reads "Goes live …". The site shows it within about five minutes of that time.

### Publish immediately
Click **Publish now** in Post settings. Once live, **View on site** opens the public page.

### Take a post down
Click **Take off the site** (live post) or **Unschedule** (scheduled post) — it goes back to draft. **Archive** also removes it and files it under Archived.

### Add a photo
Add an **Image** block (or a section with a photo), then in the Block tab use **Library**, **Upload**, or paste an image URL. Fill in **Alt text** (describes the photo for screen readers and Google) and an optional **Caption**.

### Check how it looks
Use **Preview** for an in-app preview of the storefront page, or **Save** then **Preview on site** to open the last saved version on the real site in any status. Anyone with that link can view it, so share it only with the team.

### Turn the article into a social post
Save first, then click **Make a social post**. The Social Media wizard opens on the "From a blog post" step with this article picked.

## Good to know
- Every Sassy post ends with a locked **Shop the story** block; edit its words and link, but it always stays last. Switching brand re-applies the brand's format.
- Older posts written before the builder open in a rich-text editor with a **Switch to the builder** button.
- The **HTML** view shows the code the site receives; edit in the Edit view.`,
  },

  /* ─────────────────────────── Website editor ─────────────────────────── */
  {
    path: "/storefronts/website",
    title: "Website",
    section: "Marketing",
    summary:
      "Edit the Sassy and Natural Inspirations storefront pages — homepage, product page template, policies, header & footer, colors and more — as drafts on the real page, then Publish to put them live.",
    body: `## What it's for
A block editor for the public storefront pages of **Sassy+Co** (sassyandco.com) and **Natural Inspirations** (naturalinspirations.com). You edit the real page in a draft preview; **edits save as a draft automatically** and nothing reaches the live site until you click **Publish**. After publishing, the site picks up the change within a minute. Visible to owner, admin, user, marketing and operations.

## What's on the page
**Top bar:** a store picker, a page picker (grouped, e.g. Main, Shopping, About, Help, Policies, Site-wide — each page is tagged "published" or "unpublished changes"), the page's web address, the save badge (**Saving…** / **Draft saved**), a status (**Live since …**, **Unpublished changes**, or **Not published yet**), **Desktop** / **Phone** view, **Page settings** (panel icon), **Reload canvas**, an open-in-new-tab icon (opens the draft), and **Publish** (reads **Published** when nothing is pending).

Pages include the **Homepage**, **Wholesale homepage**, **Product page template**, **Shop all**, **Our story**, the blog/Journal index, **Contact**, policy pages (Shipping, Returns, Payment terms, Terms of service, Privacy policy), and site-wide pages **Header & footer** and **Colors**. Sassy also has **Find your Sassy quiz**; NI also has Fragrance collections, ExSeed®, ingredient pages, FAQ and **Fragrance collections (words)**.

**Left column:** **Blocks** you can add (click, or drag onto the page), **Widgets** (saved blocks), and **On this page** — the list of blocks; drag to reorder, click to select. A lock icon marks parts the store draws itself (live product grids, product details, the quiz…): you can edit their words but not move or remove them.

**Middle:** the real store page showing your draft. Click any text to type over it; click a block for its floating toolbar (text formatting, link, move, duplicate, hide, colors, save as widget, delete, settings).

**Right panel** (opens from a block's settings or Page settings): **Block** tab (the block's fields, plus **Move up/down**, **Duplicate**, **Hide from site / Show on site**, **Save as widget**, **Delete**, and a **Colors** section) and **Page settings** tab.

## How to…

### Change text or a photo on a page
1. Pick the store and page at the top.
2. Click the text on the page and type. To change a photo, click it and choose one from the image library (or upload).
3. Watch for **Draft saved**. Then click **Publish**.

### Add a new section
Click a tile under **Blocks** (it goes after the selected block) or drag it onto the page. Options depend on the page — e.g. Product row, Image + text, Text, Promo banner, Pull quote, Stats, Callout card, Closing call to action, Newsletter signup, or **Embed** (a video, Instagram post, map, Google Form or countdown).

### Edit the product page template
Choose **Product page template**. It is one layout for every product page: product details are filled from each product (edited in Products); the sections around them are set here and appear on every product. Use **Preview: first product** to view it with a specific product.

### Change site colors
Open **Colors** (Site-wide). Each color is used all over the site. To recolor just one block, select it and use its **Colors** section instead — anything left on **Site color** follows the Colors page.

### Edit the announcement bar or footer
They're on every page, so they're edited once on **Header & footer**.

### Reuse a block on several pages (widgets)
Select a block and click **Save as widget**, give it a name. It then appears under **Widgets** for other pages. Editing a widget changes it on every page using it; **Unlink — make a copy just for this page** breaks the link.

### Undo or roll back
In **Page settings**: **Discard unpublished changes** (back to what's live), **Start over from the original page**, or under **Published versions** click **Load into draft** on an older version, then Publish.

## Good to know
- Hidden blocks stay in "On this page" but don't show on the site.
- The browser warns if you leave while a save is in progress.`,
  },

  /* ─────────────────────────── Image Library ─────────────────────────── */
  {
    path: "/marketing/assets",
    title: "Image Library",
    section: "Marketing",
    summary:
      "Browse, upload and organize the brand photos, logos and graphics used in emails, blogs, social posts and the website, and choose which ones reps can use.",
    body: `## What it's for
The shared home for our images. The same library appears in the image pickers of email templates, blog posts, social posts and the website editor. Visible to owner, admin, user, sales, marketing and operations.

## What's on the page
- Header: **Image Library** (or a folder breadcrumb with a back arrow), **New folder**, and **Upload**.
- **Folders** tiles, including product photo folders (read-only — product photos are edited on each product's page).
- **Images** grid with a count, a **Search** box, a filter (**All images**, **Shared with reps**, **Internal only**), and **Select**.
- Each image: hover for **Copy link**; a **Reps** badge means reps can see and use it. Click an image to open its details.

## How to…

### Upload images
Click **Upload** (several at once is fine) or drag photos from your computer onto the page ("Drop to upload"). They go into the open folder, or the general uploads inbox if no folder is open.

### Make a folder
Click **New folder**, type a name, click **Create**. Folders can be nested up to 3 levels. An empty folder shows **Delete this empty folder**.

### Move images into a folder
Drag an image onto a folder tile or breadcrumb, or click **Select**, tap images (or **Select all**), choose **Move to…**, and click **Move**.

### Add alt text, a name or a description
Click the image. Edit **Name**, **Folder**, **Who can use it**, **Description** (notes, usage guidance, photographer) and **Alt text** (describes the image for screen readers), then **Save changes**. Good descriptions help the AI email and blog writers pick the photo.

### Share an image with reps
Open it and set **Who can use it** to **Our team + reps** (or **Our team** for internal only), then **Save changes**. Shared images show on the rep portal.

### Delete an image
Open it, click **Delete**, then confirm "Delete this image for good?". This cannot be undone.

## Good to know
Moving an image to another folder never changes its link, so emails already using it keep working.`,
  },

  /* ─────────────────────────── Photography ─────────────────────────── */
  {
    path: "/marketing/photography",
    title: "Photography",
    section: "Marketing",
    summary:
      "Browse our Sassy and Natural Inspirations Unsplash photo collections and copy a photo's URL or credit line.",
    body: `## What it's for
Shows our brand photo collections on Unsplash in one place — the same photos the email and blog pickers offer under "Unsplash". It is not in the sidebar; open it at /marketing/photography. Visible to owner, admin, user, sales, marketing and operations.

## What's on the page
- Source cards for each collection or photographer (click one to show only its photos; an icon opens it on Unsplash) with how many photos are available.
- A notice that **Unsplash+ photos don't appear here**.
- **Search descriptions…**, source filter buttons (**All** plus each source), and a photo grid with **Load more**.

## How to…

### Use a photo
1. Click it. The detail shows size and likes.
2. Click **Copy image URL** and paste it into an email or blog image field, and **Copy credit line** to credit the photographer where it appears. **View on Unsplash** opens the original.

### Use an Unsplash+ (paid) photo
Unsplash only shares free photos with other apps. Download it on unsplash.com while signed in to our Unsplash+ account, upload it to the **Image Library**, and give it a title and short description. It then shows under "Ours" in every picker.`,
  },

  /* ─────────────────────────── Amazon Payments ─────────────────────────── */
  {
    path: "/accounting/amazon-payments",
    title: "Amazon Payments",
    section: "Accounting",
    summary:
      "Turn an Amazon settlement report into the journal entry for that period — sales, shipping, fees, advertising, promos, refunds, other, and the deposit total.",
    body: `## What it's for
Each Amazon settlement (roughly every two weeks) becomes one journal-entry row for the books. Owner and admin only.

## Adding a settlement
1. In Seller Central go to Payments → Reports Repository and download the settlement's **Flat File V2** (.txt).
2. On [Amazon Payments](/accounting/amazon-payments) click **Upload** (or drop the file anywhere on the page). Several files at once is fine.
3. Or attach the file to Sage with the paperclip and ask for the journal entry — Sage saves it here too.

Uploading the same settlement again replaces its row; it never duplicates.

## Reading the table
- Columns: **Sales**, **Shipping**, **Amazon Fees** (commission, FBA fulfillment, shipping chargebacks), **Cost of Advertising**, **Promo Rebates** (shipping promotions), **FBA Fees** (inbound transportation plus storage/removal/placement), **Refunded Sales**, **Other** (item promotions, inventory reimbursements, anything new), **Total** = what Amazon deposited.
- Newest period first, 10 per page. Click any column header to sort by it; click again to flip the order.
- Click a row to see which settlement lines feed each column, whether it ties to Amazon's deposit, and **Delete entry**.

## Exporting
- **Copy for Excel** copies every entry (in the current sort) to paste into a spreadsheet.
- **Download CSV** saves the same thing as a file.
- To remove an entry, click its row and use **Delete entry** (asks first). Entries are deleted one at a time; re-upload the report to bring one back.

## Asking Sage
Sage can answer questions about saved entries — e.g. "what was our Amazon deposit on Oct 10?", "which period had the highest ad spend?", "total Amazon fees in Q3". Each entry covers a settlement period (start → end date) and was deposited a couple of days after it ends.`,
  },

  /* ─────────────────────────── System Handbook ─────────────────────────── */
  {
    path: "/handbook",
    title: "System Handbook",
    section: "System",
    summary:
      "A plain-English overview of the systems behind the portal, what runs automatically, where the full documentation lives, and who to contact.",
    body: `## What it's for
A read-only orientation page for the owner: how the portal works and where everything is documented, so someone new could pick it up. Owner and admin only.

## What's on the page
- **Who runs what** — Hosting (Vercel), Database & login (Supabase), Business data (Fishbowl), Fulfillment (Point B Solutions), the code (GitHub repository), and Full documentation (/docs in the repo).
- **The systems, in plain English** — Fishbowl, Point B / Synapse, Shopify, Faire, MarketTime, Email (Resend + Outlook), Slack, Carrier tracking.
- **What happens automatically** — inventory & sales refresh, storefront orders into Fishbowl, shipping & delivery emails, marketing email.
- **The full documentation** — chapter checklist (done vs planned) and a link to the **Technical Roadmap**.
- **Key contacts** — primary developer, Point B contact, hosting, Fishbowl vendor.

## Good to know
Nothing on this page can be edited from the app.`,
  },

  /* ─────────────────────────── Order Check ─────────────────────────── */
  {
    path: "/pointb-check",
    title: "Order Check",
    section: "System",
    summary:
      "Check that Fishbowl and the Point B warehouse agree on recent orders — tracking, quantities and the shipping charge.",
    body: `## What it's for
A read-only reconciliation page: confirms our books (Fishbowl) and the warehouse (Point B / Synapse) agree. Owner and admin only.

## What's on the page
- **Reconciliation**: recent orders through Point B, loaded when the page opens. **Run** refreshes it. Switch between **board** (columns **Awaiting shipment**, **Shipped — to finalize**, **Complete**) and **grid** (tables by status with Order, Channel, Fishbowl tracking, Point B tracking, Status). Each order is tagged **Aligned**, **Review** or **Awaiting ship**.
- **Check a single order**: type an order number and search.

## How to…
### Check one order in detail
Click an order (**View →**) or type its number under **Check a single order**. You get checks for **In both systems**, **Tracking matches** and **Shipping charge matches**, side-by-side Fishbowl and Point B details, and **How the shipping charge is built** (Point B total × 1.25 = the Fishbowl shipping line).

## Good to know
If Point B isn't connected in this environment, only Fishbowl orders show.`,
  },

  /* ─────────────────────────── Point B Fields ─────────────────────────── */
  {
    path: "/pointb-relationships",
    title: "Point B Fields",
    section: "System",
    summary:
      "For a real order, see every field Point B returns, its value, the Fishbowl field it maps to, and who pushes it.",
    body: `## What it's for
A technical, read-only view of how Point B order data maps to Fishbowl. Owner and admin only.

## How to…
1. Pick a recent order from the dropdown, or type any order number ("…or type any order #") and click **View**.
2. Read the summary (Fishbowl SO, Warehouse order, Line items, Tracking) and the **Fields** table: Point B field, Value, Fishbowl field (or "unmapped"), and **Push** (Connector → Point B, Point B → Connector, Human (in Fishbowl), or Fixed value). Tick **Show all** to include pass-through fields.
3. **Charges** lists Point B's fees, the total, and the total × 1.25 that becomes the Fishbowl shipping line.

## Good to know
A banner at the top says whether Point B's charge types all match the contract, or flags new charge types to review. "Isn't in Point B yet" means the order may not have shipped.`,
  },

  /* ─────────────────────────── Technical Roadmap ─────────────────────────── */
  {
    path: "/technical-roadmap",
    title: "Technical Roadmap",
    section: "System",
    summary:
      "Where the Point B / Synapse warehouse integration stands and what's being built next.",
    body: `## What it's for
A read-only reference for in-flight integration work, currently the Point B / Synapse 3PL connection. Owner and admin only.

## What's on the page
- **Roadmap** — numbered steps with a status (In progress, Planned, Investigate): replace the LilyPad connector, sync Fishbowl inventory with Point B, evaluate the Shopify integration.
- **Point B / Synapse at a glance** — account and connector facts.
- **Polling & manifest schedule** (Central time).
- **Order → ship lifecycle** — each step marked as automatic or done by a person (e.g. clicking **Ship** in Fishbowl).

## Good to know
Nothing here can be edited in the app.`,
  },

  /* ─────────────────────────── Integrations ─────────────────────────── */
  {
    path: "/integrations",
    title: "Integrations",
    section: "System",
    summary:
      "See when Fishbowl last fed data into the portal, run a sync on demand, check the Slack assistant, and upload data by hand as a fallback.",
    body: `## What it's for
Shows the systems that feed data into the portal and when they last did. Owner and admin only. It isn't in the sidebar — open it from the profile menu at the top right (**Integrations**).

## What's on the page
- **Upload data** (desktop only): **Inventory snapshot** (manual fallback for Point B availability) or **Sales orders + items** (manual fallback if Fishbowl is down).
- **Fishbowl** card: Connected / Not connected, and for each feed (Sales orders, Inventory) the last pull, status, what was pulled, when the next one runs, and **Sync now**.
- **Slack** card: whether the Slack connection and the AI assistant are ready, questions answered, and setup steps if not.

## How to…
### Refresh Fishbowl data now
Click **Sync now** on the feed. A message says what was synced ("Synced N orders…") or why it was skipped.

### Upload a spreadsheet instead
Click **Upload data**, choose the type, and follow the upload window.`,
  },
];
