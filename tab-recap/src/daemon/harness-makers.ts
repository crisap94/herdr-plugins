import { noticing } from '#src/adapters/harness/confinement-notice.ts';
import { CustomHarnessPort } from '#src/adapters/harness/custom.ts';
import { LIBRARY_IDS, LibraryHarnessPort } from '#src/adapters/harness/library.ts';
import type { HarnessRuntime } from '#src/adapters/harness/library.ts';
import type { BackendHarness, LogLine } from '#src/ports/harness.ts';
import type { BackendId } from '@stateforge-labs/session-ledger';
import { fsPathOf } from '#src/recap/domain/fs-path.ts';
import { textOf } from '@stateforge-labs/session-ledger';
import { uncheckedMilliseconds } from '#src/recap/domain/ids.ts';
import type { Milliseconds } from '@stateforge-labs/session-ledger';
import type { Directory } from '@stateforge-labs/session-ledger';
import type { Settings } from './config.ts';
import { JOB_TAG_BY_CALL } from '#src/recap/domain/job-tag.ts';
import type { JobCall, JobTag } from '#src/recap/domain/job-tag.ts';

export const jobTagFor = (config: Pick<Settings, 'telemetryTags'>, call: JobCall): JobTag | undefined => config.telemetryTags === 'on' ? JOB_TAG_BY_CALL[call] : undefined;

export type Make = (config: Settings, work: Directory, runtime: HarnessRuntime, jobTag?: JobTag, log?: LogLine) => BackendHarness;

const timeoutOf = (config: Settings): Milliseconds => uncheckedMilliseconds(config.timeoutMs);

export const MAKERS: Readonly<Record<BackendId, Make>> = {
    claude: (config, _work, runtime, jobTag, log) => noticing(new LibraryHarnessPort(runtime, LIBRARY_IDS.claude, timeoutOf(config), jobTag, config.claudePolicyAck === 'on' ? 'acknowledged' : 'unacknowledged'), log),
    codex: (config, _work, runtime, jobTag, log) => noticing(new LibraryHarnessPort(runtime, LIBRARY_IDS.codex, timeoutOf(config), jobTag), log),
    opencode: (config, _work, runtime, jobTag, log) => noticing(new LibraryHarnessPort(runtime, LIBRARY_IDS.opencode, timeoutOf(config), jobTag), log),
    custom: (config, work) => new CustomHarnessPort(textOf(config.customCommand), fsPathOf(work), timeoutOf(config)),
};
