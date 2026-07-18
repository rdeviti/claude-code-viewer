import { Trans } from "@lingui/react";
import { useMutation } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { useAtomValue } from "jotai";
import {
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronUpIcon,
  CopyIcon,
  DownloadIcon,
  EllipsisVertical as EllipsisVerticalIcon,
  GitBranchIcon,
  LoaderIcon,
  MenuIcon,
  MessageSquareIcon,
  PauseIcon,
  TrashIcon,
} from "lucide-react";
import { type FC, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useProjectSessionOptions } from "@/lib/atoms/sessionOptions";
import { parseUserMessage } from "@/lib/claude-code/parseUserMessage";
import { formatLocaleDate } from "@/lib/date/formatLocaleDate";
import { createVirtualSessionEntries } from "@/lib/virtual-messages/createVirtualSessionEntries";
import { virtualMessagesAtom } from "@/lib/virtual-messages/virtualMessageStore";
import type { CCOptionsSchema } from "@/server/core/claude-code/schema";
import { useConfig } from "@/web/app/hooks/useConfig";
import { getDefaultCCOptions } from "@/web/app/projects/[projectId]/components/chatForm/ccOptionsFormSchema";
import { InlineApprovalPanel } from "@/web/components/InlineApprovalPanel";
import { Badge } from "@/web/components/ui/badge";
import { Button } from "@/web/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/web/components/ui/popover";
import { usePermissionRequests } from "@/web/hooks/usePermissionRequests";
import { useQuestionRequests } from "@/web/hooks/useQuestionRequests";
import { useSchedulerJobs } from "@/web/hooks/useScheduler";
import { useTaskNotifications } from "@/web/hooks/useTaskNotifications";
import { honoClient } from "@/web/lib/api/client";
import { cn } from "@/web/utils";
import { useProject } from "../../../hooks/useProject";
import { resolveSessionTitle } from "../../../services/firstCommandToTitle";
import { useExportSession } from "../hooks/useExportSession";
import { useGitCurrentRevisions } from "../hooks/useGit";
import { useSession } from "../hooks/useSession";
import { useSessionProcess } from "../hooks/useSessionProcess";
import { sessionProcessesAtom } from "../store/sessionProcessesAtom";
import { ConversationList } from "./conversationList/ConversationList";
import { ChatActionMenu } from "./resumeChat/ChatActionMenu";
import { ContinueChat } from "./resumeChat/ContinueChat";
import { ResumeChat } from "./resumeChat/ResumeChat";
import { StartNewChat } from "./resumeChat/StartNewChat";
import { DeleteSessionDialog } from "./sessionSidebar/DeleteSessionDialog";
import { getSessionStatusBadgeProps } from "./sessionStatusBadge";

type SessionPageMainProps = {
  projectId: string;
  sessionId?: string;
  projectPath?: string;
  projectName: string;
  onMobileMenuOpen?: () => void;
};

type SessionData = ReturnType<typeof useSession>;

export const SessionPageMain: FC<SessionPageMainProps> = (props) => {
  if (props.sessionId === undefined || props.sessionId === "") {
    return (
      <SessionPageMainContent
        {...props}
        sessionData={null}
        onMobileMenuOpen={props.onMobileMenuOpen}
      />
    );
  }

  return <SessionPageMainWithData {...props} sessionId={props.sessionId} />;
};

const SessionPageMainWithData: FC<SessionPageMainProps & { sessionId: string }> = (props) => {
  const sessionData = useSession(props.projectId, props.sessionId);
  return (
    <SessionPageMainContent
      {...props}
      sessionId={props.sessionId}
      sessionData={sessionData}
      onMobileMenuOpen={props.onMobileMenuOpen}
    />
  );
};

const SessionPageMainContent: FC<
  SessionPageMainProps & {
    sessionId?: string;
    sessionData: SessionData | null;
  }
> = ({ projectId, sessionId, projectPath, projectName, sessionData, onMobileMenuOpen }) => {
  const navigate = useNavigate();
  const conversations = sessionData?.conversations;
  const conversationCount = conversations?.length ?? 0;
  const hasSessionId = sessionId !== undefined && sessionId !== "";
  const hasProjectPath = projectPath !== undefined && projectPath !== "";
  const emptyToolResult: SessionData["getToolResult"] = () => undefined;
  const getToolResult = sessionData?.getToolResult ?? emptyToolResult;
  const isExistingSession = hasSessionId && sessionData !== null && sessionData !== undefined;
  const { currentPermissionRequest, onPermissionResponse } = usePermissionRequests(sessionId);
  const { currentQuestionRequest, onQuestionResponse } = useQuestionRequests(sessionId);
  const { data: revisionsData } = useGitCurrentRevisions(projectId);
  const currentBranch =
    revisionsData?.success === true ? revisionsData.data.currentBranch?.name : undefined;
  const hasCurrentBranch = currentBranch !== undefined && currentBranch !== "";
  const exportSession = useExportSession();
  const { data: allSchedulerJobs } = useSchedulerJobs();
  const { data: projectData } = useProject(projectId);
  const sessionProcesses = useAtomValue(sessionProcessesAtom);
  const virtualMessages = useAtomValue(virtualMessagesAtom);
  const { config } = useConfig();
  const viewerOnly = config?.viewerOnly === true;

  // CC Options state - lifted here to share between ChatActionMenu and ChatInput
  const [savedOptions, setSavedOptions] = useProjectSessionOptions(projectId);
  const [ccOptions, setCCOptions] = useState<CCOptionsSchema | undefined>(() => ({
    ...getDefaultCCOptions(),
    ...(savedOptions.model !== undefined && savedOptions.model !== ""
      ? { model: savedOptions.model }
      : {}),
    ...(savedOptions.effort !== undefined ? { effort: savedOptions.effort } : {}),
    ...(savedOptions.permissionMode !== undefined
      ? { permissionMode: savedOptions.permissionMode }
      : {}),
    ...(savedOptions.useSystemPromptPreset === false ? { systemPrompt: "" } : {}),
  }));
  const handleCCOptionsChange = useCallback(
    (next: CCOptionsSchema | undefined) => {
      setCCOptions(next);
      setSavedOptions({
        model: next?.model,
        effort: next?.effort,
        permissionMode: next?.permissionMode,
        useSystemPromptPreset: next?.systemPrompt !== undefined && next?.systemPrompt !== "",
      });
    },
    [setSavedOptions],
  );

  // Merge virtual sessions (not yet persisted) into the session list
  const sessions = useMemo(() => {
    const serverSessions = projectData.pages.flatMap((page) => page.sessions);
    const existingIds = new Set(serverSessions.map((s) => s.id));
    const virtualSessions = createVirtualSessionEntries(virtualMessages, projectId, existingIds);
    return [...serverSessions, ...virtualSessions];
  }, [projectData.pages, projectId, virtualMessages]);

  const hasLocalCommandOutput = useMemo(
    () =>
      (conversations ?? []).some((conversation) => {
        if (conversation.type !== "user") {
          return false;
        }

        if (typeof conversation.message.content !== "string") {
          return false;
        }

        return parseUserMessage(conversation.message.content).kind === "local-command";
      }),
    [conversations],
  );

  const sortedSessions = useMemo(
    () =>
      [...sessions].sort((a, b) => {
        const aProcess = sessionProcesses.find((process) => process.sessionId === a.id);
        const bProcess = sessionProcesses.find((process) => process.sessionId === b.id);

        const aStatus = aProcess?.status;
        const bStatus = bProcess?.status;

        const getPriority = (status: "paused" | "running" | undefined) => {
          if (status === "running") return 0;
          if (status === "paused") return 1;
          return 2;
        };

        const aPriority = getPriority(aStatus);
        const bPriority = getPriority(bStatus);

        if (aPriority !== bPriority) {
          return aPriority - bPriority;
        }

        const aTime = a.lastModifiedAt ? new Date(a.lastModifiedAt).getTime() : 0;
        const bTime = b.lastModifiedAt ? new Date(b.lastModifiedAt).getTime() : 0;
        return bTime - aTime;
      }),
    [sessions, sessionProcesses],
  );

  const sessionProcess = useSessionProcess();
  const relatedSessionProcess = useMemo(() => {
    if (!hasSessionId) return undefined;
    return sessionProcess.getSessionProcess(sessionId);
  }, [hasSessionId, sessionId, sessionProcess]);

  const enableCCOptions = !relatedSessionProcess;

  const effectiveSessionStatus =
    relatedSessionProcess?.status === "running" && hasLocalCommandOutput
      ? "paused"
      : relatedSessionProcess?.status;
  const statusBadge = getSessionStatusBadgeProps(effectiveSessionStatus);

  useTaskNotifications(effectiveSessionStatus === "running", sessionId ?? "");

  // Filter scheduler jobs related to this session
  const sessionScheduledJobs = useMemo(() => {
    if (!hasSessionId || allSchedulerJobs === undefined) return [];
    return allSchedulerJobs.filter(
      (job) =>
        job.message.resume &&
        job.message.sessionId === sessionId &&
        job.message.projectId === projectId &&
        job.schedule.type === "reserved" &&
        job.lastRunStatus === null, // Only show jobs that haven't been executed yet
    );
  }, [allSchedulerJobs, hasSessionId, projectId, sessionId]);

  const [previousConversationLength, setPreviousConversationLength] = useState(0);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const scrollSettleRafIdRef = useRef<number | null>(null);
  const isNearBottomRef = useRef(true);
  const hadVirtualMessageRef = useRef(false);

  const scrollToBottomSettled = useCallback((frames: number) => {
    const scrollContainer = scrollContainerRef.current;
    if (scrollContainer === null) {
      return;
    }

    scrollContainer.scrollTo({ top: scrollContainer.scrollHeight, behavior: "auto" });

    if (frames <= 0) {
      scrollSettleRafIdRef.current = null;
      return;
    }

    scrollSettleRafIdRef.current = window.requestAnimationFrame(() => {
      scrollToBottomSettled(frames - 1);
    });
  }, []);

  const abortTask = useMutation({
    mutationFn: async (sessionProcessId: string) => {
      const response = await honoClient.api["claude-code"]["session-processes"][
        ":sessionProcessId"
      ].abort.$post({
        param: { sessionProcessId },
        json: { projectId },
      });

      if (!response.ok) {
        throw new Error(response.statusText);
      }

      return response.json();
    },
  });

  useEffect(() => {
    if (!isExistingSession) return;
    if (effectiveSessionStatus === "running" && conversationCount !== previousConversationLength) {
      if (!isNearBottomRef.current) {
        setPreviousConversationLength(conversationCount);
        return;
      }

      setPreviousConversationLength(conversationCount);
      scrollToBottomSettled(6);
    }
  }, [
    conversationCount,
    isExistingSession,
    effectiveSessionStatus,
    previousConversationLength,
    scrollToBottomSettled,
  ]);

  // In viewer-only mode a project lands directly on its most recent session
  useEffect(() => {
    if (!viewerOnly || hasSessionId) return;
    const latest = sortedSessions[0];
    if (latest === undefined) return;
    void navigate({
      to: "/projects/$projectId/session",
      params: { projectId },
      search: { tab: "sessions", sessionId: latest.id },
      replace: true,
    });
  }, [viewerOnly, hasSessionId, sortedSessions, navigate, projectId]);

  const handleScrollToTop = () => {
    const scrollContainer = scrollContainerRef.current;
    if (scrollContainer === null) {
      return;
    }

    scrollContainer.scrollTo({ top: 0, behavior: "auto" });
  };

  const handleScrollToBottom = () => {
    if (scrollSettleRafIdRef.current !== null) {
      window.cancelAnimationFrame(scrollSettleRafIdRef.current);
      scrollSettleRafIdRef.current = null;
    }
    scrollToBottomSettled(8);
  };

  useEffect(() => {
    return () => {
      if (scrollSettleRafIdRef.current !== null) {
        window.cancelAnimationFrame(scrollSettleRafIdRef.current);
      }
    };
  }, []);

  // Continuously track whether the user is near the bottom of the scroll container
  useEffect(() => {
    const scrollContainer = scrollContainerRef.current;
    if (scrollContainer === null) return;

    const handleScroll = () => {
      const distanceFromBottom =
        scrollContainer.scrollHeight - scrollContainer.scrollTop - scrollContainer.clientHeight;
      isNearBottomRef.current = distanceFromBottom <= 150;
    };

    scrollContainer.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      scrollContainer.removeEventListener("scroll", handleScroll);
    };
  }, []);

  // Auto-scroll to bottom when a virtual message is added (user sent a message)
  useEffect(() => {
    if (sessionId === undefined) return;
    const hasVirtualMessage = virtualMessages.has(sessionId);
    if (hasVirtualMessage && !hadVirtualMessageRef.current) {
      scrollToBottomSettled(6);
    }
    hadVirtualMessageRef.current = hasVirtualMessage;
  }, [virtualMessages, sessionId, scrollToBottomSettled]);

  // Esc key to abort running session
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (effectiveSessionStatus !== "running") return;
      if (!relatedSessionProcess) return;
      if (abortTask.isPending) return;

      const activeEl = document.activeElement;
      const tagName = activeEl?.tagName?.toLowerCase();
      if (
        tagName === "input" ||
        tagName === "textarea" ||
        activeEl?.getAttribute("contenteditable") === "true"
      ) {
        return;
      }

      abortTask.mutate(relatedSessionProcess.id);
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [effectiveSessionStatus, relatedSessionProcess, abortTask]);

  const sessionTitle = resolveSessionTitle(
    sessionData?.session.meta.customTitle ?? null,
    sessionData?.session.meta.firstUserMessage ?? null,
    sessionId ?? "",
  );

  // Continuation-chain navigation (sessions sharing a title form one long conversation)
  const chain = sessionData?.session.chain ?? null;
  const goToChainPart = useCallback(
    (partSessionId: string | null) => {
      if (partSessionId === null) return;
      void navigate({
        to: "/projects/$projectId/session",
        params: { projectId },
        search: { tab: "sessions", sessionId: partSessionId },
      });
    },
    [navigate, projectId],
  );

  const handleExportJsonl = () => {
    if (sessionData === null || sessionData === undefined || !hasSessionId) return;

    const safeSessionId = sessionId.replace(/[^a-zA-Z0-9._-]/g, "_") || "unknown";
    const jsonl = sessionData.conversations
      .map((conversation) => {
        if (conversation.type === "x-error") {
          return conversation.line;
        }

        return JSON.stringify(conversation);
      })
      .join("\n");

    const file = new File([jsonl], `ccv-jsonl-export-${safeSessionId}.jsonl`, {
      type: "application/x-ndjson",
    });
    const url = URL.createObjectURL(file);
    const link = document.createElement("a");
    link.href = url;
    link.download = file.name;
    link.rel = "noopener";
    link.target = "_self";
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    setTimeout(() => {
      URL.revokeObjectURL(url);
      link.remove();
    }, 1000);
  };

  const handleCopySessionFilePath = async () => {
    const sessionFilePath = sessionData?.session.jsonlFilePath;
    if (sessionFilePath === undefined || sessionFilePath === "") return;

    try {
      await navigator.clipboard.writeText(sessionFilePath);
      toast.success("Session file path copied");
    } catch (error) {
      console.error("Failed to copy session file path:", error);
      toast.error("Failed to copy session file path");
    }
  };

  let headerTitle: ReactNode = projectName ?? projectId;
  if (!isExistingSession) {
    headerTitle = <Trans id="chat.modal.title" />;
  } else if (hasSessionId) {
    headerTitle = sessionTitle;
  }

  return (
    <>
      <div className="flex-1 flex flex-col min-h-0 min-w-0">
        {/* Simplified Chat Header */}
        <header className="px-2 sm:px-3 py-1.5 sm:py-2 sticky top-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 w-full flex-shrink-0 min-w-0 border-b border-border/40">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              {onMobileMenuOpen && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="flex-shrink-0 h-7 w-7 p-0 md:hidden"
                  onClick={onMobileMenuOpen}
                  aria-label="Open menu"
                >
                  <MenuIcon className="w-4 h-4" />
                </Button>
              )}
              {statusBadge && (
                <Badge
                  variant="secondary"
                  className={cn("h-5 text-[10px] px-1.5 flex-shrink-0", statusBadge.className)}
                >
                  {statusBadge.icon === "running" ? (
                    <LoaderIcon className="w-2.5 h-2.5 mr-0.5 animate-spin" />
                  ) : (
                    <PauseIcon className="w-2.5 h-2.5 mr-0.5" />
                  )}
                  <Trans id={statusBadge.labelId} />
                </Badge>
              )}
              <h1 className="text-sm sm:text-base font-semibold break-all overflow-ellipsis line-clamp-1 min-w-0 text-foreground/90">
                {headerTitle}
              </h1>
              {chain !== null && (
                <div className="flex items-center gap-0.5 flex-shrink-0">
                  <Badge variant="outline" className="h-5 text-[10px] px-1.5 font-mono">
                    <Trans
                      id="chain.part_of"
                      values={{ n: chain.partNumber, m: chain.partCount }}
                    />
                  </Badge>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0"
                    disabled={chain.previousSessionId === null}
                    onClick={() => goToChainPart(chain.previousSessionId)}
                    aria-label="Previous part"
                  >
                    <ChevronLeftIcon className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0"
                    disabled={chain.nextSessionId === null}
                    onClick={() => goToChainPart(chain.nextSessionId)}
                    aria-label="Next part"
                  >
                    <ChevronRightIcon className="w-3.5 h-3.5" />
                  </Button>
                </div>
              )}
            </div>
            {isExistingSession && (
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="flex-shrink-0 h-7 w-7 p-0"
                    aria-label="Open session menu"
                  >
                    <EllipsisVerticalIcon className="w-4 h-4" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-80" align="end">
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                        Actions
                      </p>
                      <div className="grid gap-1.5">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="justify-start"
                          onClick={() => exportSession.mutate({ projectId, sessionId })}
                          disabled={exportSession.isPending}
                        >
                          <DownloadIcon
                            className={`w-4 h-4 mr-2 ${exportSession.isPending ? "animate-pulse" : ""}`}
                          />
                          <Trans id="session.menu.export_html" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="justify-start"
                          onClick={handleExportJsonl}
                        >
                          <DownloadIcon className="w-4 h-4 mr-2" />
                          <Trans id="session.menu.export_jsonl" />
                        </Button>
                        {sessionData?.session.jsonlFilePath !== undefined &&
                          sessionData.session.jsonlFilePath !== "" && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="justify-start"
                              onClick={() => {
                                void handleCopySessionFilePath();
                              }}
                            >
                              <CopyIcon className="w-4 h-4 mr-2" />
                              <Trans id="session.menu.copy_session_path" />
                            </Button>
                          )}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="justify-start text-destructive hover:text-destructive"
                          onClick={() => setIsDeleteDialogOpen(true)}
                        >
                          <TrashIcon className="w-4 h-4 mr-2" />
                          <Trans id="session.delete_dialog.title" />
                        </Button>
                      </div>
                    </div>
                    <div className="h-px bg-border/60" />
                    <div>
                      <h3 className="font-semibold text-sm mb-2">
                        <Trans id="control.metadata" />
                      </h3>
                      <div className="space-y-2">
                        {hasProjectPath && (
                          <div className="flex flex-col gap-1">
                            <span className="text-xs text-muted-foreground">
                              <Trans id="control.project_path" />
                            </span>
                            <Badge
                              variant="secondary"
                              className="h-7 text-xs flex items-center w-fit break-all"
                            >
                              {projectPath}
                            </Badge>
                          </div>
                        )}
                        {hasCurrentBranch && (
                          <div className="flex flex-col gap-1">
                            <span className="text-xs text-muted-foreground">
                              <Trans id="control.branch" />
                            </span>
                            <Badge
                              variant="secondary"
                              className="h-7 text-xs flex items-center gap-1 w-fit"
                            >
                              <GitBranchIcon className="w-3 h-3" />
                              {currentBranch}
                            </Badge>
                          </div>
                        )}
                        {isExistingSession && (
                          <div className="flex flex-col gap-1">
                            <span className="text-xs text-muted-foreground">
                              <Trans id="control.session_id" />
                            </span>
                            <Badge
                              variant="secondary"
                              className="h-7 text-xs flex items-center w-fit font-mono break-all"
                            >
                              {sessionId}
                            </Badge>
                          </div>
                        )}
                        {isExistingSession && (
                          <div className="flex flex-col gap-1">
                            <span className="text-xs text-muted-foreground">
                              <Trans id="control.model" />
                            </span>
                            <Badge
                              variant="secondary"
                              className="h-7 text-xs flex items-center w-fit font-mono"
                            >
                              {sessionData.session.meta.modelName ?? "Unknown"}
                            </Badge>
                          </div>
                        )}
                        {isExistingSession && (
                          <div className="flex flex-col gap-1">
                            <span className="text-xs text-muted-foreground">
                              <Trans id="session.cost.label" />
                            </span>
                            <div className="space-y-1.5">
                              <Badge
                                variant="secondary"
                                className="h-7 text-xs flex items-center w-fit font-semibold"
                              >
                                <Trans id="session.cost.total" />: $
                                {sessionData.session.meta.cost.totalUsd.toFixed(3)}
                              </Badge>
                              <div className="text-xs space-y-1 pl-2">
                                <div className="flex justify-between gap-4">
                                  <span className="text-muted-foreground">
                                    <Trans id="session.cost.input_tokens" />:
                                  </span>
                                  <span>
                                    $
                                    {sessionData.session.meta.cost.breakdown.inputTokensUsd.toFixed(
                                      3,
                                    )}{" "}
                                    (
                                    {sessionData.session.meta.cost.tokenUsage.inputTokens.toLocaleString()}
                                    )
                                  </span>
                                </div>
                                <div className="flex justify-between gap-4">
                                  <span className="text-muted-foreground">
                                    <Trans id="session.cost.output_tokens" />:
                                  </span>
                                  <span>
                                    $
                                    {sessionData.session.meta.cost.breakdown.outputTokensUsd.toFixed(
                                      3,
                                    )}{" "}
                                    (
                                    {sessionData.session.meta.cost.tokenUsage.outputTokens.toLocaleString()}
                                    )
                                  </span>
                                </div>
                                <div className="flex justify-between gap-4">
                                  <span className="text-muted-foreground">
                                    <Trans id="session.cost.cache_creation" />:
                                  </span>
                                  <span>
                                    $
                                    {sessionData.session.meta.cost.breakdown.cacheCreationUsd.toFixed(
                                      3,
                                    )}{" "}
                                    (
                                    {sessionData.session.meta.cost.tokenUsage.cacheCreationTokens.toLocaleString()}
                                    )
                                  </span>
                                </div>
                                <div className="flex justify-between gap-4">
                                  <span className="text-muted-foreground">
                                    <Trans id="session.cost.cache_read" />:
                                  </span>
                                  <span>
                                    $
                                    {sessionData.session.meta.cost.breakdown.cacheReadUsd.toFixed(
                                      3,
                                    )}{" "}
                                    (
                                    {sessionData.session.meta.cost.tokenUsage.cacheReadTokens.toLocaleString()}
                                    )
                                  </span>
                                </div>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
            )}
          </div>
        </header>

        <div
          ref={scrollContainerRef}
          className="flex-1 overflow-y-auto min-h-0 min-w-0"
          data-testid="scrollable-content"
        >
          <main className="w-full px-4 sm:px-6 md:px-8 lg:px-12 xl:px-16 relative min-w-0 pb-4">
            {isExistingSession && chain !== null && chain.previousSessionId !== null && (
              <div className="flex justify-center pt-3">
                <button
                  type="button"
                  onClick={() => goToChainPart(chain.previousSessionId)}
                  className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  <ChevronLeftIcon className="w-3 h-3" />
                  <Trans id="chain.continued_from" values={{ n: chain.partNumber - 1 }} />
                </button>
              </div>
            )}
            <ConversationList
              conversations={isExistingSession ? (conversations ?? []) : []}
              getToolResult={getToolResult}
              projectId={projectId}
              sessionId={sessionId ?? ""}
              scheduledJobs={sessionScheduledJobs}
              scrollContainerRef={scrollContainerRef}
              enableInPageSearch
            />
            {isExistingSession &&
              chain !== null &&
              chain.nextSessionId !== null &&
              effectiveSessionStatus !== "running" && (
                <div className="flex justify-center py-6">
                  <Button
                    variant="outline"
                    className="gap-2"
                    onClick={() => goToChainPart(chain.nextSessionId)}
                  >
                    <Trans
                      id="chain.continue_next"
                      values={{ n: chain.partNumber + 1, m: chain.partCount }}
                    />
                    <ChevronRightIcon className="w-4 h-4" />
                  </Button>
                </div>
              )}
            {!isExistingSession && (
              <div className="space-y-6">
                {!viewerOnly && (
                  <div className="rounded-2xl border border-dashed border-muted-foreground/40 bg-muted/30 p-8 text-center space-y-3">
                    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-background shadow-sm">
                      <MessageSquareIcon className="w-5 h-5 text-muted-foreground" />
                    </div>
                    <div className="space-y-1">
                      <p className="text-base font-semibold">
                        <Trans id="chat.modal.title" />
                      </p>
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        <Trans id="session.empty_state.description" />
                      </p>
                    </div>
                  </div>
                )}

                {/* Recent Sessions List */}
                {sortedSessions.length > 0 && (
                  <div className="space-y-3">
                    <h3 className="text-sm font-semibold text-muted-foreground">
                      <Trans id="chat.history.title" />
                    </h3>
                    <div className="grid gap-2">
                      {sortedSessions.slice(0, 3).map((session) => {
                        const title = resolveSessionTitle(
                          session.meta.customTitle,
                          session.meta.firstUserMessage,
                          session.id,
                        );

                        const sessionProcess = sessionProcesses.find(
                          (task) => task.sessionId === session.id,
                        );
                        const isRunning = sessionProcess?.status === "running";
                        const isPaused = sessionProcess?.status === "paused";

                        return (
                          <Link
                            key={session.id}
                            to="/projects/$projectId/session"
                            params={{ projectId }}
                            search={{ sessionId: session.id }}
                            className={cn(
                              "block p-3 rounded-lg transition-colors border",
                              "border-border/40 hover:bg-muted/50 hover:border-primary/30",
                            )}
                          >
                            <div className="flex items-start justify-between gap-2 mb-1 min-w-0">
                              <h4 className="text-sm font-medium line-clamp-1 flex-1 min-w-0 break-all">
                                {title}
                              </h4>
                              {(isRunning || isPaused) && (
                                <Badge
                                  variant="secondary"
                                  className={cn(
                                    "text-[10px] px-1.5 h-4 shrink-0",
                                    isRunning &&
                                      "bg-green-500/10 text-green-600 dark:text-green-400",
                                    isPaused &&
                                      "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400",
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
                            <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                              <div className="flex items-center gap-1">
                                <MessageSquareIcon className="w-2.5 h-2.5" />
                                <span>{session.meta.messageCount}</span>
                              </div>
                              {session.lastModifiedAt && (
                                <span>
                                  {formatLocaleDate(session.lastModifiedAt, {
                                    locale: config.locale,
                                    target: "time",
                                  })}
                                </span>
                              )}
                            </div>
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
            {isExistingSession && effectiveSessionStatus === "running" && (
              <div className="flex justify-start items-center py-8 animate-in fade-in duration-500">
                <div className="flex flex-col items-center gap-4">
                  <div className="relative">
                    <LoaderIcon className="w-8 h-8 animate-spin text-primary" />
                    <div className="absolute inset-0 rounded-full bg-primary/20 animate-ping" />
                  </div>
                  <p className="text-sm text-muted-foreground font-medium animate-pulse">
                    <Trans id="session.processing" />
                  </p>
                </div>
              </div>
            )}
          </main>
        </div>

        <InlineApprovalPanel
          permissionRequest={currentPermissionRequest}
          questionRequest={currentQuestionRequest}
          onPermissionResponse={onPermissionResponse}
          onQuestionResponse={onQuestionResponse}
        />

        {viewerOnly ? (
          <div className="flex justify-end gap-1 px-3 py-2">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              onClick={handleScrollToTop}
              aria-label="Scroll to top"
            >
              <ChevronUpIcon className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              onClick={handleScrollToBottom}
              aria-label="Scroll to bottom"
            >
              <ChevronDownIcon className="w-4 h-4" />
            </Button>
          </div>
        ) : (
          <>
            <div className="w-full pt-3">
              <ChatActionMenu
                projectId={projectId}
                onScrollToTop={handleScrollToTop}
                onScrollToBottom={handleScrollToBottom}
                sessionProcess={relatedSessionProcess}
                abortTask={abortTask}
                isNewChat={!isExistingSession}
                enableCCOptions={enableCCOptions}
                ccOptions={ccOptions}
                onCCOptionsChange={handleCCOptionsChange}
              />
            </div>

            <div className="flex-shrink-0 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
              {isExistingSession && relatedSessionProcess ? (
                <ContinueChat
                  projectId={projectId}
                  sessionId={sessionId}
                  sessionProcessId={relatedSessionProcess.id}
                  sessionProcessStatus={effectiveSessionStatus}
                />
              ) : isExistingSession ? (
                <ResumeChat
                  projectId={projectId}
                  sessionId={sessionId}
                  ccOptions={ccOptions}
                  onCCOptionsChange={handleCCOptionsChange}
                />
              ) : (
                <StartNewChat
                  projectId={projectId}
                  ccOptions={ccOptions}
                  onCCOptionsChange={handleCCOptionsChange}
                />
              )}
            </div>
          </>
        )}
      </div>

      {isExistingSession && (
        <DeleteSessionDialog
          open={isDeleteDialogOpen}
          onOpenChange={setIsDeleteDialogOpen}
          projectId={projectId}
          sessionId={sessionId}
          sessionTitle={sessionTitle}
          onSuccess={() => {
            void navigate({
              to: "/projects/$projectId/session",
              params: { projectId },
              search: { tab: "sessions" },
            });
          }}
        />
      )}
    </>
  );
};
