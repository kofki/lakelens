/**
 * tests/seed.test.ts: validates every data/*.json file against zod schemas that
 * mirror lib/types.ts, checks cross-file references (slugs, photos), and checks
 * the SQL generator (scripts/build-seed.ts) produces idempotent statements.
 */
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { REPORT_VALUES as CONTRACT_REPORT_VALUES } from "@/lib/types";
import type {
  AlertKind,
  CoverageTier,
  EntryType,
  Guarded,
  Operator,
  ParkType,
  ReportCategory,
  Surface,
  WaterAccess,
} from "@/lib/types";
import {
  ALERT_KINDS,
  COVERAGE_TIERS,
  DEEP_SLUGS,
  ENTRY_TYPES,
  GUARDED,
  OPERATORS,
  PARK_TYPES,
  REPORT_CATEGORIES,
  REPORT_VALUES,
  REPO_ROOT,
  SURFACES,
  WATER_ACCESS,
  alertHash,
  buildSeedSql,
  loadSeedData,
  sampleDeviceId,
  sqlJsonb,
  sqlLiteral,
  stripMetaKeys,
  validateReferences,
  AlertSeedSchema,
  SampleReportSeedSchema,
  type SeedData,
} from "@/scripts/build-seed";

const data: SeedData = loadSeedData(REPO_ROOT);
const bySlug = Object.fromEntries(data.deepParks.map((p) => [p.slug, p]));

describe("enum mirrors match lib/types.ts", () => {
  it("REPORT_VALUES is identical to the frozen contract", () => {
    expect(REPORT_VALUES).toEqual(CONTRACT_REPORT_VALUES);
  });
  it("string-union mirrors are exhaustive (compile-time check)", () => {
    // If lib/types.ts gains or loses a member these assignments stop compiling.
    const a: readonly ParkType[] = PARK_TYPES;
    const b: readonly Operator[] = OPERATORS;
    const c: readonly CoverageTier[] = COVERAGE_TIERS;
    const d: readonly Guarded[] = GUARDED;
    const e: readonly WaterAccess[] = WATER_ACCESS;
    const f: readonly EntryType[] = ENTRY_TYPES;
    const g: readonly Surface[] = SURFACES;
    const h: readonly AlertKind[] = ALERT_KINDS;
    const i: readonly ReportCategory[] = REPORT_CATEGORIES;
    const back: [ParkType, Operator, CoverageTier, Guarded, WaterAccess, EntryType, Surface, AlertKind, ReportCategory] = [
      "beach",
      "private",
      "deep",
      "unknown",
      "limited",
      "dock_ladder",
      "boardwalk",
      "nws",
      "accessibility",
    ];
    expect(a).toContain(back[0]);
    expect(b).toContain(back[1]);
    expect(c).toContain(back[2]);
    expect(d).toContain(back[3]);
    expect(e).toContain(back[4]);
    expect(f).toContain(back[5]);
    expect(g).toContain(back[6]);
    expect(h).toContain(back[7]);
    expect(i).toContain(back[8]);
  });
});

describe("data/*.json validate against the schemas", () => {
  it("loads every file without validation errors", () => {
    expect(data.deepParks.length).toBe(DEEP_SLUGS.length);
    // Every deep park is described; basic/extra packages add more.
    expect(Object.keys(data.accessibility).length).toBeGreaterThanOrEqual(DEEP_SLUGS.length);
    expect(data.lots.length).toBeGreaterThanOrEqual(7);
    expect(data.alerts.length).toBeGreaterThanOrEqual(5);
    expect(data.sampleReports.length).toBeGreaterThanOrEqual(8);
    expect(data.events.length).toBeGreaterThan(0);
  });

  it("has no cross-reference problems (slugs, photos, completeness)", () => {
    expect(validateReferences(data)).toEqual([]);
  });

  it("contains exactly the seven contract deep-park slugs", () => {
    expect(data.deepParks.map((p) => p.slug).sort()).toEqual([...DEEP_SLUGS].sort());
  });

  it("uses the agreed typical closure times (labelled as typical, never live)", () => {
    expect(bySlug["ichetucknee-springs-state-park"].typical_closure_time).toBe("10:00");
    expect(bySlug["rainbow-springs-state-park"].typical_closure_time).toBe("09:30");
    expect(bySlug["blue-spring-state-park"].typical_closure_time).toBe("10:00");
    expect(bySlug["gilchrist-blue-springs-state-park"].typical_closure_time).toBe("10:30");
    expect(bySlug["ginnie-springs"].typical_closure_time).toBeNull();
    expect(bySlug["poe-springs-park"].typical_closure_time).toBe("11:00");
    expect(bySlug["wekiwa-springs-state-park"].typical_closure_time).toBe("10:00");
  });

  it("encodes Blue Spring's manatee season as swim_season, others null", () => {
    expect(bySlug["blue-spring-state-park"].swim_season).toMatchObject({ open: "04-01", close: "11-14" });
    for (const slug of DEEP_SLUGS) {
      if (slug !== "blue-spring-state-park") expect(bySlug[slug].swim_season).toBeNull();
    }
  });

  it("has the verified USGS gauge mapping", () => {
    expect(bySlug["ichetucknee-springs-state-park"].usgs_site_id).toBe("02322700");
    expect(bySlug["ginnie-springs"].usgs_site_id).toBe("02322400");
    expect(bySlug["ginnie-springs"].river_gauge_site_id).toBe("02322500");
    expect(bySlug["poe-springs-park"].usgs_site_id).toBeNull();
    expect(bySlug["poe-springs-park"].river_gauge_site_id).toBe("02321975");
    expect(bySlug["gilchrist-blue-springs-state-park"].river_gauge_site_id).toBe("02322500");
    expect(bySlug["rainbow-springs-state-park"].usgs_site_id).toBe("02313098");
    expect(bySlug["blue-spring-state-park"].usgs_site_id).toBe("02235500");
    expect(bySlug["wekiwa-springs-state-park"].usgs_site_id).toBe("02234600");
    for (const p of data.deepParks) {
      expect(p.usgs_site_id ?? p.river_gauge_site_id, `${p.slug} needs some gauge`).toBeTruthy();
      expect(p.gauge_distance_km).not.toBeNull();
      expect(p.nws_grid).not.toBeNull();
      expect(p.nws_zone).toMatch(/^FLZ\d{3}$/);
      expect(p.nws_county).toMatch(/^FLC\d{3}$/);
    }
  });

  it("marks reservation parks correctly", () => {
    expect(bySlug["rainbow-springs-state-park"].reservation_required).toBe(true);
    expect(bySlug["blue-spring-state-park"].reservation_required).toBe(true);
    expect(bySlug["wekiwa-springs-state-park"].reservation_required).toBe(true);
    expect(bySlug["ichetucknee-springs-state-park"].reservation_required).toBe(false);
    for (const p of data.deepParks) {
      if (p.reservation_required) expect(p.reservation_url).toMatch(/^https:\/\/reserve\.floridastateparks\.org\//);
    }
  });

  it("every deep park has plain-language safety notes, sources and a description", () => {
    for (const p of data.deepParks) {
      expect(p.safety_notes, p.slug).toMatch(/lifeguard/i);
      expect(p.safety_notes, p.slug).toMatch(/72/);
      expect(p.description, p.slug).toBeTruthy();
      expect(p.sources.length, p.slug).toBeGreaterThanOrEqual(3);
      expect(p.official_url, p.slug).toMatch(/^https:\/\//);
    }
  });

  it("accessibility: verified rows cite an official source; unverified rows explain why", () => {
    for (const [slug, a] of Object.entries(data.accessibility)) {
      expect(a.sources.length, slug).toBeGreaterThan(0);
      expect(a.source, slug).toBeTruthy();
      if (!a.verified) expect(a.source, slug).toMatch(/no |not |inferred|only/i);
    }
    expect(data.accessibility["wekiwa-springs-state-park"]).toMatchObject({ water_access: "yes", entry_type: "ramp", verified: true });
    expect(data.accessibility["rainbow-springs-state-park"]).toMatchObject({ wheelchair_loaner: true, verified: true });
    expect(data.accessibility["poe-springs-park"].verified).toBe(false);
    expect(data.accessibility["ginnie-springs"].verified).toBe(false);
  });

  it("parking lots are curated and note approximate coordinates / renovations", () => {
    for (const l of data.lots) expect(l.source).toBe("curated");
    const rainbow = data.lots.filter((l) => l.park_slug === "rainbow-springs-state-park");
    expect(rainbow.some((l) => /Feb 4, 2027/.test(l.notes ?? ""))).toBe(true);
    const ich = data.lots.filter((l) => l.park_slug === "ichetucknee-springs-state-park");
    expect(ich.every((l) => /roadside/i.test(l.notes ?? ""))).toBe(true);
  });

  it("alerts: every closure is live, sourced and self-expiring; notices are not closures", () => {
    const closures = data.alerts.filter((a) => a.kind === "closure");
    // Gilchrist Blue and Poe are the long-running closures the demo relies on;
    // others (e.g. same-day capacity closures) may come and go.
    expect(closures.map((a) => a.park_slug)).toEqual(
      expect.arrayContaining(["gilchrist-blue-springs-state-park", "poe-springs-park"]),
    );
    for (const c of closures) {
      // Open-ended, or ending in the future: a closure that already ended must not still be active.
      if (c.ends_at !== null) expect(Date.parse(c.ends_at), c.park_slug).toBeGreaterThan(Date.now());
      expect(c.active).toBe(true);
      expect(c.official_url).toMatch(/^https:\/\//);
      expect(Date.parse(c.starts_at!)).toBeLessThan(Date.now());
    }
    for (const slug of ["gilchrist-blue-springs-state-park", "poe-springs-park"]) {
      expect(closures.find((c) => c.park_slug === slug)!.ends_at, slug).toBeNull();
    }
    expect(closures.find((c) => c.park_slug === "gilchrist-blue-springs-state-park")!.starts_at!.startsWith("2025-10-29")).toBe(true);
    expect(closures.find((c) => c.park_slug === "poe-springs-park")!.starts_at!.startsWith("2026-07-16")).toBe(true);
    const ichNotices = data.alerts.filter((a) => a.park_slug === "ichetucknee-springs-state-park");
    expect(ichNotices.length).toBe(2);
    expect(ichNotices.every((a) => a.kind === "notice")).toBe(true);
    const rainbow = data.alerts.find((a) => a.park_slug === "rainbow-springs-state-park")!;
    expect(rainbow.kind).toBe("notice");
    expect(rainbow.ends_at!.startsWith("2027-02-04")).toBe(true);
    for (const a of data.alerts) expect(a.source).toBe("manual");
  });

  it("sample reports match the demo script", () => {
    const ich = data.sampleReports.filter((r) => r.park_slug === "ichetucknee-springs-state-park");
    const turned = ich.filter((r) => r.value === "turned_away").map((r) => r.minutes_ago).sort((a, b) => a - b);
    expect(turned).toEqual([5, 12, 20]);
    expect(ich.some((r) => r.category === "parking" && r.value === "lot_full")).toBe(true);
    expect(data.sampleReports.find((r) => r.park_slug === "rainbow-springs-state-park")).toMatchObject({ value: "line", minutes_ago: 30 });
    expect(data.sampleReports.find((r) => r.park_slug === "blue-spring-state-park")).toMatchObject({ value: "got_in", minutes_ago: 15 });
    expect(data.sampleReports.find((r) => r.park_slug === "ginnie-springs")).toMatchObject({ value: "crowded", minutes_ago: 40 });
    expect(data.sampleReports.find((r) => r.park_slug === "wekiwa-springs-state-park")).toMatchObject({ value: "turned_away", minutes_ago: 8 });
    for (const r of data.sampleReports) expect(r.minutes_ago).toBeLessThan(120); // inside the 2 h report window
  });

  it("events: UF 2026 home games are Saturdays in Gainesville, spring break 2027 has weight 2", () => {
    const uf = data.events.filter((e) => /UF home football/.test(e.name));
    expect(uf.map((e) => e.start)).toEqual(["2026-09-05", "2026-09-12", "2026-09-26", "2026-10-10", "2026-11-07", "2026-11-21"]);
    for (const e of uf) {
      expect(e.start).toBe(e.end);
      expect(new Date(`${e.start}T12:00:00Z`).getUTCDay()).toBe(6);
    }
    const sb = data.events.find((e) => /Spring break/.test(e.name))!;
    expect(sb).toMatchObject({ start: "2027-03-13", weight: 2 });
    expect(data.events.some((e) => e.name.startsWith("Summer break") && e.start === "2026-06-01" && e.end === "2026-08-10")).toBe(true);
    expect(data.events.some((e) => /Labor Day/.test(e.name) && e.start === "2026-09-05")).toBe(true);
    expect(data.events.some((e) => /Memorial Day/.test(e.name))).toBe(true);
  });

  it("photos: every credited photo is PD/CC0/CC-BY (no share-alike) and the file exists", () => {
    for (const [slug, credit] of Object.entries(data.photos)) {
      expect(credit.license, slug).toMatch(/^(Public domain|CC0|CC BY \d\.\d)$/);
      expect(existsSync(resolve(REPO_ROOT, "public", credit.file.slice(1))), `${slug} file`).toBe(true);
    }
    for (const p of data.deepParks) expect(p.photo_url, p.slug).toBe(`/photos/${p.slug}.jpg`);
  });
});

describe("schema guards", () => {
  it("rejects a report value that does not belong to its category", () => {
    const bad = SampleReportSeedSchema.safeParse({ park_slug: "ginnie-springs", category: "entry", value: "lot_full", minutes_ago: 1 });
    expect(bad.success).toBe(false);
  });
  it("rejects an alert whose ends_at precedes starts_at", () => {
    const bad = AlertSeedSchema.safeParse({
      park_slug: "ginnie-springs",
      kind: "notice",
      text: "long enough text here",
      source: "manual",
      official_url: null,
      severity: null,
      starts_at: "2026-09-10T00:00:00Z",
      ends_at: "2026-09-01T00:00:00Z",
      active: true,
    });
    expect(bad.success).toBe(false);
  });
  it("stripMetaKeys drops _note and meta but keeps data keys", () => {
    expect(stripMetaKeys({ _note: "x", meta: {}, parks: [1] })).toEqual({ parks: [1] });
  });
});

describe("SQL generation", () => {
  const sql = buildSeedSql(data, { now: new Date("2026-09-19T12:00:00Z") });

  it("escapes strings, numbers, booleans, nulls and jsonb", () => {
    expect(sqlLiteral("Dampier's Landing")).toBe("'Dampier''s Landing'");
    expect(sqlLiteral(29.98389)).toBe("29.98389");
    expect(sqlLiteral(true)).toBe("true");
    expect(sqlLiteral(null)).toBe("null");
    expect(sqlJsonb({ a: "it's" })).toBe(`'{"a":"it''s"}'::jsonb`);
    expect(sqlJsonb(null)).toBe("null");
  });

  it("is idempotent: parks upsert on slug, child tables delete+insert scoped to seeded parks, sample reports refreshed", () => {
    expect(sql).toContain('on conflict ("slug") do update set');
    expect(sql).toContain("delete from public.accessibility where park_id in (select id from public.parks where slug in (");
    expect(sql).toContain("delete from public.parking_lots where source = 'curated' and park_id in (");
    expect(sql).toContain("delete from public.park_alerts where source = 'manual' and park_id in (");
    expect(sql).toContain("delete from public.reports where is_sample = true;");
    expect(sql).toContain("now() - interval '5 minutes'");
    expect(sql).not.toMatch(/delete from public\.park_alerts where park_id in/); // never wipes NWS alerts
    expect(sql).not.toMatch(/delete from public\.reports where park_id/); // never wipes real reports
  });

  it("inserts every deep park, lot, alert and sample report with is_sample = true", () => {
    for (const slug of DEEP_SLUGS) expect(sql).toContain(`'${slug}'`);
    expect((sql.match(/insert into public\.parking_lots/g) ?? []).length).toBe(data.lots.length);
    expect((sql.match(/insert into public\.park_alerts/g) ?? []).length).toBe(data.alerts.length);
    expect((sql.match(/insert into public\.reports/g) ?? []).length).toBe(data.sampleReports.length);
    expect((sql.match(/, true, now\(\) - interval/g) ?? []).length).toBe(data.sampleReports.length);
    expect((sql.match(/insert into public\.accessibility/g) ?? []).length).toBe(Object.keys(data.accessibility).length);
  });

  it("upserts holidays and long weekends when the DATA-basic file is present", () => {
    if (data.holidays) {
      expect(sql).toContain('on conflict ("date") do update set "name" = excluded."name"');
      expect((sql.match(/insert into public\.holidays/g) ?? []).length).toBe(data.holidays.holidays.length);
      expect((sql.match(/insert into public\.long_weekends/g) ?? []).length).toBe(data.holidays.long_weekends.length);
    } else {
      expect(sql).toContain("no holidays file");
    }
  });

  it("basic- and extra-tier parks never override a deep park", () => {
    const deep = new Set(data.deepParks.map((p) => p.slug));
    const extra = (data.extraParks ?? []).filter((p) => !deep.has(p.slug));
    const seen = new Set([...deep, ...extra.map((p) => p.slug)]);
    const basic = data.basicParks.filter((p) => !seen.has(p.slug));
    const upserts = (sql.match(/insert into public\.parks/g) ?? []).length;
    expect(upserts).toBe(data.deepParks.length + extra.length + basic.length);
    // Precedence: a slug promoted to deep keeps its deep record.
    for (const p of [...extra, ...basic]) expect(deep.has(p.slug), p.slug).toBe(false);
  });

  it("alert hashes and sample device ids are deterministic and well-formed", () => {
    const a = data.alerts[0];
    expect(alertHash(a)).toBe(alertHash({ ...a }));
    expect(alertHash(a)).toMatch(/^[0-9a-f]{40}$/);
    expect(new Set(data.alerts.map(alertHash)).size).toBe(data.alerts.length);
    expect(sampleDeviceId("x")).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(sampleDeviceId("x")).toBe(sampleDeviceId("x"));
    expect(sampleDeviceId("x")).not.toBe(sampleDeviceId("y"));
  });

  it("does not use unsafe constructs (no dollar-quoting, no backslash escapes, no transaction control)", () => {
    expect(sql).not.toMatch(/\$\$/);
    expect(sql).not.toMatch(/\bE'/);
    expect(sql).not.toMatch(/^\s*(begin|commit|rollback)\b/im);
  });

  it("the committed supabase/seed.sql was generated from the current deep-park data", () => {
    const committed = resolve(REPO_ROOT, "supabase/seed.sql");
    expect(existsSync(committed)).toBe(true);
    const text = readFileSync(committed, "utf8");
    expect(text.startsWith("-- ====")).toBe(true);
    expect(text).toContain("GENERATED by scripts/build-seed.ts");
    for (const slug of DEEP_SLUGS) expect(text).toContain(`'${slug}'`);
    for (const a of data.alerts) expect(text, `alert hash for ${a.park_slug}`).toContain(alertHash(a));
    expect(text).toContain("delete from public.reports where is_sample = true;");
  });
});
