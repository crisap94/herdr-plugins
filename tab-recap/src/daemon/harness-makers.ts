import { ClaudeHarness } from '#src/adapters/harness/claude.ts';
import { CodexHarness } from '#src/adapters/harness/codex.ts';
import { CustomHarness } from '#src/adapters/harness/custom.ts';
import { HermesHarness } from '#src/adapters/harness/hermes.ts';
import { OpencodeHarness } from '#src/adapters/harness/opencode.ts';
import type { Harness } from '#src/ports/harness.ts';
import type { BackendId } from '#src/recap/domain/backend.ts';
import type { Config } from './config.ts';
import { JOB_TAG_BY_CALL } from '#src/recap/domain/job-tag.ts';
import type { JobCall, JobTag } from '#src/recap/domain/job-tag.ts';

export const jobTagFor = (config: Pick<Config, 'telemetryTags'>, call: JobCall): JobTag | undefined => config.telemetryTags === 'on' ? JOB_TAG_BY_CALL[call] : undefined;

export type Make = (config: Config, work: string, jobTag?: JobTag) => Harness<BackendId>;

export const MAKERS: Readonly<Record<BackendId, Make>> = {
    claude: (config, work, jobTag) => new ClaudeHarness(work, config.timeoutMs, undefined, jobTag),
    codex: (config, work, jobTag) => new CodexHarness(work, config.timeoutMs, undefined, jobTag),
    opencode: (config, work) => new OpencodeHarness(work, config.timeoutMs),
    hermes: (config, work) => new HermesHarness(work, config.timeoutMs),
    custom: (config, work) => new CustomHarness(config.customCommand, work, config.timeoutMs),
};
