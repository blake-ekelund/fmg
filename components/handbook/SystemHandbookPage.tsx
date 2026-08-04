import {
  BookOpen,
  ShieldCheck,
  Server,
  Database,
  Warehouse,
  Code2,
  FileText,
  Clock,
  Contact,
  CheckCircle2,
  Circle,
  Route,
  ArrowRight,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

/**
 * System Handbook — a founder-facing orientation + "break glass" page. It exists
 * so a non-technical owner can see, in plain English, that the portal is fully
 * documented and that there's a specific place for a new developer to start if
 * the current one is unavailable. The exhaustive technical detail lives in the
 * code repository under /docs; this page is the higher-altitude companion (and
 * links to the in-app Technical Roadmap for in-flight work). Static content.
 */

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-2xl border border-gray-200 bg-white ${className}`}>{children}</div>;
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

/* Who-runs-what facts */
const STACK: { icon: LucideIcon; label: string; value: string; note: string }[] = [
  { icon: Server, label: "Hosting", value: "Vercel", note: "Runs the website; auto-deploys from the code repo." },
  { icon: Database, label: "Database & login", value: "Supabase", note: "The portal's own data and user accounts." },
  { icon: Warehouse, label: "Business data (ERP)", value: "Fishbowl", note: "Inventory and sales orders — the source of record." },
  { icon: Warehouse, label: "Fulfillment", value: "Point B Solutions", note: "The 3PL warehouse (Synapse) that ships orders." },
  { icon: Code2, label: "The code", value: "GitHub repository", note: "Every line of the portal, version-controlled." },
  { icon: FileText, label: "Full documentation", value: "/docs in the repo", note: "The technical handbook a new developer reads first." },
];

/* Systems in plain English */
const SYSTEMS: { name: string; blurb: string }[] = [
  { name: "Fishbowl", blurb: "The backbone. Holds inventory and sales orders; the portal syncs from it on a schedule." },
  { name: "Point B / Synapse", blurb: "The warehouse that physically ships orders. Sends tracking and freight back into Fishbowl." },
  { name: "Shopify", blurb: "Powers the Natural Inspirations store; feeds catalog and order analytics." },
  { name: "Faire", blurb: "Wholesale marketplace — orders flow in, shipments are confirmed back." },
  { name: "MarketTime", blurb: "A wholesale order channel — built, currently switched off until keys are set." },
  { name: "Email (Resend + Outlook)", blurb: "Marketing and automated email go out via Resend; rep 1:1 email via Outlook." },
  { name: "Slack", blurb: "An internal assistant bot that answers questions about company data." },
  { name: "Carrier tracking", blurb: "USPS / FedEx / UPS — used to know when a package is delivered." },
];

/* Friendly automation summary */
const AUTOMATIONS: { title: string; when: string; body: string }[] = [
  { title: "Inventory & sales refresh", when: "3×/day", body: "Pulls the latest stock and orders out of Fishbowl into the portal." },
  { title: "Storefront orders → Fishbowl", when: "every 15 min", body: "New website orders are entered into Fishbowl automatically as estimates." },
  { title: "Shipping & delivery emails", when: "hourly", body: "Watches for tracking, emails customers when an order ships and when it arrives." },
  { title: "Marketing email", when: "on schedule", body: "Sends automations and bulk campaigns, and keeps deliverability healthy." },
];

/* Documentation chapters (mirrors docs/README.md) */
const CHAPTERS: { name: string; done: boolean }[] = [
  { name: "Integrations — external systems & scheduled jobs", done: true },
  { name: "Architecture — app structure, roles, database", done: false },
  { name: "Email system — templates, automations, deliverability", done: false },
  { name: "Storefronts — Sassy & Natural Inspirations", done: false },
  { name: "Data model — key tables & Fishbowl views", done: false },
  { name: "Deployment — hosting, config, shipping safely", done: false },
];

/* Key contacts */
const CONTACTS: { role: string; who: string; detail?: string }[] = [
  { role: "Primary developer", who: "Blake Ekelund", detail: "Built and maintains the portal." },
  { role: "3PL / fulfillment (Point B)", who: "Keith Olsen", detail: "keith.olsen@pointbsolutions.com" },
  { role: "Hosting", who: "Vercel", detail: "Account owner holds the login." },
  { role: "Business data (ERP)", who: "Fishbowl", detail: "Vendor support for the ERP." },
];

export default function SystemHandbookPage() {
  return (
    <div className="px-4 md:px-8 py-6 md:py-8 max-w-[1000px] mx-auto space-y-8">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 text-gray-400 text-xs font-medium">
          <BookOpen size={14} />
          System Handbook
        </div>
        <h1 className="text-xl font-semibold text-gray-900 tracking-tight mt-1">
          How the portal works
        </h1>
        <p className="text-sm text-gray-500 mt-1 max-w-2xl">
          A plain-English overview of the systems behind Fragrance Marketing Group — and where to find
          everything, so whoever comes next can pick it up.
        </p>
      </div>

      {/* Reassurance callout */}
      <div className="rounded-2xl border border-emerald-100 bg-emerald-50/60 p-5">
        <div className="flex items-start gap-3">
          <div className="h-9 w-9 shrink-0 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center">
            <ShieldCheck size={17} />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-emerald-900">There is a plan, and it&apos;s written down.</h2>
            <p className="text-sm text-emerald-800/90 mt-1 leading-relaxed">
              The portal is documented in two places that stay with the business: the{" "}
              <strong>code repository</strong> (a full technical handbook under <code className="rounded bg-white/70 px-1 py-0.5 text-[12px]">/docs</code>)
              and these in-app pages. If the current developer is ever unavailable, a new one can open the
              repository, read the docs, and understand the whole system — what it does, how it&apos;s wired,
              and who to call. Nothing lives only in someone&apos;s head.
            </p>
          </div>
        </div>
      </div>

      {/* Who runs what */}
      <section className="space-y-3">
        <SectionHeader icon={Server} title="Who runs what" sub="The building blocks the portal sits on." />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {STACK.map((s) => (
            <Card key={s.label} className="p-4">
              <div className="flex items-center gap-2 text-gray-400">
                <s.icon size={15} />
                <span className="text-[11px] uppercase tracking-wide font-medium">{s.label}</span>
              </div>
              <div className="text-sm font-semibold text-gray-900 mt-1.5">{s.value}</div>
              <div className="text-xs text-gray-500 mt-1 leading-relaxed">{s.note}</div>
            </Card>
          ))}
        </div>
      </section>

      {/* Systems in plain English */}
      <section className="space-y-3">
        <SectionHeader icon={Route} title="The systems, in plain English" sub="What each connected service is for." />
        <Card className="divide-y divide-gray-100">
          {SYSTEMS.map((s) => (
            <div key={s.name} className="flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-4 px-4 py-3">
              <div className="text-sm font-medium text-gray-900 sm:w-52 shrink-0">{s.name}</div>
              <div className="text-xs text-gray-600 leading-relaxed">{s.blurb}</div>
            </div>
          ))}
        </Card>
      </section>

      {/* What happens automatically */}
      <section className="space-y-3">
        <SectionHeader icon={Clock} title="What happens automatically" sub="The portal runs these on its own, around the clock." />
        <div className="grid gap-3 sm:grid-cols-2">
          {AUTOMATIONS.map((a) => (
            <Card key={a.title} className="p-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-900">{a.title}</h3>
                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600">{a.when}</span>
              </div>
              <p className="text-xs text-gray-600 mt-1.5 leading-relaxed">{a.body}</p>
            </Card>
          ))}
        </div>
      </section>

      {/* Documentation chapters */}
      <section className="space-y-3">
        <SectionHeader
          icon={FileText}
          title="The full documentation"
          sub="Lives in the code repository under /docs — the technical detail for a developer."
        />
        <Card className="p-2">
          {CHAPTERS.map((c) => (
            <div key={c.name} className="flex items-center gap-3 px-3 py-2.5">
              {c.done ? (
                <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
              ) : (
                <Circle size={16} className="text-gray-300 shrink-0" />
              )}
              <span className={`text-sm ${c.done ? "text-gray-800" : "text-gray-500"}`}>{c.name}</span>
              {!c.done && <span className="text-[11px] text-gray-400 ml-auto">planned</span>}
            </div>
          ))}
        </Card>
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <ArrowRight size={13} />
          In-flight technical work is tracked on the{" "}
          <a href="/technical-roadmap" className="font-medium text-gray-700 underline underline-offset-2 hover:text-gray-900">
            Technical Roadmap
          </a>{" "}
          page.
        </div>
      </section>

      {/* Contacts */}
      <section className="space-y-3">
        <SectionHeader icon={Contact} title="Key contacts" sub="The first people to reach if something needs attention." />
        <Card className="divide-y divide-gray-100">
          {CONTACTS.map((c) => (
            <div key={c.role} className="flex flex-col sm:flex-row sm:items-center gap-0.5 sm:gap-4 px-4 py-3">
              <div className="text-[11px] uppercase tracking-wide text-gray-400 font-medium sm:w-56 shrink-0">{c.role}</div>
              <div className="text-sm text-gray-900 font-medium">{c.who}</div>
              {c.detail && <div className="text-xs text-gray-500 sm:ml-auto">{c.detail}</div>}
            </div>
          ))}
        </Card>
        <p className="text-[11px] text-gray-400">Keep this list current — it&apos;s the first thing someone reaches for.</p>
      </section>
    </div>
  );
}
