import { describe, expect, it } from "vitest";
import { compactPhotoUrl, expandPhotoUrl } from "./photoUrl";

const REAL =
  "https://thumb.wikimedia.org/wikipedia/commons/thumb/7/79/Honokohau_bay_%2846226617312%29.jpg/1280px-Honokohau_bay_%2846226617312%29.jpg";

describe("compactPhotoUrl", () => {
  it("round-trips a Commons thumbnail", () => {
    const short = compactPhotoUrl(REAL)!;
    expect(short.length).toBeLessThan(REAL.length / 2);
    expect(expandPhotoUrl(short)).toBe(REAL);
  });

  it("leaves a local photo alone", () => {
    expect(compactPhotoUrl("/photos/blue-spring.jpg")).toBe("/photos/blue-spring.jpg");
    expect(expandPhotoUrl("/photos/blue-spring.jpg")).toBe("/photos/blue-spring.jpg");
  });

  it("leaves any other host alone", () => {
    const other = "https://upload.wikimedia.org/wikipedia/commons/7/79/Name.jpg";
    expect(compactPhotoUrl(other)).toBe(other);
  });

  it("refuses to compact a thumbnail at a width it cannot rebuild", () => {
    const odd = "https://thumb.wikimedia.org/wikipedia/commons/thumb/7/79/Name.jpg/800px-Name.jpg";
    expect(compactPhotoUrl(odd)).toBe(odd);
  });

  it("handles nothing at all", () => {
    expect(compactPhotoUrl(null)).toBeNull();
    expect(expandPhotoUrl(undefined)).toBeNull();
  });

  it("returns null for a compact value that is malformed, rather than a broken URL", () => {
    expect(expandPhotoUrl("c:7/79")).toBeNull();
  });
});
