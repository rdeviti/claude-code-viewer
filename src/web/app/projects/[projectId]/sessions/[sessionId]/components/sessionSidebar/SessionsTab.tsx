import { Trans } from "@lingui/react";
import { Link } from "@tanstack/react-router";
import { useAtomValue } from "jotai";
import { ChevronDownIcon, ChevronRightIcon, MessageSquareIcon, PlusIcon } from "lucide-react";
import { type FC, useEffect, useMemo, useRef, useState } from "react";
import { formatLocaleDate } from "@/lib/date/formatLocaleDate";
import { createVirtualSessionEntries } from "@/lib/virtual-messages/createVirtualSessionEntries";
import {
  removeVirtualMessage,
  virtualMessagesAtom,
} from "@/lib/virtual-messages/virtualMessageStore";
import { Badge } from "@/web/components/ui/badge";
import { Button } from "@/web/components/ui/button";
import { cn } from "@/web/utils";
import { useConfig } from "../../../../../../hooks/useConfig";
import { useProject } from "../../../../hooks/useProject";
import { resolveSessionTitle } from "../../../../services/firstCommandToTitle";
import { sessionProcessesAtom } from "../../store/sessionProcessesAtom";
import { type ChainPartItem, groupSessionsIntoChains } from "./groupSessionsIntoChains";

const formatBytes = (bytes: number) =>
  bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`;

// A transcript written to in the last two minutes is treated as live even when
// the session runs outside the viewer (e.g. in the Claude Code desktop app)
const RECENT_ACTIVITY_MS = 2 * 60 * 1000;
const isRecentlyActive = (lastModifiedAt: string) =>
  lastModifiedAt !== "" && Date.now() - new Date(lastModifiedAt).getTime() < RECENT_ACTIVITY_MS;

export const SessionsTab: FC<{
  currentSessionId: string;
  projectId: string;
  onSessionSelect?: () => void;
}> = ({ currentSessionId, projectId, onSessionSelect }) => {
  const {
    data: projectData,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useProject(projectId);
  const sessionProcesses = useAtomValue(sessionProcessesAtom);
  const virtualMessages = useAtomValue(virtualMessagesAtom);

  const sessions = useMemo(() => {
    const serverSessions = projectData.pages.flatMap((page) => page.sessions);
    const existingIds = new Set(serverSessions.map((s) => s.id));
    const virtualSessions = createVirtualSessionEntries(virtualMessages, projectId, existingIds);
    return [...serverSessions, ...virtualSessions];
  }, [projectData.pages, projectId, virtualMessages]);

  // Clean up virtual messages once the server session list includes them
  useEffect(() => {
    const serverIds = new Set(projectData.pages.flatMap((page) => page.sessions).map((s) => s.id));
    for (const vm of virtualMessages.values()) {
      if (vm.projectId === projectId && vm.isNewSession && serverIds.has(vm.sessionId)) {
        removeVirtualMessage(vm.sessionId);
      }
    }
  }, [projectData.pages, projectId, virtualMessages]);

  const { config } = useConfig();
  const activeSessionRef = useRef<HTMLAnchorElement>(null);

  // Scroll the active session into view when switching sessions.
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentionally fires on currentSessionId change only
  useEffect(() => {
    activeSessionRef.current?.scrollIntoView({
      block: "nearest",
      behavior: "smooth",
    });
  }, [currentSessionId]);
  const currentTab = "sessions";

  const isNewChatActive = currentSessionId === "";

  // Sort sessions: Running > Paused > Others, then by lastModifiedAt (newest first)
  const sortedSessions = useMemo(() => {
    // Define priority: running = 0, paused = 1, others = 2
    const getPriority = (status: "paused" | "running" | undefined) => {
      if (status === "running") return 0;
      if (status === "paused") return 1;
      return 2;
    };

    return [...sessions].sort((a, b) => {
      const aStatus = sessionProcesses.find((process) => process.sessionId === a.id)?.status;
      const bStatus = sessionProcesses.find((process) => process.sessionId === b.id)?.status;

      const aPriority = getPriority(aStatus);
      const bPriority = getPriority(bStatus);

      // First sort by priority
      if (aPriority !== bPriority) {
        return aPriority - bPriority;
      }

      // Then sort by lastModifiedAt (newest first)
      const aTime = a.lastModifiedAt ? new Date(a.lastModifiedAt).getTime() : 0;
      const bTime = b.lastModifiedAt ? new Date(b.lastModifiedAt).getTime() : 0;
      return bTime - aTime;
    });
  }, [sessions, sessionProcesses]);

  // Group continuation-chain parts (sessions sharing a title) under one entry
  const listItems = useMemo(() => groupSessionsIntoChains(sortedSessions), [sortedSessions]);

  const activeChainTitle = useMemo(() => {
    for (const item of listItems) {
      if (item.kind === "chain" && item.parts.some((p) => p.sessionId === currentSessionId)) {
        return item.chainTitle;
      }
    }
    return null;
  }, [listItems, currentSessionId]);

  const [expandedChains, setExpandedChains] = useState<Record<string, boolean>>({});
  const isChainExpanded = (chainTitle: string) =>
    expandedChains[chainTitle] ?? chainTitle === activeChainTitle;

  const renderChainPartRow = (part: ChainPartItem<(typeof sortedSessions)[number]>) => {
    const isActive = part.sessionId === currentSessionId;
    const status = sessionProcesses.find((process) => process.sessionId === part.sessionId)?.status;
    const isLive = status === "running" || isRecentlyActive(part.lastModifiedAt);

    return (
      <Link
        key={part.sessionId}
        ref={isActive ? activeSessionRef : undefined}
        to="/projects/$projectId/session"
        params={{ projectId }}
        search={{ tab: currentTab, sessionId: part.sessionId }}
        onClick={onSessionSelect}
        className={cn(
          "group relative flex items-center gap-2 rounded-lg p-2 transition-all duration-200 hover:bg-blue-50/60 dark:hover:bg-blue-950/40 hover:border-blue-300/60 dark:hover:border-blue-700/60 border border-sidebar-border/40 bg-sidebar/30",
          isActive &&
            "bg-blue-100 dark:bg-blue-900/50 border-blue-400 dark:border-blue-600 shadow-md ring-1 ring-blue-200/50 dark:ring-blue-700/50 hover:bg-blue-100 dark:hover:bg-blue-900/50",
        )}
      >
        <span className="w-5 shrink-0 font-mono text-xs tabular-nums text-sidebar-foreground/60">
          {String(part.partNumber).padStart(2, "0")}
        </span>
        <span className="flex min-w-14 shrink-0 items-center gap-1 whitespace-nowrap text-xs tabular-nums text-sidebar-foreground/70">
          <MessageSquareIcon className="w-3 h-3 shrink-0" />
          {part.messageCount}
        </span>
        <span className="min-w-12 shrink-0 whitespace-nowrap text-right text-[10px] tabular-nums text-sidebar-foreground/50">
          {formatBytes(part.sizeBytes)}
        </span>
        <span className="flex-1" />
        {isLive && (
          <span className="flex items-center gap-1 text-[10px] font-medium text-green-600 dark:text-green-400">
            <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
            <Trans id="chain.live" />
          </span>
        )}
        {!isLive && status === "paused" && (
          <span className="h-1.5 w-1.5 rounded-full bg-yellow-500" />
        )}
        {part.lastModifiedAt !== "" && (
          <span className="shrink-0 whitespace-nowrap text-xs tabular-nums text-sidebar-foreground/60">
            {formatLocaleDate(part.lastModifiedAt, {
              locale: config.locale,
              target: "time",
            })}
          </span>
        )}
      </Link>
    );
  };

  const renderSessionRow = (session: (typeof sortedSessions)[number]) => {
    const isActive = session.id === currentSessionId;
    const title = resolveSessionTitle(
      session.meta.customTitle,
      session.meta.firstUserMessage,
      session.id,
    );

    const sessionProcess = sessionProcesses.find((task) => task.sessionId === session.id);
    const isRunning = sessionProcess?.status === "running";
    const isPaused = sessionProcess?.status === "paused";

    return (
      <Link
        key={session.id}
        ref={isActive ? activeSessionRef : undefined}
        to="/projects/$projectId/session"
        params={{ projectId }}
        search={{ tab: currentTab, sessionId: session.id }}
        onClick={onSessionSelect}
        className={cn(
          "group relative block rounded-lg p-2.5 transition-all duration-200 hover:bg-blue-50/60 dark:hover:bg-blue-950/40 hover:border-blue-300/60 dark:hover:border-blue-700/60 hover:shadow-sm border border-sidebar-border/40 bg-sidebar/30",
          isActive &&
            "bg-blue-100 dark:bg-blue-900/50 border-blue-400 dark:border-blue-600 shadow-md ring-1 ring-blue-200/50 dark:ring-blue-700/50 hover:bg-blue-100 dark:hover:bg-blue-900/50 hover:border-blue-400 dark:hover:border-blue-600",
        )}
      >
        <div className="space-y-1.5">
          <div className="flex items-start gap-1.5 pr-6">
            <span aria-hidden className="w-3.5 shrink-0" />
            <h3 className="text-sm font-medium line-clamp-2 leading-tight text-sidebar-foreground flex-1 min-w-0">
              {title}
            </h3>
            {(isRunning || isPaused) && (
              <Badge
                variant={isRunning ? "default" : "secondary"}
                className={cn(
                  "text-xs shrink-0",
                  isRunning && "bg-green-500 text-white",
                  isPaused && "bg-yellow-500 text-white",
                )}
              >
                {isRunning ? (
                  <Trans id="session.status.running" />
                ) : (
                  <Trans id="session.status.paused" />
                )}
              </Badge>
            )}
          </div>
          <div className="flex items-center justify-between gap-2 pl-5">
            <div className="flex items-center gap-2 text-xs text-sidebar-foreground/70 min-w-0">
              <div className="flex items-center gap-1">
                <MessageSquareIcon className="w-3 h-3" />
                <span>{session.meta.messageCount}</span>
              </div>
            </div>
            {session.lastModifiedAt && (
              <span className="text-xs text-sidebar-foreground/60 shrink-0">
                {formatLocaleDate(session.lastModifiedAt, {
                  locale: config.locale,
                  target: "time",
                })}
              </span>
            )}
          </div>
        </div>
      </Link>
    );
  };

  return (
    <div className="h-full flex flex-col">
      <div className="border-b border-sidebar-border p-4">
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-semibold text-lg">
            <Trans id="sessions.title" />
          </h2>
        </div>
        <p className="text-xs text-sidebar-foreground/70">
          {sessions.length} <Trans id="sessions.total" />
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
        <Link
          to="/projects/$projectId/session"
          params={{ projectId }}
          search={{ tab: currentTab }}
          onClick={onSessionSelect}
          className={cn(
            "block rounded-lg p-2.5 transition-all duration-200 border-2 border-dashed border-sidebar-border/60 hover:border-blue-400/80 hover:bg-blue-50/50 dark:hover:bg-blue-950/40 bg-sidebar/10",
            isNewChatActive &&
              "bg-blue-100 dark:bg-blue-900/40 border-blue-400 dark:border-blue-500 shadow-sm",
          )}
        >
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
              <PlusIcon className="w-4 h-4" />
            </div>
            <div className="space-y-0.5">
              <p className="text-sm font-semibold text-sidebar-foreground">
                <Trans id="chat.modal.title" />
              </p>
            </div>
          </div>
        </Link>
        {listItems.map((item) => {
          if (item.kind === "single") {
            return renderSessionRow(item.session);
          }
          const totalSizeBytes = item.parts.reduce((sum, part) => sum + part.sizeBytes, 0);

          const expanded = isChainExpanded(item.chainTitle);
          const newestModifiedAt = item.parts.at(-1)?.lastModifiedAt;
          const chainIsRunning = item.parts.some(
            (p) =>
              sessionProcesses.find((process) => process.sessionId === p.sessionId)?.status ===
                "running" || isRecentlyActive(p.lastModifiedAt),
          );

          return (
            <div key={`chain:${item.chainTitle}`} className="rounded-lg">
              <button
                type="button"
                onClick={() =>
                  setExpandedChains((prev) => ({
                    ...prev,
                    [item.chainTitle]: !isChainExpanded(item.chainTitle),
                  }))
                }
                className={cn(
                  "w-full text-left rounded-lg p-2.5 transition-all duration-200 hover:bg-blue-50/60 dark:hover:bg-blue-950/40 border border-sidebar-border/40 bg-sidebar/30",
                  item.chainTitle === activeChainTitle &&
                    "border-blue-300/70 dark:border-blue-700/70",
                )}
              >
                <div className="space-y-1.5">
                  <div className="flex items-start gap-1.5">
                    {expanded ? (
                      <ChevronDownIcon className="w-3.5 h-3.5 mt-0.5 shrink-0 text-sidebar-foreground/60" />
                    ) : (
                      <ChevronRightIcon className="w-3.5 h-3.5 mt-0.5 shrink-0 text-sidebar-foreground/60" />
                    )}
                    <h3 className="text-sm font-medium line-clamp-2 leading-tight text-sidebar-foreground flex-1 min-w-0">
                      {item.chainTitle}
                    </h3>
                    {chainIsRunning && (
                      <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-green-500" />
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 pl-5">
                    <Badge
                      variant="outline"
                      className="text-[10px] h-4 px-1.5 shrink-0 bg-blue-100 text-blue-700 border-blue-300 dark:bg-blue-900/40 dark:text-blue-300 dark:border-blue-700"
                    >
                      <Trans id="chain.parts_count" values={{ count: item.partCount }} />
                    </Badge>
                    <span className="whitespace-nowrap text-[10px] text-sidebar-foreground/50">
                      {formatBytes(totalSizeBytes)}
                    </span>
                    <span className="flex-1" />
                    {newestModifiedAt !== undefined && newestModifiedAt !== "" && (
                      <span className="min-w-0 truncate text-xs tabular-nums text-sidebar-foreground/60">
                        {formatLocaleDate(newestModifiedAt, {
                          locale: config.locale,
                          target: "time",
                        })}
                      </span>
                    )}
                  </div>
                </div>
              </button>
              {expanded && (
                <div className="ml-3 mt-0.5 space-y-0.5 border-l border-sidebar-border/60 pl-2">
                  {item.parts.map((part) => renderChainPartRow(part))}
                </div>
              )}
            </div>
          );
        })}

        {/* Load More Button */}
        {hasNextPage === true && (
          <div className="p-2">
            <Button
              onClick={() => {
                void fetchNextPage();
              }}
              disabled={isFetchingNextPage}
              variant="outline"
              size="sm"
              className="w-full"
            >
              {isFetchingNextPage ? (
                <Trans id="common.loading" />
              ) : (
                <Trans id="sessions.load.more" />
              )}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};
