"use client";

import { Mail, Phone, Globe, MessageSquare, Package, FileText } from "lucide-react";

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
