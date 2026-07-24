"use client";

import Link from "next/link";
import {
  Mail,
  Phone,
  Globe,
  MessageSquare,
  Package,
  FileText,
  Truck,
  Boxes,
  Tag,
  Megaphone,
  Sparkles,
  type PortalIcon,
} from "@/components/portal/icons";
import { portalHref } from "@/components/portal/api";

/**
 * Who a rep should contact, and for what.
 *
 * ⚠️ The addresses below are the ones that appear in the codebase's existing
 * notification routes — they are a starting point, not a confirmed rep-facing
 * contact list. Adjust the CONTACTS block before telling reps this page is live.
 */

const COMPANY = {
  name: "Fragrance Marketing Group",
  site: "fragrancemarketinggroup.com",
};

/**
 * The handful of things a rep most often needs from the office — the ones worth
 * a one-tap shortcut instead of composing an email from scratch. "Track an
 * order" jumps to the Orders page (where they can look it up themselves); the
 * rest open a pre-addressed email with the subject already filled in, and a
 * blank line for their agency so it routes fast.
 */
type QuickLink = {
  title: string;
  detail: string;
  icon: PortalIcon;
} & (
  | { kind: "internal"; href: string }
  | { kind: "email"; to: string; subject: string }
);

const QUICK_LINKS: QuickLink[] = [
  {
    kind: "internal",
    title: "Track an order",
    detail: "Check status, dates, and ship-to for any of your accounts.",
    icon: Truck,
    href: "/portal/orders",
  },
  {
    kind: "email",
    title: "Request samples",
    detail: "Testers and samples for a customer or a pitch.",
    icon: Package,
    to: `marketing@${COMPANY.site}`,
    subject: "Sample request",
  },
  {
    kind: "email",
    title: "Check stock",
    detail: "Availability or lead time on a product before you promise it.",
    icon: Boxes,
    to: `orders@${COMPANY.site}`,
    subject: "Stock / availability check",
  },
  {
    kind: "email",
    title: "Pricing & quotes",
    detail: "Volume pricing, a custom quote, or a program question.",
    icon: Tag,
    to: `info@${COMPANY.site}`,
    subject: "Pricing / quote request",
  },
  {
    kind: "email",
    title: "Marketing materials",
    detail: "Catalogs, displays, and point-of-sale for an account.",
    icon: Megaphone,
    to: `marketing@${COMPANY.site}`,
    subject: "Marketing materials request",
  },
  {
    kind: "email",
    title: "New products & launches",
    detail: "What's new, what's coming, and when you can sell it.",
    icon: Sparkles,
    to: `info@${COMPANY.site}`,
    subject: "New product / launch info",
  },
];

function quickLinkHref(l: QuickLink): string {
  if (l.kind === "internal") return portalHref(l.href);
  const body = `\n\n— \nAgency: `;
  return `mailto:${l.to}?subject=${encodeURIComponent(l.subject)}&body=${encodeURIComponent(body)}`;
}

const CONTACTS: {
  title: string;
  detail: string;
  email: string;
  icon: typeof Mail;
}[] = [
  {
    title: "Orders & fulfillment",
    detail: "Placing an order, checking status, shipping questions.",
    email: `orders@${COMPANY.site}`,
    icon: Package,
  },
  {
    title: "Samples & marketing materials",
    detail: "Catalogs, testers, display materials, brand assets.",
    email: `marketing@${COMPANY.site}`,
    icon: FileText,
  },
  {
    title: "Anything else",
    detail: "Account questions, pricing, or who to talk to.",
    email: `info@${COMPANY.site}`,
    icon: MessageSquare,
  },
];

export default function PortalContact() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-gray-900">
          Contact us
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          We&apos;re here to help — reach the right person faster.
        </p>
      </div>

      {/* Quick links — the common asks, one tap each. */}
      <div>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">
          Quick links
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {QUICK_LINKS.map((l) => {
            const Icon = l.icon;
            const inner = (
              <>
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
                  <Icon size={17} />
                </span>
                <span className="mt-3 block text-sm font-semibold text-gray-900">
                  {l.title}
                </span>
                <span className="mt-1 block text-sm text-gray-500">{l.detail}</span>
              </>
            );
            const cls =
              "group rounded-2xl border border-gray-200 bg-white p-4 transition hover:border-gray-300 hover:shadow-sm";
            return l.kind === "internal" ? (
              <Link key={l.title} href={quickLinkHref(l)} className={cls}>
                {inner}
              </Link>
            ) : (
              <a key={l.title} href={quickLinkHref(l)} className={cls}>
                {inner}
              </a>
            );
          })}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {CONTACTS.map((c) => {
          const Icon = c.icon;
          return (
            <a
              key={c.title}
              href={`mailto:${c.email}`}
              className="group rounded-2xl border border-gray-200 bg-white p-5 transition hover:border-gray-300 hover:shadow-sm"
            >
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-gray-50 text-gray-500">
                <Icon size={17} />
              </span>
              <h2 className="mt-3 text-sm font-semibold text-gray-900">
                {c.title}
              </h2>
              <p className="mt-1 text-sm text-gray-500">{c.detail}</p>
              <p className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-brand-700 group-hover:underline">
                <Mail size={13} />
                {c.email}
              </p>
            </a>
          );
        })}
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-gray-900">
          {COMPANY.name}
        </h2>
        <div className="mt-3 space-y-2 text-sm text-gray-600">
          <p className="flex items-center gap-2">
            <Globe size={14} className="shrink-0 text-gray-400" />
            <a
              href={`https://${COMPANY.site}`}
              target="_blank"
              rel="noreferrer"
              className="hover:underline"
            >
              {COMPANY.site}
            </a>
          </p>
          <p className="flex items-center gap-2">
            <Phone size={14} className="shrink-0 text-gray-400" />
            <span className="text-gray-400">
              Phone number to be added
            </span>
          </p>
        </div>
        <p className="mt-4 border-t border-gray-100 pt-4 text-xs text-gray-400">
          For account-specific questions, include your agency name so we can
          route you quickly.
        </p>
      </div>
    </div>
  );
}
