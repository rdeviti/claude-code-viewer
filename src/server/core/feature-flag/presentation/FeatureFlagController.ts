import { Context, Effect, Layer } from "effect";
import type { ControllerResponse } from "../../../lib/effect/toEffectResponse.ts";
import type { InferEffect } from "../../../lib/effect/types.ts";
import { ClaudeCodeService } from "../../claude-code/services/ClaudeCodeService.ts";
import { CcvOptionsService } from "../../platform/services/CcvOptionsService.ts";
import type { Flag } from "../models/flag.ts";

const LayerImpl = Effect.gen(function* () {
  const claudeCodeService = yield* ClaudeCodeService;
  const ccvOptionsService = yield* CcvOptionsService;

  const getFlags = () =>
    Effect.gen(function* () {
      const claudeCodeFeatures = yield* claudeCodeService.getAvailableFeatures();
      const terminalDisabled = yield* ccvOptionsService.getCcvOptions("terminalDisabled");

      return {
        response: {
          flags: [
            {
              name: "tool-approval",
              enabled: claudeCodeFeatures.canUseTool,
            },
            {
              name: "agent-sdk",
              enabled: claudeCodeFeatures.agentSdk,
            },
            {
              name: "sidechain-separation",
              enabled: claudeCodeFeatures.sidechainSeparation,
            },
            {
              name: "uuid-on-sdk-message",
              enabled: claudeCodeFeatures.uuidOnSDKMessage,
            },
            {
              name: "run-skills-directly",
              enabled: claudeCodeFeatures.runSkillsDirectly,
            },
            {
              name: "terminal",
              enabled: terminalDisabled !== true,
            },
          ] satisfies Flag[],
        },
        status: 200,
      } as const satisfies ControllerResponse;
    });

  return {
    getFlags,
  };
});

export type IFeatureFlagController = InferEffect<typeof LayerImpl>;
export class FeatureFlagController extends Context.Tag("FeatureFlagController")<
  FeatureFlagController,
  IFeatureFlagController
>() {
  static Live = Layer.effect(this, LayerImpl);
}
