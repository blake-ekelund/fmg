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
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

/**
 * Technical Roadmap — an internal, admin-only reference for the integration
 * work in flight. Right now it documents the Point B / Synapse (Zethcon) 3PL
 * connection: how orders and shipments flow today through LilyPad (Sharpe
 * Concepts), the reverse-engineered mechanism, and the plan to bring that
 * connector in-house. Static content — everything here was established from
 * read-only Fishbowl DB forensics + the Synapse API docs (2026-08-04).
 */

type Status = "in-progress" | "planned" | "investigate";

const STATUS_STYLES: Record<Status, { label: string; className: string }> = {
  "in-progress": { label: "In progress", className: "bg-amber-50 text-amber-700 ring-amber-200" },
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
    status: "in-progress",
    target: "Target: end of week",
    body: (
      <>
        Bring the Fishbowl ↔ Synapse connector in-house and retire LilyPad (Sharpe Concepts).
        Reverse-engineering is done: it&apos;s a <strong>Fishbowl REST poller</strong> (the same API the
        portal already uses), so replacing it means reproducing <strong>phase&nbsp;1 only</strong> — write
        the shipment record + tracking + marked-up freight line back onto the SO. Inventory relief and
        QuickBooks stay a native Fishbowl step a human already does.
      </>
    ),
  },
  {
    n: 2,
    title: "Sync Fishbowl inventory with Point B",
    status: "planned",
    target: "Next",
    body: (
      <>
        Point B is the <strong>source of truth</strong> for inventory; Fishbowl and Zethcon have always
        drifted. Pull Synapse&apos;s <Mono>inventory/by-customer</Mono> on a schedule and reconcile it into
        Fishbowl / the storefront so availability stops lying.
      </>
    ),
  },
  {
    n: 3,
    title: "Evaluate the Shopify integration",
    status: "investigate",
    target: "After #1–2",
    body: (
      <>
        Figure out exactly what the Shopify API integration does today, what it reads/writes, and
        <strong> who actually owns it</strong>. It runs as a separate Fishbowl plugin (its own{" "}
        <Mono>SHOPIFY</Mono> user), distinct from Point B — needs its own audit before we depend on it.
      </>
    ),
  },
];

/* ── Order → ship lifecycle ────────────────────────────────────── */

const LIFECYCLE: { icon: LucideIcon; title: string; body: React.ReactNode; actor?: "auto" | "human" }[] = [
  {
    icon: ShoppingBag,
    title: "Store order → Fishbowl estimate",
    body: <>A storefront order is auto-pushed into Fishbowl as an <strong>Estimate</strong>.</>,
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
        The poll pulls the shipment back and writes <strong>tracking + a freight line (Point B freight
        ×1.25)</strong> onto the SO. <Mono>dateShipped</Mono> is still empty — no inventory moved yet.
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
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 text-gray-400 text-xs font-medium">
          <Route size={14} />
          Technical Roadmap
        </div>
        <h1 className="text-xl font-semibold text-gray-900 tracking-tight mt-1">
          Point B / Synapse integration
        </h1>
        <p className="text-sm text-gray-500 mt-1 max-w-2xl">
          Where the 3PL connection stands and where it&apos;s going. Point B Solutions runs the Synapse
          (Zethcon) warehouse; today a third-party connector, LilyPad, bridges it to Fishbowl. The plan is
          to own that bridge.
        </p>
      </div>

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

      {/* At a glance */}
      <section className="space-y-3">
        <SectionHeader icon={Warehouse} title="Point B / Synapse at a glance" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Fact label="3PL">Point B Solutions — runs Zethcon / Synapse WMS</Fact>
          <Fact label="Account">Facility <Mono>PB1</Mono> · Customer <Mono>1590</Mono></Fact>
          <Fact label="Inventory truth">Point B — Fishbowl &amp; Zethcon drift, so Fishbowl isn&apos;t trusted for stock</Fact>
          <Fact label="Current connector">LilyPad (Sharpe Concepts) — Fishbowl REST app <Mono>9818</Mono></Fact>
          <Fact label="Connects as">Fishbowl user <Mono>PointBSolutions</Mono> (#32)</Fact>
          <Fact label="Protocol">Fishbowl REST API — the same one the portal uses</Fact>
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
              <li>Appends a Shipping line = <strong>Point B freight × 1.25</strong> (25% markup).</li>
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
            <strong className="text-gray-800">Freight rule.</strong> LilyPad always appends one freight
            line at Point B cost × 1.25. <strong>D2C</strong> orders keep their original checkout-shipping
            line and get the freight line added (two shipping lines); <strong>wholesale</strong> orders
            get the freight line only (one). Our connector has to match this audience-aware behavior.
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
            </ul>
          </Card>
          <Card className="p-4">
            <h3 className="text-sm font-semibold text-gray-900">Point B Integration API</h3>
            <p className="text-[11px] text-gray-400 font-mono mt-0.5">integrations.pointbsolutions.com</p>
            <ul className="text-xs text-gray-600 mt-2 space-y-1.5 leading-relaxed">
              <li>Cleaner wrapper. Bearer-token auth (<Mono>/api/token</Mono>).</li>
              <li>Best for reads: <Mono>shipment-by-order</Mono> (tracking, freight), <Mono>order/fees</Mono> (handling + freight).</li>
              <li>Endpoints are namespaced per client — confirm NI&apos;s namespace with Point B.</li>
            </ul>
          </Card>
        </div>
      </section>

      <p className="text-[11px] text-gray-400 pt-2 border-t border-gray-100">
        Established from read-only Fishbowl database forensics + the Synapse API docs, 2026-08-04. Nothing
        built for Point B yet — this is the plan of record.
      </p>
    </div>
  );
}
