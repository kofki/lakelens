import { describe, expect, it } from "vitest";
import { DEFAULT_FILTERS, type Filters, type Park, type ParkWithStatus } from "@/lib/types";
import {
  activeFilterCount,
  availableStates,
  describeParkKind,
  filterParks,
  groupParksByState,
  parkLocation,
} from "./parkListUtils";

/**
 * ParkWithStatus carries a dozen payloads these helpers never touch, so the fixture
 * builds only the fields under test and casts once.
 */
function park(name: string, state: string | null, guarded: "yes" | "no" = "no"): ParkWithStatus {
  return {
    park: { id: name.toLowerCase().replace(/\s+/g, "-"), name, state, guarded, lat: 0, lng: 0 },
    accessibility: null,
  } as unknown as ParkWithStatus;
}

const ITEMS = [
  park("Ludington", "MI"),
  park("Devils Lake", "WI", "yes"),
  park("Itasca", "mn"),
  park("Ichetucknee", "FL"),
  park("Higgins Lake", "MI"),
  park("Unplaced Pond", null),
  park("Elsewhere Pond", "ZZ"),
];

function filters(overrides: Partial<Filters> = {}): Filters {
  return { ...DEFAULT_FILTERS, ...overrides };
}

describe("filterParks state narrowing", () => {
  it("keeps only the chosen state, matching case-insensitively", () => {
    const out = filterParks(ITEMS, filters({ state: "MN" }));
    expect(out.map((i) => i.park.name)).toEqual(["Itasca"]);
  });

  it("drops parks with a missing or unknown state when a state is chosen", () => {
    const out = filterParks(ITEMS, filters({ state: "MI" }));
    expect(out.map((i) => i.park.name)).toEqual(["Ludington", "Higgins Lake"]);
  });

  it("keeps everything when no state is chosen", () => {
    expect(filterParks(ITEMS, filters())).toHaveLength(ITEMS.length);
  });

  it("stacks with the other filters and the search", () => {
    expect(filterParks(ITEMS, filters({ state: "WI", guardedOnly: true })).map((i) => i.park.name)).toEqual([
      "Devils Lake",
    ]);
    expect(filterParks(ITEMS, filters({ state: "MI" }), "higgins").map((i) => i.park.name)).toEqual(["Higgins Lake"]);
    expect(filterParks(ITEMS, filters({ state: "MI", guardedOnly: true }))).toEqual([]);
  });
});

describe("activeFilterCount", () => {
  it("counts the state as one active filter", () => {
    expect(activeFilterCount(filters())).toBe(0);
    expect(activeFilterCount(filters({ state: "MI" }))).toBe(1);
    expect(activeFilterCount(filters({ state: "MI", guardedOnly: true, accessibleEntry: true }))).toBe(3);
  });
});

describe("availableStates", () => {
  it("offers each state present once, by full name, alphabetically", () => {
    expect(availableStates(ITEMS)).toEqual([
      { code: "FL", name: "Florida" },
      { code: "MI", name: "Michigan" },
      { code: "MN", name: "Minnesota" },
      { code: "WI", name: "Wisconsin" },
    ]);
  });

  it("offers nothing for an empty list", () => {
    expect(availableStates([])).toEqual([]);
  });
});

describe("groupParksByState", () => {
  it("groups by full state name and keeps the incoming order inside each group", () => {
    const { groups } = groupParksByState(ITEMS);
    expect(groups.map((g) => g.name)).toEqual(["Florida", "Michigan", "Minnesota", "Wisconsin"]);
    expect(groups[1].items.map((i) => i.park.name)).toEqual(["Ludington", "Higgins Lake"]);
  });

  it("sets aside parks with no usable state instead of inventing a heading", () => {
    const { groups, ungrouped } = groupParksByState(ITEMS);
    expect(ungrouped.map((i) => i.park.name)).toEqual(["Unplaced Pond", "Elsewhere Pond"]);
    expect(groups.flatMap((g) => g.items)).toHaveLength(ITEMS.length - 2);
  });

  it("handles an empty list", () => {
    expect(groupParksByState([])).toEqual({ groups: [], ungrouped: [] });
  });
});

describe("parkLocation", () => {
  const park = (city: string | null, state: string | null) =>
    ({ city, state }) as Pick<Park, "city" | "state">;

  it("reads as a place you could drive to", () => {
    expect(parkLocation(park("Gainesville", "FL"))).toBe("Gainesville, FL");
  });

  it("falls back to the state when the town is unknown", () => {
    expect(parkLocation(park(null, "MI"))).toBe("MI");
  });

  it("refuses a town with no state, because most town names repeat", () => {
    expect(parkLocation(park("Springfield", null))).toBeNull();
    expect(parkLocation(park(null, null))).toBeNull();
  });
});

describe("describeParkKind", () => {
  const park = (over: Partial<Park> = {}) =>
    ({ type: "lake", operator: "county", city: null, state: null, ...over }) as Park;

  it("gives the second slot to the town", () => {
    expect(describeParkKind(park({ city: "Traverse City", state: "MI" }))).toBe("Lake · Traverse City, MI");
  });

  it("falls back to who runs it when there is no location at all", () => {
    expect(describeParkKind(park())).toBe("Lake · County park");
  });
});
