"use client";

import { useState } from "react";
import { ExternalLink, RefreshCw, Maximize2, Minimize2 } from "lucide-react";

const THIRD_PARTY_SOURCES = [
  {
    id: "canva",
    name: "Canva",
    url: "https://www.canva.com",
    description: "Design platform for marketing assets",
    color: "bg-purple-100 text-purple-700",
  },
  {
    id: "google-drive",
    name: "Google Drive",
    url: "https://drive.google.com",
    description: "Shared team files and assets",
    color: "bg-blue-100 text-blue-700",
  },
  {
    id: "dropbox",
    name: "Dropbox",
    url: "https://www.dropbox.com",
    description: "Cloud storage for brand assets",
    color: "bg-sky-100 text-sky-700",
  },
  {
    id: "unsplash",
    name: "Unsplash",
    url: "https://unsplash.com",
    description: "Free high-quality stock photos",
    color: "bg-gray-100 text-gray-700",
  },
];

export default function ThirdPartyAssetsView() {
  const [activeSource, setActiveSource] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const source = THIRD_PARTY_SOURCES.find((s) => s.id === activeSource);

  if (source) {
    return (
      <div className="space-y-3">
        {/* Toolbar */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => setActiveSource(null)}
            className="text-xs text-gray-500 hover:text-gray-700 font-medium"
          >
            &larr; Back to sources
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setExpanded(!expanded)}
              className="p-1 rounded hover:bg-gray-100 text-gray-400"
              title={expanded ? "Collapse" : "Expand"}
            >
              {expanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
            </button>
            <a
              href={source.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium"
            >
              Open in new tab <ExternalLink size={11} />
            </a>
          </div>
        </div>

        {/* Embedded iframe */}
        <div
          className={`rounded-lg border border-gray-200 overflow-hidden transition-all duration-300 ${
            expanded ? "h-[600px]" : "h-[360px]"
          }`}
        >
          <iframe
            src={source.url}
            title={source.name}
            className="w-full h-full"
            sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-400">
        Browse third-party platforms directly from your dashboard
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {THIRD_PARTY_SOURCES.map((s) => (
          <button
            key={s.id}
            onClick={() => setActiveSource(s.id)}
            className="rounded-xl border border-gray-100 bg-gray-50 p-4 text-left hover:bg-gray-100 transition-colors group"
          >
            <div className="flex items-center gap-2.5 mb-1.5">
              <span
                className={`text-xs font-semibold px-2 py-0.5 rounded-full ${s.color}`}
              >
                {s.name}
              </span>
              <ExternalLink
                size={11}
                className="text-gray-300 group-hover:text-gray-500 transition-colors"
              />
            </div>
            <div className="text-xs text-gray-400">{s.description}</div>
          </button>
        ))}
      </div>
    </div>
  );
}
