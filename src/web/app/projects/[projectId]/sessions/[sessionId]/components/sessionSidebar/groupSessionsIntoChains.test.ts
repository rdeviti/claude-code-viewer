import { describe, expect, test } from "vitest";
import type {
  SessionChainInfo,
  SessionChainPart,
} from "@/server/core/session/functions/computeSessionChains";
import { groupSessionsIntoChains, type SessionListItem } from "./groupSessionsIntoChains.ts";

const part = (sessionId: string, partNumber: number): SessionChainPart => ({
  sessionId,
  partNumber,
  lastModifiedAt: `2026-07-0${partNumber}T00:00:00Z`,
  messageCount: partNumber * 10,
  sizeBytes: partNumber * 1024,
});

const chain = (title: string, partNumber: number, parts: SessionChainPart[]): SessionChainInfo => ({
  title,
  partNumber,
  partCount: parts.length,
  previousSessionId: null,
  nextSessionId: null,
  parts,
});

const asChain = <S extends { id: string; chain?: SessionChainInfo | null }>(
  item: SessionListItem<S> | undefined,
) => (item !== undefined && item.kind === "chain" ? item : undefined);

describe("groupSessionsIntoChains", () => {
  test("passes sessions without chain info through in order", () => {
    const items = groupSessionsIntoChains([
      { id: "a", chain: null },
      { id: "b", chain: null },
    ]);

    expect(items).toHaveLength(2);
    expect(items.at(0)).toStrictEqual({ kind: "single", session: { id: "a", chain: null } });
  });

  test("groups chain parts at the position of the newest loaded part", () => {
    const campaignParts = [part("p1", 1), part("p2", 2), part("p3", 3)];
    const items = groupSessionsIntoChains([
      { id: "p3", chain: chain("Campaign", 3, campaignParts) },
      { id: "x", chain: null },
      { id: "p1", chain: chain("Campaign", 1, campaignParts) },
      { id: "p2", chain: chain("Campaign", 2, campaignParts) },
    ]);

    expect(items).toHaveLength(2);
    const chainItem = asChain(items.at(0));
    expect(chainItem?.chainTitle).toBe("Campaign");
    expect(chainItem?.partCount).toBe(3);
    expect(chainItem?.parts.map((p) => p.sessionId)).toStrictEqual(["p1", "p2", "p3"]);
    expect(chainItem?.parts.map((p) => p.partNumber)).toStrictEqual([1, 2, 3]);
    expect(items.at(1)).toStrictEqual({ kind: "single", session: { id: "x", chain: null } });
  });

  test("keeps separate chains as separate groups", () => {
    const alphaParts = [part("a1", 1), part("a2", 2)];
    const betaParts = [part("b1", 1), part("b2", 2)];
    const items = groupSessionsIntoChains([
      { id: "a2", chain: chain("Alpha", 2, alphaParts) },
      { id: "b2", chain: chain("Beta", 2, betaParts) },
      { id: "a1", chain: chain("Alpha", 1, alphaParts) },
      { id: "b1", chain: chain("Beta", 1, betaParts) },
    ]);

    expect(items.map((item) => (item.kind === "chain" ? item.chainTitle : "single"))).toStrictEqual(
      ["Alpha", "Beta"],
    );
  });

  test("lists every part even when only some are loaded, joining loaded data", () => {
    const longParts = [part("p1", 1), part("p2", 2), part("p3", 3)];
    const items = groupSessionsIntoChains([{ id: "p3", chain: chain("Long", 3, longParts) }]);

    const chainItem = asChain(items.at(0));
    expect(chainItem?.parts).toHaveLength(3);
    expect(chainItem?.parts.map((p) => p.sessionId)).toStrictEqual(["p1", "p2", "p3"]);
    expect(chainItem?.parts.at(0)?.session).toBeUndefined();
    expect(chainItem?.parts.at(2)?.session?.id).toBe("p3");
  });
});
