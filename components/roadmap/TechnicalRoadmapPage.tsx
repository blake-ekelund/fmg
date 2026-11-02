import {
  Route,
  ShoppingBag,
  Clock,
  Truck,
  RefreshCw,
  Warehouse,
  ArrowRight,
  CircleDot,
  Server,
  User,
  Bot,
  CheckCircle2,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import PageMeta from "@/components/PageMeta";

/**
 * Technical Roadmap — an internal, admin-only reference for the integration
 * work in flight. Right now it documents the Point B / Synapse (Zethcon) 3PL
 * connection: how orders and shipments flow today through LilyPad (Sharpe
 * Concepts), the reverse-engineered mechanism, what we've built around it, and
 * the plan to bring that connector in-house. Static content — established from
 * read-only Fishbowl DB forensics + the Synapse API docs (2026-08-04); status
 * last refreshed 2026-11-02. The build spec is docs/pointb-connector.md.
 */

type Status = "done" | "paused" | "in-progress" | "planned" | "investigate";

const STATUS_STYLES: Record<Status, { label: string; className: string }> = {
  done: { label: "Done", className: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  paused: { label: "Paused", className: "bg-amber-50 text-amber-700 ring-amber-200" },
  "in-progress": { label: "In progress", className: "bg-sky-50 text-sky-700 ring-sky-200" },
  planned: { label: "Planned", className: "bg-gray-100 text-gray-600 ring-gray-200" },
  investigate: { label: "Investigate", className: "bg-violet-50 text-violet-700 ring-violet-200" },
};

function StatusPill({ status }: { status: Status }) {
  const s = STATUS_STYLES[status];
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${s.className}`}>
      {s.label}
    </span>
  );
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border border-gray-200 bg-white ${className}`}>{children}</div>
  );
}

function SectionHeader({ icon: Icon, title, sub }: { icon: LucideIcon; title: string; sub?: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="h-9 w-9 shrink-0 rounded-lg bg-gray-50 text-gray-500 flex items-center justify-center ring-1 ring-inset ring-gray-100">
        <Icon size={16} />
      </div>
      <div>
        <h2 className="text-sm font-semibold text-gray-900 tracking-tight">{title}</h2>
        {sub && <p className="text-xs text-gray-500 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

/* Small monospace chip for technical identifiers (part #s, users, endpoints). */
function Mono({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded bg-gray-100 px-1.5 py-0.5 text-[11px] font-mono text-gray-700">{children}</code>
  );
}

/* ── Roadmap steps ─────────────────────────────────────────────── */

const STEPS: { n: number; title: string; status: Status; target: string; body: React.ReactNode }[] = [
  {
    n: 1,
    title: "Replace LilyPad",
    status: "paused",
    target: "Blocked on: the Fishbowl write format",
    body: (
      <>
        Bring the Fishbowl ↔ Synapse connector in-house and retire LilyPad (Sharpe Concepts). The
        sending side is mapped and a test-only <Mono>create-order</Mono> probe works; the wholesale
        freight formula is solved. What&apos;s left is the write-back: LilyPad writes to Fishbowl through
        the <strong>legacy plugin API (port 28192)</strong>, not the REST API we use, and the exact
        shipment-update message still has to be pinned down. Then: build it, shadow-run next to
        LilyPad, cut over.
      </>
    ),
  },
  {
    n: 2,
    title: "Point B as the inventory source",
    status: "done",
    target: "Done Oct 26–28",
    body: (
      <>
        Point B <strong>available</strong> stock (picked-for-order units excluded) now drives the
        inventory forecast, the dashboard levers, storefront stock (synced every 15 min) and Faire.
        The Variance Report flags where Fishbowl disagrees. Fishbowl&apos;s own counts are still
        corrected by hand.
      </>
    ),
  },
  {
    n: 3,
    title: "Evaluate the Shopify integration",
    status: "investigate",
    target: "Not started",
    body: (
      <>
        Figure out exactly what the Shopify API integration does today, what it reads/writes, and
        <strong> who actually owns it</strong>. It runs as a separate Fishbowl plugin (its own{" "}
        <Mono>SHOPIFY</Mono> user), distinct from Point B — needs its own audit before we depend on it.
      </>
    ),
  },
];

/* ── Built since August ────────────────────────────────────────── */

const BUILT: { title: string; where: string; body: React.ReactNode }[] = [
  {
    title: "Order Check",
    where: "System → Order Check",
    body: <>Look up any SO# and see Fishbowl and Point B side by side, or run a batch check of recent orders.</>,
  },
  {
    title: "Daily drift monitor",
    where: "pointb-monitor cron",
    body: (
      <>
        Emails only when something&apos;s off: an unknown Point B charge, a shipment missing in
        Fishbowl, missing tracking, or a freight line that isn&apos;t fees × 1.25.
      </>
    ),
  },
  {
    title: "Stock gate on order push",
    where: "lib/orderStockCheck.ts",
    body: <>Storefront and marketplace orders are held before going to Fishbowl if Point B doesn&apos;t have the stock.</>,
  },
  {
    title: "Point B inventory sync",
    where: "pointb-inventory-sync cron",
    body: <>Saves Point B stock per part every 15 minutes, with a Refresh button on Inventory.</>,
  },
  {
    title: "Variance Report",
    where: "Catalog → Variance Report",
    body: <>Fishbowl vs Point B by part, with unit fixes and archive, so drift is visible.</>,
  },
  {
    title: "Create-order test probe",
    where: "/api/pointb/create-order-test",
    body: <>Sends one order to Synapse&apos;s test environment only; it refuses to run against production.</>,
  },
];

/* ── Order → ship lifecycle ────────────────────────────────────── */

const LIFECYCLE: { icon: LucideIcon; title: string; body: React.ReactNode; actor?: "auto" | "human" }[] = [
  {
    icon: ShoppingBag,
    title: "Store order → Fishbowl estimate",
    body: (
      <>
        A storefront order is auto-pushed into Fishbowl as an <strong>Estimate</strong> — held first
        if Point B doesn&apos;t have the stock.
      </>
    ),
    actor: "auto",
  },
  {
    icon: CircleDot,
    title: "Estimate issued",
    body: <>Ops issues the estimate → an issued SO in the <Mono>Point B Solutions</Mono> location group.</>,
    actor: "human",
  },
  {
    icon: Truck,
    title: "Sent to Synapse (Point B)",
    body: <>The poll forwards issued SOs to Synapse; Point B picks, packs and ships.</>,
    actor: "auto",
  },
  {
    icon: RefreshCw,
    title: "Ship data returns — phase 1",
    body: (
      <>
        The poll pulls the shipment back and writes <strong>tracking</strong> onto the SO. Wholesale
        orders also get a <strong>Shipping line = Point B fees × 1.25</strong>; D2C orders get tracking
        only. <Mono>dateShipped</Mono> is still empty — no inventory moved yet.
      </>
    ),
    actor: "auto",
  },
  {
    icon: User,
    title: "Ship confirmed in Fishbowl — phase 2",
    body: (
      <>
        A person clicks <strong>Ship</strong> in Fishbowl. This relieves inventory, consumes COGS, and
        queues the <strong>QuickBooks</strong> invoice — natively, no middleware.
      </>
    ),
    actor: "human",
  },
  {
    icon: RefreshCw,
    title: "Customer notified",
    body: <>The tracking-sync cron reads the tracking off Fishbowl and emails the customer once.</>,
    actor: "auto",
  },
];

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-gray-100 bg-gray-50/60 px-3 py-2.5">
      <div className="text-[11px] uppercase tracking-wide text-gray-400 font-medium">{label}</div>
      <div className="text-sm text-gray-800 mt-0.5">{children}</div>
    </div>
  );
}

export default function TechnicalRoadmapPage() {
  return (
    <div className="px-4 md:px-8 py-6 md:py-8 max-w-[1100px] mx-auto space-y-8">
      <PageMeta
        title="Technical Roadmap"
        description="Where the Point B / Synapse connection stands, what's built, and the plan to replace LilyPad with our own bridge."
      />

      {/* Roadmap */}
      <section className="space-y-3">
        <SectionHeader icon={Route} title="Roadmap" sub="What we're building, in order." />
        <div className="grid gap-3 sm:grid-cols-3">
          {STEPS.map((step) => (
            <Card key={step.n} className="p-4 flex flex-col">
              <div className="flex items-center justify-between">
                <div className="h-7 w-7 rounded-lg bg-gray-900 text-white text-xs font-semibold flex items-center justify-center">
                  {step.n}
                </div>
                <StatusPill status={step.status} />
              </div>
              <h3 className="text-sm font-semibold text-gray-900 mt-3">{step.title}</h3>
              <p className="text-xs text-gray-600 mt-1.5 leading-relaxed flex-1">{step.body}</p>
              <div className="text-[11px] text-gray-400 mt-3 pt-3 border-t border-gray-100">{step.target}</div>
            </Card>
          ))}
        </div>
      </section>

      {/* Built since August */}
      <section className="space-y-3">
        <SectionHeader icon={CheckCircle2} title="Built since August" sub="Live around LilyPad while the replacement is paused." />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {BUILT.map((b) => (
            <Card key={b.title} className="p-4">
              <h3 className="text-sm font-semibold text-gray-900">{b.title}</h3>
              <p className="text-xs text-gray-600 mt-1.5 leading-relaxed">{b.body}</p>
              <div className="text-[11px] text-gray-400 mt-3 pt-3 border-t border-gray-100">{b.where}</div>
            </Card>
          ))}
        </div>
      </section>

      {/* At a glance */}
      <section className="space-y-3">
        <SectionHeader icon={Warehouse} title="Point B / Synapse at a glance" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Fact label="3PL">Point B Solutions — runs Zethcon / Synapse WMS</Fact>
          <Fact label="Account">Facility <Mono>PB1</Mono> · Customer <Mono>1590</Mono></Fact>
          <Fact label="Inventory truth">Point B — forecast, storefronts &amp; Faire all read it; Fishbowl isn&apos;t trusted for stock</Fact>
          <Fact label="Current connector">LilyPad (Sharpe Concepts) — Fishbowl REST app <Mono>9818</Mono></Fact>
          <Fact label="Connects as">Fishbowl user <Mono>PointBSolutions</Mono> (#32)</Fact>
          <Fact label="Fishbowl protocol">Reads via REST (<Mono>:2456</Mono>) · LilyPad writes via the legacy plugin API (<Mono>:28192</Mono>)</Fact>
        </div>
      </section>

      {/* Schedule */}
      <section className="space-y-3">
        <SectionHeader
          icon={Clock}
          title="Polling & manifest schedule"
          sub="All times Central."
        />
        <Card className="p-4 sm:p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <div className="text-xs font-semibold text-gray-700">Poll cadence</div>
              <ul className="text-sm text-gray-700 space-y-1.5">
                <li className="flex gap-2"><span className="text-gray-400">•</span> Every <strong>30 minutes</strong> (on the :00 and :30).</li>
                <li className="flex gap-2"><span className="text-gray-400">•</span> Runs <strong>4:00&nbsp;AM → ~3:30&nbsp;PM</strong>, then stops for the day.</li>
                <li className="flex gap-2"><span className="text-gray-400">•</span> Resumes polling at <strong>4:00&nbsp;AM</strong>.</li>
              </ul>
            </div>
            <div className="space-y-2">
              <div className="text-xs font-semibold text-gray-700">Shipping manifests</div>
              <ul className="text-sm text-gray-700 space-y-1.5">
                <li className="flex gap-2"><span className="text-gray-400">•</span> <strong>11:00–11:30&nbsp;AM</strong> — tracking &amp; freight land.</li>
                <li className="flex gap-2"><span className="text-gray-400">•</span> <strong>3:00–3:30&nbsp;PM</strong> — second manifest window.</li>
                <li className="flex gap-2 text-gray-500"><span className="text-gray-300">•</span> Matches what we see: phase-1 ship writes cluster at these times.</li>
              </ul>
            </div>
          </div>
        </Card>
      </section>

      {/* Lifecycle */}
      <section className="space-y-3">
        <SectionHeader
          icon={ArrowRight}
          title="Order → ship lifecycle"
          sub="Automated steps vs. the human control point."
        />
        <Card className="p-4 sm:p-5">
          <ol className="space-y-3">
            {LIFECYCLE.map((step, i) => (
              <li key={i} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <div className="h-8 w-8 shrink-0 rounded-lg bg-gray-50 text-gray-500 flex items-center justify-center ring-1 ring-inset ring-gray-100">
                    <step.icon size={15} />
                  </div>
                  {i < LIFECYCLE.length - 1 && <div className="w-px flex-1 bg-gray-200 my-1" />}
                </div>
                <div className="pb-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-900">{step.title}</span>
                    {step.actor === "auto" && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-1.5 py-0.5 text-[10px] font-medium text-sky-700 ring-1 ring-inset ring-sky-200">
                        <Bot size={10} /> Auto
                      </span>
                    )}
                    {step.actor === "human" && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 ring-1 ring-inset ring-emerald-200">
                        <User size={10} /> Human
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-600 mt-0.5 leading-relaxed">{step.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </Card>
      </section>

      {/* Two-phase write-back detail */}
      <section className="space-y-3">
        <SectionHeader
          icon={RefreshCw}
          title="How the shipment writes back"
          sub="The key insight that shrinks the build."
        />
        <div className="grid gap-3 md:grid-cols-2">
          <Card className="p-4">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-1.5 py-0.5 text-[10px] font-medium text-sky-700 ring-1 ring-inset ring-sky-200">
                <Bot size={10} /> Phase 1 · automated
              </span>
            </div>
            <h3 className="text-sm font-semibold text-gray-900 mt-2">Label + freight import</h3>
            <ul className="text-xs text-gray-600 mt-2 space-y-1.5 leading-relaxed">
              <li>Creates the <Mono>ship</Mono> / <Mono>shipcarton</Mono> record with the tracking number.</li>
              <li>Wholesale only: appends a Shipping line = <strong>Point B fees × 1.25</strong> (25% markup).</li>
              <li><Mono>dateShipped</Mono> stays empty; nothing is fulfilled yet.</li>
              <li className="text-gray-500">This is the only piece we need to rebuild.</li>
            </ul>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 ring-1 ring-inset ring-emerald-200">
                <User size={10} /> Phase 2 · human
              </span>
            </div>
            <h3 className="text-sm font-semibold text-gray-900 mt-2">Ship confirmation</h3>
            <ul className="text-xs text-gray-600 mt-2 space-y-1.5 leading-relaxed">
              <li>Someone clicks <strong>Ship</strong> in the Fishbowl client, order by order.</li>
              <li>Fishbowl relieves inventory, consumes COGS, sets <Mono>dateShipped</Mono>.</li>
              <li>The <strong>QuickBooks</strong> invoice queues natively off that action.</li>
              <li className="text-gray-500">Stays as-is — a deliberate review gate before invoicing.</li>
            </ul>
          </Card>
        </div>
        <Card className="p-4 bg-gray-50/60">
          <div className="text-xs text-gray-600 leading-relaxed">
            <strong className="text-gray-800">Freight rule (verified).</strong> On{" "}
            <strong>wholesale</strong> orders LilyPad writes one Shipping line ={" "}
            <Mono>order/fees.totalAmount</Mono> × 1.25 — Point B&apos;s freight plus pick and base-order
            charges, with a 25% markup. Fees keep accruing after ship, so the amount is a snapshot taken
            when the line is written (7 of 10 recent orders match to the penny; the rest drifted up
            later). <strong>D2C</strong> orders get tracking only — no fee line, no markup.
          </div>
        </Card>
      </section>

      {/* APIs */}
      <section className="space-y-3">
        <SectionHeader icon={Server} title="The two Point B APIs" />
        <div className="grid gap-3 md:grid-cols-2">
          <Card className="p-4">
            <h3 className="text-sm font-semibold text-gray-900">Synapse WMS API</h3>
            <p className="text-[11px] text-gray-400 font-mono mt-0.5">pntb1.synapsewms.net</p>
            <ul className="text-xs text-gray-600 mt-2 space-y-1.5 leading-relaxed">
              <li>Low-level WMS. Session-cookie auth (<Mono>/login</Mono> → session + XSRF).</li>
              <li>Core: <Mono>orders/create-order</Mono>, <Mono>orders/shipped-orders</Mono>, <Mono>inventory/by-customer</Mono>.</li>
              <li>Carries everything we need — orders, tracking, inventory. Used by the inventory sync, Order Check and the monitor.</li>
            </ul>
          </Card>
          <Card className="p-4">
            <h3 className="text-sm font-semibold text-gray-900">Point B Integration API</h3>
            <p className="text-[11px] text-gray-400 font-mono mt-0.5">integrations.pointbsolutions.com</p>
            <ul className="text-xs text-gray-600 mt-2 space-y-1.5 leading-relaxed">
              <li>Cleaner wrapper. Bearer-token auth (<Mono>/api/token</Mono>).</li>
              <li>We use it for one thing: <Mono>order/fees</Mono> (freight + handling), the basis of the wholesale freight line.</li>
            </ul>
          </Card>
        </div>
      </section>

      <p className="text-[11px] text-gray-400 pt-2 border-t border-gray-100">
        Last updated 2026-11-02. Mechanism established from read-only Fishbowl database forensics + the
        Synapse API docs (Aug 2026). Build spec: <Mono>docs/pointb-connector.md</Mono>.
      </p>
    </div>
  );
}
