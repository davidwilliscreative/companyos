import { simulatedProvider } from "./simulated";
import type { AssistantProvider } from "./types";

/**
 * Provider selection. Phase one always uses the simulated provider; the
 * ClaudeProvider in ./claude-provider.ts documents the future server-side
 * implementation and reports itself unavailable.
 */
export function getAssistantProvider(): AssistantProvider {
  return simulatedProvider;
}
