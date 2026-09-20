import { describe, expect, it } from "vitest";
import { budgetFromArgv, createDeadline, DEFAULT_BUDGET_MS, requestTimeout, REQUEST_TIMEOUT_MS } from "./fetch-lib.ts";

describe("budgetFromArgv", () => {
  it("reads minutes", () => {
    expect(budgetFromArgv(["node", "s.ts", "--budget=5"])).toBe(5 * 60_000);
  });

  it("falls back on anything unparseable, rather than running with no ceiling", () => {
    for (const arg of ["--budget=", "--budget=abc", "--budget=0", "--budget=-3"]) {
      expect(budgetFromArgv(["node", "s.ts", arg])).toBe(DEFAULT_BUDGET_MS);
    }
    expect(budgetFromArgv(["node", "s.ts"])).toBe(DEFAULT_BUDGET_MS);
  });
});

describe("createDeadline", () => {
  it("is not expired while there is budget left", () => {
    const d = createDeadline(60_000);
    expect(d.expired()).toBe(false);
    expect(d.remaining()).toBeGreaterThan(0);
  });

  it("expires at once on a spent budget and never reports negative time", () => {
    const d = createDeadline(0);
    expect(d.expired()).toBe(true);
    expect(d.remaining()).toBe(0);
  });
});

describe("requestTimeout", () => {
  it("uses the per-request value when the run has plenty of budget", () => {
    expect(requestTimeout(createDeadline(10 * 60_000))).toBe(REQUEST_TIMEOUT_MS);
  });

  it("never outlives the run's own budget", () => {
    expect(requestTimeout(createDeadline(5_000))).toBeLessThanOrEqual(5_000);
  });

  it("keeps a floor, so a nearly spent run still makes a real attempt", () => {
    expect(requestTimeout(createDeadline(0))).toBe(1_000);
  });

  it("passes the value straight through with no deadline", () => {
    expect(requestTimeout(null, 7_000)).toBe(7_000);
  });
});
