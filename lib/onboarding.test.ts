import { describe, expect, it } from "vitest";
import { readPromptChoice, shouldOfferLocation, writePromptChoice, LOCATION_PROMPT_KEY } from "./onboarding";

function memoryStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    read: (k: string) => map.get(k) ?? null,
  };
}

const throwing = {
  getItem() { throw new DOMException("blocked"); },
  setItem() { throw new DOMException("blocked"); },
};

describe("readPromptChoice", () => {
  it("reads a choice that was written", () => {
    const s = memoryStorage();
    writePromptChoice(s, "dismissed");
    expect(s.read(LOCATION_PROMPT_KEY)).toBe("dismissed");
    expect(readPromptChoice(s)).toBe("dismissed");
  });

  it("treats anything unrecognised as no choice", () => {
    expect(readPromptChoice(memoryStorage({ [LOCATION_PROMPT_KEY]: "yes-please" }))).toBeNull();
    expect(readPromptChoice(memoryStorage())).toBeNull();
  });

  it("survives a browser where storage throws, which is a private window", () => {
    expect(readPromptChoice(throwing)).toBeNull();
    expect(() => writePromptChoice(throwing, "asked")).not.toThrow();
  });

  it("survives having no storage at all, which is the server", () => {
    expect(readPromptChoice(null)).toBeNull();
    expect(() => writePromptChoice(undefined, "asked")).not.toThrow();
  });
});

describe("shouldOfferLocation", () => {
  it("offers on a first visit with nothing decided", () => {
    expect(shouldOfferLocation("idle", null)).toBe(true);
  });

  it("never offers twice", () => {
    expect(shouldOfferLocation("idle", "asked")).toBe(false);
    expect(shouldOfferLocation("idle", "dismissed")).toBe(false);
  });

  it("stays quiet once the browser has answered for itself", () => {
    for (const status of ["loading", "ready", "denied", "unavailable"]) {
      expect(shouldOfferLocation(status, null), status).toBe(false);
    }
  });
});

describe("the external store", () => {
  it("renders no prompt on the server, where nothing is known", async () => {
    const { getPromptChoiceServer, shouldOfferLocation: offer } = await import("./onboarding");
    expect(offer("idle", getPromptChoiceServer())).toBe(false);
  });

  it("notifies subscribers when a choice is made, and stops after unsubscribe", async () => {
    const { subscribePromptChoice, setPromptChoice, getPromptChoice } = await import("./onboarding");
    let calls = 0;
    const off = subscribePromptChoice(() => void (calls += 1));
    setPromptChoice("dismissed");
    expect(calls).toBe(1);
    expect(getPromptChoice()).toBe("dismissed");
    off();
    setPromptChoice("asked");
    expect(calls).toBe(1);
  });

  it("returns the same value twice, which React requires of a snapshot", async () => {
    const { getPromptChoice } = await import("./onboarding");
    expect(getPromptChoice()).toBe(getPromptChoice());
  });
});
