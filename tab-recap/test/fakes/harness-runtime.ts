import type { PolicyNotice, Runtime } from '@stateforge-labs/harness-adapters/runtime';
import { fakeRuntime as libraryFake } from '@stateforge-labs/harness-adapters/testing';
import type { FakeRuntime, FakeRuntimeOptions } from '@stateforge-labs/harness-adapters/testing';

export { fakeOutput } from '@stateforge-labs/harness-adapters/testing';

export type PolicedRuntime = FakeRuntime & Pick<Runtime, 'policyNotice'>;

const GATED_CLAUDE_MODES: ReadonlySet<string> = new Set(['login-store', 'token']);

const noticeOf = (id: string, mode: string): PolicyNotice | null =>
    id === 'claude' && GATED_CLAUDE_MODES.has(mode) ? { harness: 'claude', mode: mode === 'token' ? 'token' : 'login-store', quotes: [], retrievedAt: 'fake' } : null;

export const fakeRuntime = (options: FakeRuntimeOptions): PolicedRuntime => ({ ...libraryFake(options), policyNotice: noticeOf });
