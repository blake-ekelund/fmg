import { describe, it, expect } from "vitest";
import { extractStoresArray, getPath, mapStore } from "../mapper";
import type { ResponseConfig } from "../types";

const config: ResponseConfig = {
  storesJsonPath: "data.locations",
  externalIdField: "id",
  fieldMappings: {
    store_name: "name",
    address: "address.street",
    city: "address.city",
    state: "address.state",
    zip: "address.postalCode",
    country: "address.country",
    phone: "phone",
    latitude: "coords.lat",
    longitude: "coords.lng",
  },
};

describe("getPath", () => {
  it("returns nested values via dotted paths", () => {
    expect(getPath({ a: { b: { c: 42 } } }, "a.b.c")).toBe(42);
  });

  it("returns null for missing or nullish branches", () => {
    expect(getPath(null, "a.b")).toBeNull();
    expect(getPath({ a: null }, "a.b")).toBeNull();
    expect(getPath({}, "missing")).toBeNull();
  });
});

describe("extractStoresArray", () => {
  it("navigates to nested stores array", () => {
    const raw = { data: { locations: [{ id: 1 }, { id: 2 }] } };
    expect(extractStoresArray(raw, config)).toHaveLength(2);
  });

  it("returns root when storesJsonPath is empty", () => {
    const arr = [{ id: 1 }];
    expect(
      extractStoresArray(arr, { ...config, storesJsonPath: "" }),
    ).toEqual(arr);
  });

  it("returns empty array when path does not resolve", () => {
    expect(extractStoresArray({}, config)).toEqual([]);
  });
});

describe("mapStore", () => {
  it("maps nested fields to the standard schema", () => {
    const raw = {
      id: "store-42",
      name: "Main Street",
      address: {
        street: "123 Main",
        city: "Smalltown",
        state: "MN",
        postalCode: "55401",
        country: "US",
      },
      phone: "555-1234",
      coords: { lat: 44.98, lng: -93.26 },
    };
    const mapped = mapStore(raw, config);
    expect(mapped).toMatchObject({
      external_id: "store-42",
      store_name: "Main Street",
      address: "123 Main",
      city: "Smalltown",
      state: "MN",
      zip: "55401",
      country: "US",
      phone: "555-1234",
      latitude: 44.98,
      longitude: -93.26,
    });
    expect(mapped.raw_json).toBe(raw);
  });

  it("coerces numeric strings to numbers for coordinates", () => {
    const raw = { id: "x", coords: { lat: "40.5", lng: "-74.25" } };
    const mapped = mapStore(raw, config);
    expect(mapped.latitude).toBe(40.5);
    expect(mapped.longitude).toBe(-74.25);
  });

  it("returns null for missing fields without throwing", () => {
    const mapped = mapStore({ id: "x" }, config);
    expect(mapped.store_name).toBeNull();
    expect(mapped.latitude).toBeNull();
  });

  it("splits Storepoint-style concatenated addresses when addressFormat is set", () => {
    const splitConfig: ResponseConfig = {
      storesJsonPath: "",
      externalIdField: "id",
      fieldMappings: { store_name: "name", address: "streetaddress", latitude: "loc_lat", longitude: "loc_long" },
      addressFormat: "street-city-state-zip-country",
    };
    const mapped = mapStore(
      {
        id: 42,
        name: "Banner's",
        streetaddress: "9650 Main St Ste 47, Fairfax, VA, 22031-3740, US",
        loc_lat: 38.84,
        loc_long: -77.27,
      },
      splitConfig,
    );
    expect(mapped.address).toBe("9650 Main St Ste 47");
    expect(mapped.city).toBe("Fairfax");
    expect(mapped.state).toBe("VA");
    expect(mapped.zip).toBe("22031-3740");
    expect(mapped.country).toBe("US");
  });

  it("handles addresses where the street itself contains commas", () => {
    const splitConfig: ResponseConfig = {
      storesJsonPath: "",
      externalIdField: "id",
      fieldMappings: { address: "streetaddress" },
      addressFormat: "street-city-state-zip-country",
    };
    const mapped = mapStore(
      { streetaddress: "123 Main St, Suite 400, Building A, Chicago, IL, 60601, US" },
      splitConfig,
    );
    expect(mapped.address).toBe("123 Main St, Suite 400, Building A");
    expect(mapped.city).toBe("Chicago");
    expect(mapped.state).toBe("IL");
    expect(mapped.zip).toBe("60601");
  });

  it("leaves address untouched when addressFormat is not set", () => {
    const mapped = mapStore(
      {
        id: 1,
        name: "X",
        address: { street: "1 Combined, Still, Raw, Text" },
        coords: { lat: 0, lng: 0 },
      },
      config,
    );
    expect(mapped.address).toBe("1 Combined, Still, Raw, Text");
    expect(mapped.city).toBeNull();
  });
});
