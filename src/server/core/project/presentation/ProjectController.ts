import { FileSystem, Path } from "@effect/platform";
import { Context, Effect, Layer } from "effect";
import type { ControllerResponse } from "../../../lib/effect/toEffectResponse.ts";
import type { InferEffect } from "../../../lib/effect/types.ts";
import { computeClaudeProjectFilePath } from "../../claude-code/functions/computeClaudeProjectFilePath.ts";
import { ClaudeCodeLifeCycleService } from "../../claude-code/services/ClaudeCodeLifeCycleService.ts";
import { ApplicationContext } from "../../platform/services/ApplicationContext.ts";
import { UserConfigService } from "../../platform/services/UserConfigService.ts";
import { computeSessionChains } from "../../session/functions/computeSessionChains.ts";
import { SessionRepository } from "../../session/infrastructure/SessionRepository.ts";
import { encodeProjectId } from "../functions/id.ts";
import { ProjectRepository } from "../infrastructure/ProjectRepository.ts";

const LayerImpl = Effect.gen(function* () {
  const projectRepository = yield* ProjectRepository;
  const claudeCodeLifeCycleService = yield* ClaudeCodeLifeCycleService;
  const userConfigService = yield* UserConfigService;
  const sessionRepository = yield* SessionRepository;
  const context = yield* ApplicationContext;
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;

  const getProjects = () =>
    Effect.gen(function* () {
      const { projects } = yield* projectRepository.getProjects();
      return {
        status: 200,
        response: { projects },
      } as const satisfies ControllerResponse;
    });

  const getProject = (options: { projectId: string; cursor?: string }) =>
    Effect.gen(function* () {
      const { projectId, cursor } = options;

      const userConfig = yield* userConfigService.getUserConfig();

      const { project } = yield* projectRepository.getProject(projectId);
      const { sessions } = yield* sessionRepository.getSessions(projectId, {
        cursor,
      });

      let filteredSessions = sessions;

      // Filter sessions based on hideNoUserMessageSession setting
      if (userConfig.hideNoUserMessageSession) {
        filteredSessions = filteredSessions.filter((session) => {
          return session.meta.firstUserMessage !== null;
        });
      }

      // Attach continuation-chain info (computed over ALL project sessions,
      // so part numbers stay correct regardless of pagination)
      const { summaries } = yield* sessionRepository.getSessionChainSummaries(projectId);
      const chains = computeSessionChains(summaries);
      const sessionsWithChain = filteredSessions.map((session) => ({
        ...session,
        chain: chains.get(session.id) ?? null,
      }));

      const hasMore = sessions.length >= 20;
      return {
        status: 200,
        response: {
          project,
          sessions: sessionsWithChain,
          nextCursor: hasMore ? sessions.at(-1)?.id : undefined,
        },
      } as const satisfies ControllerResponse;
    });

  const getProjectLatestSession = (options: { projectId: string }) =>
    Effect.gen(function* () {
      const { projectId } = options;
      const { sessions } = yield* sessionRepository.getSessions(projectId, {
        maxCount: 1,
      });

      return {
        status: 200,
        response: {
          latestSession: sessions[0] ?? null,
        },
      } as const satisfies ControllerResponse;
    });

  const createProject = (options: { projectPath: string }) =>
    Effect.gen(function* () {
      const { projectPath } = options;

      // No project validation needed - startTask will create a new project
      // if it doesn't exist when running /init command
      const claudeProjectFilePath = yield* computeClaudeProjectFilePath({
        projectPath,
        claudeProjectsDirPath: (yield* context.claudeCodePaths).claudeProjectsDirPath,
      });
      const projectId = encodeProjectId(claudeProjectFilePath);

      // Check if CLAUDE.md exists in the project directory
      const claudeMdPath = path.join(projectPath, "CLAUDE.md");
      const claudeMdExists = yield* fileSystem.exists(claudeMdPath);

      const result = yield* claudeCodeLifeCycleService.startSessionProcess({
        projectId,
        cwd: projectPath,
        sessionId: crypto.randomUUID(),
        resume: false,
        input: {
          text: claudeMdExists ? "describe this project" : "/init",
        },
      });

      const { sessionId } = result;

      return {
        status: 201,
        response: {
          projectId,
          sessionId,
        },
      } as const satisfies ControllerResponse;
    });

  return {
    getProjects,
    getProject,
    getProjectLatestSession,
    createProject,
  };
});

export type IProjectController = InferEffect<typeof LayerImpl>;
export class ProjectController extends Context.Tag("ProjectController")<
  ProjectController,
  IProjectController
>() {
  static Live = Layer.effect(this, LayerImpl);
}
