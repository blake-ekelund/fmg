import { supabaseServer } from "@/lib/supabaseServer";
import { isOverstock, isUnderstock, COVERAGE_MONTHS, OVERSTOCK_MIN_MONTHS } from "@/lib/inventoryHealth";
import { getDemandProfiles } from "@/lib/seasonalDemandServer";
import type { DemandProfile } from "@/lib/seasonalDemand";

/**
 * The top-bar notification bell.
 *
 * There is no stored notifications feed: the bell aggregates LIVE items from
 * data that already exists, each time it's opened —
 *
 *   • task      the signed-in user's own tasks (owner = their first name) that
 *               are overdue or due soon.
 *   • inventory the two standing "go review this list" asks (understock,
 *               overstock), as a single summary row each — the same definitions
 *               the dashboard and Inventory page share (lib/inventoryHealth).
 *   • order     recent storefront + wholesale orders.
 *   • review    product reviews awaiting moderation.
 *
 * Per-user state (which sources to show, and when the bell was last opened for
 * the unread badge) lives in `user_notification_state`. Everything else is read
 * fresh. Each source is wrapped so one failing query can never blank the bell.
 *
 * The inventory count is computed from the latest Fishbowl snapshot rather than
 * the live Point B read the dashboard uses — a bell badge doesn't justify a
 * warehouse round-trip on every poll — so it can differ from the dashboard by a
 * SKU or two; the Inventory page it links to remains the precise view.
 */

export type NotifType = "task" | "inventory" | "order" | "review";

export type NotificationItem = {
  /** Stable key (survives polls so React keys and "new" styling don't flicker). */
  id: string;
  type: NotifType;
  title: string;
  subtitle: string;
  href: string;
  /** ISO timestamp used for ordering + the unread comparison; null = standing. */
  ts: string | null;
  /** Newer than last_seen_at (orders/reviews) — drives the unread badge. */
  unread: boolean;
};

export type NotifPrefs = {
  tasks: boolean;
  inventory: boolean;
  orders: boolean;
  reviews: boolean;
};

export type NotificationState = {
  lastSeenAt: string;
  prefs: NotifPrefs;
};

const DEFAULT_PREFS: NotifPrefs = { tasks: true, inventory: true, orders: true, reviews: true };

type StateRow = {
  last_seen_at: string;
  notify_tasks: boolean;
  notify_inventory: boolean;
  notify_orders: boolean;
  notify_reviews: boolean;
};

/** The state table may not be migrated yet — degrade to defaults, never throw. */
const tableMissing = (msg?: string) =>
  !!msg && /user_notification_state|schema cache|does not exist/i.test(msg);

function rowToState(row: StateRow): NotificationState {
  return {
    lastSeenAt: row.last_seen_at,
    prefs: {
      tasks: row.notify_tasks,
      inventory: row.notify_inventory,
      orders: row.notify_orders,
      reviews: row.notify_reviews,
    },
  };
}

/** Load the caller's state, creating a default row on first use. */
export async function getNotificationState(userId: string): Promise<NotificationState> {
  const sel = await supabaseServer
    .from("user_notification_state")
    .select("last_seen_at, notify_tasks, notify_inventory, notify_orders, notify_reviews")
    .eq("user_id", userId)
    .maybeSingle();
  if (sel.error) {
    // Before the migration is pushed, seen-time can't be stored — treat "now"
    // as last-seen so the badge stays calm; items still list in the panel.
    if (tableMissing(sel.error.message)) return { lastSeenAt: new Date().toISOString(), prefs: DEFAULT_PREFS };
    throw new Error(sel.error.message);
  }
  if (sel.data) return rowToState(sel.data as StateRow);

  // First time: seed a row so "unread" starts from now, not the epoch.
  const ins = await supabaseServer
    .from("user_notification_state")
    .insert({ user_id: userId })
    .select("last_seen_at, notify_tasks, notify_inventory, notify_orders, notify_reviews")
    .maybeSingle();
  if (ins.error || !ins.data) {
    return { lastSeenAt: new Date().toISOString(), prefs: DEFAULT_PREFS };
  }
  return rowToState(ins.data as StateRow);
}

/** Mark the bell as seen now (clears the unread badge for new orders/reviews). */
export async function markNotificationsSeen(userId: string): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await supabaseServer
    .from("user_notification_state")
    .upsert({ user_id: userId, last_seen_at: now, updated_at: now }, { onConflict: "user_id" });
  if (error && !tableMissing(error.message)) throw new Error(error.message);
}

/** Update which sources this user wants surfaced. */
export async function updateNotificationPrefs(userId: string, prefs: NotifPrefs): Promise<void> {
  const { error } = await supabaseServer
    .from("user_notification_state")
    .upsert(
      {
        user_id: userId,
        notify_tasks: prefs.tasks,
        notify_inventory: prefs.inventory,
        notify_orders: prefs.orders,
        notify_reviews: prefs.reviews,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );
  if (error && !tableMissing(error.message)) throw new Error(error.message);
}

/** "today" as a yyyy-mm-dd string in local server time, for due-date compares. */
function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

/* ─── Sources ─── */

async function taskItems(userId: string, since: string): Promise<NotificationItem[]> {
  // Tasks are owned by first_name (lib/team-owners), so resolve the caller's.
  const prof = await supabaseServer.from("profiles").select("first_name").eq("id", userId).maybeSingle();
  const firstName = (prof.data as { first_name: string | null } | null)?.first_name?.trim();
  if (!firstName) return [];

  const horizon = new Date();
  horizon.setDate(horizon.getDate() + 7);
  const horizonKey = horizon.toISOString().slice(0, 10);
  const today = todayKey();

  const { data, error } = await supabaseServer
    .from("tasks")
    .select("id, name, due_date, status, priority")
    .eq("owner", firstName)
    .neq("status", "done")
    .not("due_date", "is", null)
    .lte("due_date", horizonKey)
    .order("due_date", { ascending: true })
    .limit(20);
  if (error) throw new Error(error.message);

  return ((data ?? []) as { id: string; name: string; due_date: string; priority: string | null }[]).map((t) => {
    const overdue = t.due_date < today;
    const dueToday = t.due_date === today;
    return {
      id: `task:${t.id}`,
      type: "task" as const,
      title: t.name,
      subtitle: overdue ? `Overdue · was due ${t.due_date}` : dueToday ? "Due today" : `Due ${t.due_date}`,
      href: "/task-list",
      ts: `${t.due_date}T09:00:00`,
      // Overdue/today tasks read as needing attention; `since` keeps the type
      // consistent with the others even though tasks aren't event-stamped.
      unread: overdue || dueToday ? true : t.due_date > since.slice(0, 10),
    };
  });
}

async function orderItems(since: string): Promise<NotificationItem[]> {
  const fourteenAgo = new Date(Date.now() - 14 * 86_400_000).toISOString();
  const { data, error } = await supabaseServer
    .from("orders")
    .select("id, number, created_at, channel, store, business_name, contact_name, email, total")
    .gte("created_at", fourteenAgo)
    .order("created_at", { ascending: false })
    .limit(15);
  if (error) throw new Error(error.message);

  return ((data ?? []) as {
    id: string;
    number: number | null;
    created_at: string;
    channel: string | null;
    store: string | null;
    business_name: string | null;
    contact_name: string | null;
    email: string | null;
    total: number | null;
  }[]).map((o) => {
    const who = o.business_name || o.contact_name || o.email || "Order";
    const chan = o.channel === "wholesale" ? "Wholesale" : "Retail";
    const store = (o.store || "").toUpperCase();
    const total = o.total != null ? `$${Math.round(o.total).toLocaleString("en-US")}` : "";
    return {
      id: `order:${o.id}`,
      type: "order" as const,
      title: o.number ? `#${o.number} · ${who}` : who,
      subtitle: [chan, store, total].filter(Boolean).join(" · "),
      href: "/storefronts/purchases",
      ts: o.created_at,
      unread: o.created_at > since,
    };
  });
}

async function reviewItems(since: string): Promise<NotificationItem[]> {
  const { data, error } = await supabaseServer
    .from("product_reviews")
    .select("id, created_at, product_name, display_name, rating, store")
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(15);
  if (error) throw new Error(error.message);

  return ((data ?? []) as {
    id: string;
    created_at: string;
    product_name: string | null;
    display_name: string | null;
    rating: number | null;
    store: string | null;
  }[]).map((r) => ({
    id: `review:${r.id}`,
    type: "review" as const,
    title: `${r.rating ?? "?"}★ ${r.product_name || "Product"}`,
    subtitle: `${r.display_name || "A customer"} · ${(r.store || "").toUpperCase()} · awaiting review`,
    href: "/storefronts/reviews",
    ts: r.created_at,
    unread: r.created_at > since,
  }));
}

async function inventoryItems(): Promise<NotificationItem[]> {
  // Mirror useDashboardInventory, but snapshot-only (no live Point B read).
  const products = await supabaseServer
    .from("inventory_products")
    .select("part, display_name, avg_monthly_demand")
    .eq("is_forecasted", true);
  if (products.error) throw new Error(products.error.message);
  const rows = (products.data ?? []) as { part: string; display_name: string | null; avg_monthly_demand: number | null }[];
  if (rows.length === 0) return [];

  const latest = await supabaseServer
    .from("inventory_uploads")
    .select("id")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const invMap = new Map<string, { on_hand: number; on_order: number }>();
  if (latest.data) {
    const snap = await supabaseServer
      .from("inventory_snapshot_items")
      .select("part, on_hand, on_order")
      .eq("upload_id", (latest.data as { id: string }).id);
    for (const r of (snap.data ?? []) as { part: string; on_hand: number; on_order: number }[]) {
      invMap.set(r.part, { on_hand: r.on_hand, on_order: r.on_order });
    }
  }

  const units90 = await supabaseServer
    .from("units_by_product_last_90_days")
    .select("part, units_last_90_days");
  const units90Map = new Map<string, number>(
    ((units90.data ?? []) as { part: string; units_last_90_days: number }[]).map((r) => [r.part, r.units_last_90_days]),
  );

  // Seasonal month-by-month demand, shared with the dashboard and Inventory page.
  const demand = await getDemandProfiles().catch(() => new Map<string, DemandProfile>());

  let under = 0;
  let over = 0;
  for (const p of rows) {
    const inv = invMap.get(p.part);
    const on_hand = inv?.on_hand ?? 0;
    const on_order = inv?.on_order ?? 0;
    const avg_monthly_demand =
      p.avg_monthly_demand && p.avg_monthly_demand > 0
        ? p.avg_monthly_demand
        : Math.round((units90Map.get(p.part) ?? 0) / 3);
    const shape = { on_hand, on_order, avg_monthly_demand, display_name: p.display_name, demand: demand.get(p.part) };
    if (isUnderstock(shape)) under += 1;
    if (isOverstock(shape)) over += 1;
  }

  const out: NotificationItem[] = [];
  if (under > 0) {
    out.push({
      id: "inventory:understock",
      type: "inventory",
      title: "Review understock",
      subtitle: `${under} SKU${under > 1 ? "s" : ""} under ${COVERAGE_MONTHS}-mo cover`,
      href: "/inventory?filter=understock",
      ts: null,
      unread: false,
    });
  }
  if (over > 0) {
    out.push({
      id: "inventory:overstock",
      type: "inventory",
      title: "Review overstock",
      subtitle: `${over} slow-moving SKU${over > 1 ? "s" : ""} over ${OVERSTOCK_MIN_MONTHS}mo supply`,
      href: "/inventory?filter=overstock",
      ts: null,
      unread: false,
    });
  }
  return out;
}

/** Run a source, swallowing its failure so one bad query can't blank the bell. */
async function safe(label: string, fn: () => Promise<NotificationItem[]>): Promise<NotificationItem[]> {
  try {
    return await fn();
  } catch (e) {
    console.error(`[notifications] ${label} failed:`, e instanceof Error ? e.message : e);
    return [];
  }
}

export type NotificationsPayload = {
  items: NotificationItem[];
  unreadCount: number;
  prefs: NotifPrefs;
};

/** The full bell payload for a user: live items (by their prefs) + unread count. */
export async function getNotifications(userId: string): Promise<NotificationsPayload> {
  const state = await getNotificationState(userId);
  const since = state.lastSeenAt;
  const { prefs } = state;

  const groups = await Promise.all([
    prefs.tasks ? safe("tasks", () => taskItems(userId, since)) : Promise.resolve([]),
    prefs.inventory ? safe("inventory", () => inventoryItems()) : Promise.resolve([]),
    prefs.orders ? safe("orders", () => orderItems(since)) : Promise.resolve([]),
    prefs.reviews ? safe("reviews", () => reviewItems(since)) : Promise.resolve([]),
  ]);

  const items = groups.flat().sort((a, b) => {
    // Standing items (inventory, ts null) sit at the top; the rest newest-first.
    if (a.ts === null && b.ts === null) return 0;
    if (a.ts === null) return -1;
    if (b.ts === null) return 1;
    return b.ts.localeCompare(a.ts);
  });

  // The badge counts genuinely new events (orders + reviews) since last opened.
  const unreadCount = items.filter((i) => i.unread && (i.type === "order" || i.type === "review")).length;

  return { items, unreadCount, prefs };
}
