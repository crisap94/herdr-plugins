import { CustomHarness } from '#src/adapters/harness/custom.ts';
import { LIBRARY_IDS, LibraryHarness } from '#src/adapters/harness/library.ts';
import type { HarnessRuntime } from '#src/adapters/harness/library.ts';
import type { Harness } from '#src/ports/harness.ts';
import type { BackendId } from '#src/recap/domain/backend.ts';
import type { Config } from './config.ts';
import { JOB_TAG_BY_CALL } from '#src/recap/domain/job-tag.ts';
import type { JobCall, JobTag } from '#src/recap/domain/job-tag.ts';

export const jobTagFor = (config: Pick<Config, 'telemetryTags'>, call: JobCall): JobTag | undefined => config.telemetryTags === 'on' ? JOB_TAG_BY_CALL[call] : undefined;

export type Make = (config: Config, work: string, runtime: HarnessRuntime, jobTag?: JobTag) => Harness<BackendId>;

export const MAKERS: Readonly<Record<BackendId, Make>> = {
    claude: (config, _work, runtime, jobTag) => new LibraryHarness(runtime, LIBRARY_IDS.claude, config.timeoutMs, jobTag, config.claudePolicyAck === 'on'),
    codex: (config, _work, runtime, jobTag) => new LibraryHarness(runtime, LIBRARY_IDS.codex, config.timeoutMs, jobTag),
    opencode: (config, _work, runtime, jobTag) => new LibraryHarness(runtime, LIBRARY_IDS.opencode, config.timeoutMs, jobTag),
    custom: (config, work) => new CustomHarness(config.customCommand, work, config.timeoutMs),
};
