import { describe, expect, it, vi } from "vitest";
import { PAGE_SIZE, selectAll } from "./queries";

/** A fake table of `total` rows that honours the range it is asked for. */
function table(total: number) {
  const calls: [number, number][] = [];
  const build = (from: number, to: number) => {
    calls.push([from, to]);
    const data = Array.from({ length: Math.max(Math.min(to, total - 1) - from + 1, 0) }, (_, i) => ({ i: from + i }));
    return Promise.resolve({ data, error: null });
  };
  return { build, calls };
}

describe("selectAll", () => {
  it("returns everything past the first page", async () => {
    const t = table(PAGE_SIZE * 2 + 43);
    const rows = await selectAll<{ i: number }>("t", t.build);
    expect(rows).toHaveLength(PAGE_SIZE * 2 + 43);
    expect(rows[rows.length - 1]!.i).toBe(PAGE_SIZE * 2 + 42);
    expect(t.calls).toHaveLength(3);
  });

  it("costs one request for a table under the limit", async () => {
    const t = table(10);
    expect(await selectAll("t", t.build)).toHaveLength(10);
    expect(t.calls).toHaveLength(1);
  });

  it("stops on an exactly full last page rather than looping forever", async () => {
    const t = table(PAGE_SIZE);
    expect(await selectAll("t", t.build)).toHaveLength(PAGE_SIZE);
    // One full page, then one empty page that ends it.
    expect(t.calls).toHaveLength(2);
  });

  it("asks for consecutive, non-overlapping ranges", async () => {
    const t = table(PAGE_SIZE + 1);
    await selectAll("t", t.build);
    expect(t.calls[0]).toEqual([0, PAGE_SIZE - 1]);
    expect(t.calls[1]).toEqual([PAGE_SIZE, PAGE_SIZE * 2 - 1]);
  });

  it("keeps the pages it already has when a later one fails", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    let call = 0;
    const rows = await selectAll<{ i: number }>("reviews", () => {
      call += 1;
      if (call > 1) return Promise.resolve({ data: null, error: { message: "boom" } });
      return Promise.resolve({ data: Array.from({ length: PAGE_SIZE }, (_, i) => ({ i })), error: null });
    });
    expect(rows).toHaveLength(PAGE_SIZE);
    warn.mockRestore();
  });

  it("fails loudly for a table the page cannot do without", async () => {
    await expect(
      selectAll("parks", () => Promise.resolve({ data: null, error: { message: "boom" } }), { required: true }),
    ).rejects.toThrow(/parks: boom/);
  });
});
