import { describe, expect, it } from "vitest";
import { SERVICE_ANIMAL_LABEL, summarizeServiceAnimals } from "./accessibility";

describe("summarizeServiceAnimals", () => {
  it("reads a plain welcome as yes", () => {
    expect(summarizeServiceAnimals("Service animals are welcome in all areas of Florida State Parks.")).toBe("yes");
    expect(summarizeServiceAnimals("Service animals are allowed in all public areas and buildings of the park.")).toBe("yes");
  });

  it("keeps the swimming-area exclusion, which is the part that matters", () => {
    expect(
      summarizeServiceAnimals(
        "Service animals are welcome in all areas of Florida State Parks; systemwide policy excludes animals from swimming areas.",
      ),
    ).toBe("not-in-water");
    expect(summarizeServiceAnimals("Service animals are not allowed in the swimming areas or on tubes (official).")).toBe(
      "not-in-water",
    );
  });

  it("does not let a pets ban read as a service-animal ban", () => {
    // Pets and service animals are different things in law and on these pages.
    expect(
      summarizeServiceAnimals("No dogs or pets in the park; service animals are permitted under Titles II and III of the ADA (official)."),
    ).toBe("yes");
  });

  it("says nothing when the note says nothing, so the row is dropped rather than guessed", () => {
    expect(summarizeServiceAnimals("No pets allowed; the park publishes no service-animal statement.")).toBeNull();
    expect(summarizeServiceAnimals("Dogs are allowed on District lands on a leash; no specific service-animal policy is published.")).toBeNull();
    expect(summarizeServiceAnimals(null)).toBeNull();
    expect(summarizeServiceAnimals("   ")).toBeNull();
  });

  it("labels each answer in the words a visitor needs", () => {
    expect(SERVICE_ANIMAL_LABEL.yes).toBe("Yes");
    expect(SERVICE_ANIMAL_LABEL["not-in-water"]).toBe("Yes, but not in the water");
    expect(SERVICE_ANIMAL_LABEL.no).toBe("No");
  });
});
