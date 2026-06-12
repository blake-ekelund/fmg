import { describe, it, expect } from "vitest";
import { dedupStores } from "../dedup";
import type { StandardStore } from "../types";

function store(overrides: Partial<StandardStore> = {}): StandardStore {
  return {
    external_id: null,
    store_name: null,
    address: null,
    city: null,
    state: null,
    zip: null,
    country: null,
    phone: null,
    latitude: null,
    longitude: null,
    raw_json: null,
    ...overrides,
  };
}

describe("dedupStores", () => {
  it("keeps first occurrence when external_id matches", () => {
    const a = store({ external_id: "123", store_name: "A" });
    const b = store({ external_id: "123", store_name: "A-duplicate" });
    const c = store({ external_id: "456", store_name: "C" });
    const result = dedupStores([a, b, c]);
    expect(result).toHaveLength(2);
    expect(result[0].store_name).toBe("A");
  });

  it("falls back to lat/lng/name when external_id is absent", () => {
    const a = store({ store_name: "Acme Store", latitude: 40.1234567, longitude: -74.1234567 });
    const b = store({ store_name: "Acme Store", latitude: 40.1234567, longitude: -74.1234567 });
    const c = store({ store_name: "Other", latitude: 40.1234567, longitude: -74.1234567 });
    const result = dedupStores([a, b, c]);
    expect(result).toHaveLength(2);
  });

  it("does not collapse external_id with fallback-key matches", () => {
    const a = store({ external_id: "1", store_name: "X", latitude: 40, longitude: -74 });
    const b = store({ store_name: "X", latitude: 40, longitude: -74 });
    expect(dedupStores([a, b])).toHaveLength(2);
  });

  it("is case and whitespace insensitive on name fallback", () => {
    const a = store({ store_name: "Acme  Store", latitude: 40, longitude: -74 });
    const b = store({ store_name: "acme store", latitude: 40, longitude: -74 });
    expect(dedupStores([a, b])).toHaveLength(1);
  });
});
