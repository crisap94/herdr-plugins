import type { PolicyNotice, Runtime } from '@stateforge-labs/harness-adapters/runtime';
import { fakeRuntime as libraryFake } from '@stateforge-labs/harness-adapters/testing';
import type { FakeRuntime, FakeRuntimeOptions } from '@stateforge-labs/harness-adapters/testing';
import { CustomHarnessPort } from '#src/adapters/harness/custom.ts';
import { LibraryHarnessPort } from '#src/adapters/harness/library.ts';
import type { HarnessRuntime, LibraryId } from '#src/adapters/harness/library.ts';
import type { BackendHarness, HarnessAsk, HarnessChoice } from '#src/ports/harness.ts';
import type { Effort } from '#src/recap/domain/effort.ts';
import type { JobTag } from '#src/recap/domain/job-tag.ts';
import { fsPathOf } from '#src/recap/domain/fs-path.ts';
import { textOf } from '#src/recap/domain/text.ts';
import { uncheckedMilliseconds } from '#src/recap/domain/ids.ts';

export { fakeOutput } from '@stateforge-labs/harness-adapters/testing';

export type PolicedRuntime = FakeRuntime & Pick<Runtime, 'policyNotice'>;

const GATED_CLAUDE_MODES: ReadonlySet<string> = new Set(['login-store', 'token']);

const noticeOf = (id: string, mode: string): PolicyNotice | null =>
    id === 'claude' && GATED_CLAUDE_MODES.has(mode) ? { harness: 'claude', mode: mode === 'token' ? 'token' : 'login-store', quotes: [], retrievedAt: 'fake' } : null;

export const fakeRuntime = (options: FakeRuntimeOptions): PolicedRuntime => ({ ...libraryFake(options), policyNotice: noticeOf });

export const libraryHarness = (runtime: HarnessRuntime, id: LibraryId, timeoutMs: number, jobTag?: JobTag, claudeAck = false): BackendHarness =>
    new LibraryHarnessPort(runtime, id, uncheckedMilliseconds(timeoutMs), jobTag, claudeAck ? 'acknowledged' : 'unacknowledged');

export const choice = (model: string, effort: Effort, timeoutMs?: number): HarnessChoice =>
    timeoutMs === undefined ? { model: textOf(model), effort } : { model: textOf(model), effort, timeoutMs: uncheckedMilliseconds(timeoutMs) };

export const ask = (instructions: string, input: string): HarnessAsk => ({ instructions: textOf(instructions), input: textOf(input) });

export const customHarness = (command: string, workDir: string, timeoutMs: number): BackendHarness =>
    new CustomHarnessPort(textOf(command), fsPathOf(workDir), uncheckedMilliseconds(timeoutMs));
