import { describe, expect, test } from "vitest";
import { computeSessionChains, type SessionChainSummary } from "./computeSessionChains.ts";

const summary = (
  id: string,
  title: string | null,
  lastModifiedAt: string,
  messageCount = 10,
  sizeBytes = 1024,
): SessionChainSummary => ({ id, title, lastModifiedAt, messageCount, sizeBytes });

describe("computeSessionChains", () => {
  test("numbers same-title sessions chronologically and links neighbors", () => {
    const chains = computeSessionChains([
      summary("c", "Long campaign", "2026-07-03T00:00:00Z", 30, 3000),
      summary("a", "Long campaign", "2026-07-01T00:00:00Z", 10, 1000),
      summary("b", "Long campaign", "2026-07-02T00:00:00Z", 20, 2000),
    ]);

    const expectedParts = [
      {
        sessionId: "a",
        partNumber: 1,
        lastModifiedAt: "2026-07-01T00:00:00Z",
        messageCount: 10,
        sizeBytes: 1000,
      },
      {
        sessionId: "b",
        partNumber: 2,
        lastModifiedAt: "2026-07-02T00:00:00Z",
        messageCount: 20,
        sizeBytes: 2000,
      },
      {
        sessionId: "c",
        partNumber: 3,
        lastModifiedAt: "2026-07-03T00:00:00Z",
        messageCount: 30,
        sizeBytes: 3000,
      },
    ];
    expect(chains.get("a")).toStrictEqual({
      title: "Long campaign",
      partNumber: 1,
      partCount: 3,
      previousSessionId: null,
      nextSessionId: "b",
      parts: expectedParts,
    });
    expect(chains.get("b")?.partNumber).toBe(2);
    expect(chains.get("b")?.previousSessionId).toBe("a");
    expect(chains.get("b")?.nextSessionId).toBe("c");
    expect(chains.get("c")).toStrictEqual({
      title: "Long campaign",
      partNumber: 3,
      partCount: 3,
      previousSessionId: "b",
      nextSessionId: null,
      parts: expectedParts,
    });
  });

  test("excludes sessions with a unique title", () => {
    const chains = computeSessionChains([
      summary("a", "One-off session", "2026-07-01T00:00:00Z"),
      summary("b", "Another topic", "2026-07-02T00:00:00Z"),
    ]);

    expect(chains.size).toBe(0);
  });

  test("excludes sessions without a title", () => {
    const chains = computeSessionChains([
      summary("a", null, "2026-07-01T00:00:00Z"),
      summary("b", null, "2026-07-02T00:00:00Z"),
      summary("c", "   ", "2026-07-03T00:00:00Z"),
    ]);

    expect(chains.size).toBe(0);
  });

  test("keeps distinct chains separate", () => {
    const chains = computeSessionChains([
      summary("a1", "Alpha", "2026-07-01T00:00:00Z"),
      summary("b1", "Beta", "2026-07-02T00:00:00Z"),
      summary("a2", "Alpha", "2026-07-03T00:00:00Z"),
      summary("b2", "Beta", "2026-07-04T00:00:00Z"),
    ]);

    expect(chains.get("a2")?.partCount).toBe(2);
    expect(chains.get("a2")?.previousSessionId).toBe("a1");
    expect(chains.get("b1")?.nextSessionId).toBe("b2");
  });

  test("breaks ties in modification date deterministically by id", () => {
    const chains = computeSessionChains([
      summary("b", "Tied", "2026-07-01T00:00:00Z"),
      summary("a", "Tied", "2026-07-01T00:00:00Z"),
    ]);

    expect(chains.get("a")?.partNumber).toBe(1);
    expect(chains.get("b")?.partNumber).toBe(2);
  });
});
