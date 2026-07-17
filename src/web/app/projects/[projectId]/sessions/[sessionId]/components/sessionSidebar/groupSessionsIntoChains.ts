import type { SessionChainInfo } from "@/server/core/session/functions/computeSessionChains";

type ChainAware = {
  id: string;
  chain?: SessionChainInfo | null;
};

export type ChainPartItem<S extends ChainAware> = {
  sessionId: string;
  partNumber: number;
  lastModifiedAt: string;
  messageCount: number;
  sizeBytes: number;
  /** Full session data when this part is among the loaded list pages */
  session: S | undefined;
};

export type SessionListItem<S extends ChainAware> =
  | { kind: "single"; session: S }
  | {
      kind: "chain";
      chainTitle: string;
      partCount: number;
      parts: ChainPartItem<S>[];
    };

/**
 * Collapses a (newest-first) session list into render items where the parts
 * of a continuation chain are grouped under one entry. A chain is placed at
 * the position of its newest loaded part and always lists ALL parts (from
 * the server-computed chain info), joined with full session data for the
 * parts that are loaded. Sessions without chain info pass through unchanged.
 */
export const groupSessionsIntoChains = <S extends ChainAware>(
  sessions: readonly S[],
): SessionListItem<S>[] => {
  const sessionById = new Map<string, S>();
  for (const session of sessions) {
    sessionById.set(session.id, session);
  }

  const emitted = new Set<string>();
  const items: SessionListItem<S>[] = [];
  for (const session of sessions) {
    const chain = session.chain;
    if (chain === undefined || chain === null) {
      items.push({ kind: "single", session });
      continue;
    }
    if (emitted.has(chain.title)) {
      continue;
    }
    emitted.add(chain.title);
    items.push({
      kind: "chain",
      chainTitle: chain.title,
      partCount: chain.partCount,
      parts: chain.parts.map((part) => ({
        sessionId: part.sessionId,
        partNumber: part.partNumber,
        lastModifiedAt: part.lastModifiedAt,
        messageCount: part.messageCount,
        sizeBytes: part.sizeBytes,
        session: sessionById.get(part.sessionId),
      })),
    });
  }
  return items;
};
