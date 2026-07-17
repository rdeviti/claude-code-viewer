export type SessionChainSummary = {
  id: string;
  title: string | null;
  lastModifiedAt: string;
  messageCount: number;
  sizeBytes: number;
};

export type SessionChainPart = {
  sessionId: string;
  partNumber: number;
  lastModifiedAt: string;
  messageCount: number;
  sizeBytes: number;
};

export type SessionChainInfo = {
  title: string;
  partNumber: number;
  partCount: number;
  previousSessionId: string | null;
  nextSessionId: string | null;
  parts: SessionChainPart[];
};

/**
 * Groups sessions that share a (custom or AI generated) title into
 * continuation chains. Claude Code starts a new session file whenever a
 * conversation is continued past the context window, and the regenerated
 * title stays the same, so equal titles within a project identify the
 * parts of one long conversation. Parts are numbered chronologically by
 * last modification date, which is strictly increasing along a chain.
 */
export const computeSessionChains = (
  summaries: readonly SessionChainSummary[],
): Map<string, SessionChainInfo> => {
  const groups = new Map<string, SessionChainSummary[]>();
  for (const summary of summaries) {
    const title = summary.title?.trim();
    if (title === undefined || title === "") {
      continue;
    }
    const group = groups.get(title);
    if (group === undefined) {
      groups.set(title, [summary]);
    } else {
      group.push(summary);
    }
  }

  const chains = new Map<string, SessionChainInfo>();
  for (const [title, group] of groups) {
    if (group.length < 2) {
      continue;
    }
    const ordered = [...group].sort((a, b) =>
      a.lastModifiedAt === b.lastModifiedAt
        ? a.id.localeCompare(b.id)
        : a.lastModifiedAt.localeCompare(b.lastModifiedAt),
    );
    const parts = ordered.map((summary, index) => ({
      sessionId: summary.id,
      partNumber: index + 1,
      lastModifiedAt: summary.lastModifiedAt,
      messageCount: summary.messageCount,
      sizeBytes: summary.sizeBytes,
    }));
    ordered.forEach((summary, index) => {
      chains.set(summary.id, {
        title,
        partNumber: index + 1,
        partCount: ordered.length,
        previousSessionId: ordered[index - 1]?.id ?? null,
        nextSessionId: ordered[index + 1]?.id ?? null,
        parts,
      });
    });
  }
  return chains;
};
