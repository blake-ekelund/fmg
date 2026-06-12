import { describe, it, expect } from "vitest";
import { buildUrl } from "../scraper";
import type { Competitor } from "../types";

function makeCompetitor(overrides: Partial<Competitor["request_config"]> = {}): Competitor {
  return {
    id: "c1",
    name: "Test",
    base_url: "https://api.example.com",
    endpoint_path: "/v1/locations",
    request_config: {
      method: "GET",
      latParam: "lat",
      lngParam: "lng",
      radiusParam: "radius",
      radiusValue: 100,
      radiusUnit: "mi",
      extraParams: {},
      headers: {},
      ...overrides,
    },
    response_config: {
      storesJsonPath: "",
      externalIdField: "id",
      fieldMappings: {},
    },
    rate_limit_ms: 2500,
    user_agent: "test",
    enabled: true,
    notes: null,
  };
}

describe("buildUrl", () => {
  it("includes lat/lng/radius params in the default (grid) mode", () => {
    const url = buildUrl(makeCompetitor(), { lat: 40.7, lng: -74 });
    expect(url).toBe("https://api.example.com/v1/locations?lat=40.7&lng=-74&radius=100");
  });

  it("omits lat/lng/radius params when singleCall is true", () => {
    const url = buildUrl(makeCompetitor({ singleCall: true }), { lat: 40.7, lng: -74 });
    expect(url).toBe("https://api.example.com/v1/locations");
  });

  it("still appends extraParams when singleCall is true", () => {
    const url = buildUrl(
      makeCompetitor({ singleCall: true, extraParams: { key: "abc" } }),
      { lat: 0, lng: 0 },
    );
    expect(url).toBe("https://api.example.com/v1/locations?key=abc");
  });
});
