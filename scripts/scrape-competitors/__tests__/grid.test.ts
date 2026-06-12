import { describe, it, expect } from "vitest";
import { generateGrid } from "../grid";

describe("generateGrid", () => {
  it("produces ~200-400 points for default CONUS + 100mi radius + 20% overlap", () => {
    const points = generateGrid();
    expect(points.length).toBeGreaterThanOrEqual(180);
    expect(points.length).toBeLessThanOrEqual(400);
  });

  it("all points fall inside the bounding box", () => {
    const bbox = { minLat: 30, maxLat: 45, minLng: -120, maxLng: -70 };
    const points = generateGrid({ bbox });
    for (const p of points) {
      expect(p.lat).toBeGreaterThanOrEqual(bbox.minLat);
      expect(p.lat).toBeLessThanOrEqual(bbox.maxLat);
      expect(p.lng).toBeGreaterThanOrEqual(bbox.minLng);
      expect(p.lng).toBeLessThanOrEqual(bbox.maxLng);
    }
  });

  it("tighter radius produces more points", () => {
    const wide = generateGrid({ radiusMiles: 200 });
    const tight = generateGrid({ radiusMiles: 50 });
    expect(tight.length).toBeGreaterThan(wide.length);
  });

  it("rejects invalid params", () => {
    expect(() => generateGrid({ radiusMiles: 0 })).toThrow();
    expect(() => generateGrid({ overlap: 1 })).toThrow();
    expect(() => generateGrid({ overlap: -0.1 })).toThrow();
  });
});
