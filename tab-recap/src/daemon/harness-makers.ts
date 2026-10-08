import { ClaudeHarness } from '#src/adapters/claude-harness.ts';
import { CodexHarness } from '#src/adapters/codex-harness.ts';
import { CustomHarness } from '#src/adapters/custom-harness.ts';
import { HermesHarness } from '#src/adapters/hermes-harness.ts';
import { OpencodeHarness } from '#src/adapters/opencode-harness.ts';
import type { Harness } from '#src/ports/harness.ts';
import type { BackendId } from '#src/recap/domain/backend.ts';
import type { Config } from './config.ts';

export type Make = (config: Config, work: string) => Harness;

export const MAKERS: Readonly<Record<BackendId, Make>> = {
    claude: (config, work) => new ClaudeHarness(work, config.timeoutMs),
    codex: (config, work) => new CodexHarness(work, config.timeoutMs),
    opencode: (config, work) => new OpencodeHarness(work, config.timeoutMs),
    hermes: (config, work) => new HermesHarness(work, config.timeoutMs),
    custom: (config, work) => new CustomHarness(config.customCommand, work, config.timeoutMs),
};
