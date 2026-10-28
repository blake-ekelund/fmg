/**
 * The PO header each vendor normally gets, copied from that vendor's most
 * recent (non-void) purchase order in Fishbowl: contact, remit-to, ship-to,
 * carrier, terms, FOB, buyer, QuickBooks class, location group and the
 * standing note (pallet size, box markings, Point B dock hours…).
 *
 * Copying the last real PO keeps each vendor's own pattern without hardcoding
 * it: Kapra ships finished goods to Point B; ingredient vendors mostly ship to
 * "FMG c/o Kapra Cosmetics". A vendor with no PO history falls back to the most
 * recent "FMG c/o Kapra Cosmetics" ship-to. Read-only.
 */

import { withFishbowl } from "@/lib/fishbowl";

export type PoHeader = {
  vendor: string;
  lastPoNum: string | null;
  vendorContact: string;
  remitToName: string;
  remitAddress: string;
  remitCity: string;
  remitState: string;
  remitZip: string;
  remitCountry: string;
  shipToName: string;
  deliverTo: string;
  shipToAddress: string;
  shipToCity: string;
  shipToState: string;
  shipToZip: string;
  shipToCountry: string;
  carrier: string;
  paymentTerms: string;
  shipTerms: string;
  fob: string;
  buyer: string;
  qbClass: string;
  locationGroup: string;
  phone: string;
  email: string;
  note: string;
};

export type PoDefaults = {
  vendors: Record<string, PoHeader>;
  /** Ship-to for a vendor we've never bought from (FMG c/o Kapra). */
  fallbackShipTo: Pick<PoHeader, "shipToName" | "deliverTo" | "shipToAddress" | "shipToCity" | "shipToState" | "shipToZip" | "shipToCountry" | "locationGroup" | "qbClass" | "buyer"> | null;
};

const SELECT = `
  SELECT v.name AS vendor, po.num AS num, po.vendorContact AS vendorContact,
         po.remitToName AS remitToName, po.remitAddress AS remitAddress, po.remitCity AS remitCity,
         rs.code AS remitState, po.remitZip AS remitZip, rc.name AS remitCountry,
         po.shipToName AS shipToName, po.deliverTo AS deliverTo, po.shipToAddress AS shipToAddress,
         po.shipToCity AS shipToCity, ss.code AS shipToState, po.shipToZip AS shipToZip, sc.name AS shipToCountry,
         c.name AS carrier, pt.name AS paymentTerms, st.name AS shipTerms, fp.name AS fob,
         po.buyer AS buyer, qb.name AS qbClass, lg.name AS locationGroup,
         po.phone AS phone, po.email AS email, po.note AS note
  FROM po
  JOIN vendor v ON v.id = po.vendorId
  LEFT JOIN stateconst rs ON rs.id = po.remitStateId
  LEFT JOIN countryconst rc ON rc.id = po.remitCountryId
  LEFT JOIN stateconst ss ON ss.id = po.shipToStateId
  LEFT JOIN countryconst sc ON sc.id = po.shipToCountryId
  LEFT JOIN carrier c ON c.id = po.carrierId
  LEFT JOIN paymentterms pt ON pt.id = po.paymentTermsId
  LEFT JOIN shipterms st ON st.id = po.shipTermsId
  LEFT JOIN fobpoint fp ON fp.id = po.fobPointId
  LEFT JOIN qbclass qb ON qb.id = po.qbClassId
  LEFT JOIN locationgroup lg ON lg.id = po.locationGroupId`;

const s = (v: unknown) => (v === null || v === undefined ? "" : String(v)).trim();

function toHeader(r: Record<string, unknown>): PoHeader {
  return {
    vendor: s(r.vendor),
    lastPoNum: s(r.num) || null,
    vendorContact: s(r.vendorContact),
    remitToName: s(r.remitToName),
    remitAddress: s(r.remitAddress),
    remitCity: s(r.remitCity),
    remitState: s(r.remitState),
    remitZip: s(r.remitZip),
    remitCountry: s(r.remitCountry),
    shipToName: s(r.shipToName),
    deliverTo: s(r.deliverTo),
    shipToAddress: s(r.shipToAddress),
    shipToCity: s(r.shipToCity),
    shipToState: s(r.shipToState),
    shipToZip: s(r.shipToZip),
    shipToCountry: s(r.shipToCountry),
    carrier: s(r.carrier),
    paymentTerms: s(r.paymentTerms),
    shipTerms: s(r.shipTerms),
    fob: s(r.fob),
    buyer: s(r.buyer),
    qbClass: s(r.qbClass),
    locationGroup: s(r.locationGroup),
    phone: s(r.phone),
    email: s(r.email),
    // Fishbowl stores a stray mis-encoded non-breaking space in some notes.
    note: s(r.note).replace(/Â\s/g, " "),
  };
}

let cache: { at: number; data: PoDefaults } | null = null;
const CACHE_MS = 10 * 60_000;

export async function loadPoDefaults(opts: { fresh?: boolean } = {}): Promise<PoDefaults> {
  if (!opts.fresh && cache && Date.now() - cache.at < CACHE_MS) return cache.data;
  const data = await withFishbowl(async (q) => {
    const latest = await q(`${SELECT}
      WHERE po.id IN (SELECT MAX(p2.id) FROM po p2 WHERE p2.statusId <> 80 GROUP BY p2.vendorId)`);
    const viaKapra = await q(`${SELECT}
      WHERE po.shipToName = 'FMG c/o Kapra Cosmetics' AND po.statusId <> 80
      ORDER BY po.id DESC LIMIT 1`);
    const vendors: Record<string, PoHeader> = {};
    for (const r of latest) {
      const h = toHeader(r);
      if (h.vendor) vendors[h.vendor] = h;
    }
    const f = viaKapra[0] ? toHeader(viaKapra[0]) : null;
    return {
      vendors,
      fallbackShipTo: f && {
        shipToName: f.shipToName,
        deliverTo: f.deliverTo,
        shipToAddress: f.shipToAddress,
        shipToCity: f.shipToCity,
        shipToState: f.shipToState,
        shipToZip: f.shipToZip,
        shipToCountry: f.shipToCountry,
        locationGroup: f.locationGroup,
        qbClass: f.qbClass,
        buyer: f.buyer,
      },
    };
  });
  cache = { at: Date.now(), data };
  return data;
}
