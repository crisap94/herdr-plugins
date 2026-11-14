import { CapabilityName, Engine, isUsable, TOOLS_OFF } from '@stateforge-labs/harness-adapters/runtime';
import type { Capabilities, ConfinementCell as LibraryConfinementCell, Effort as LibraryEffort, HarnessId, Runtime, RunFailure, RunOutput } from '@stateforge-labs/harness-adapters/runtime';
import type { ConfinementCell, Harness, HarnessCall, HarnessSettings, Ran } from '#src/ports/harness.ts';
import { unknown } from '#src/ports/unknowable.ts';
import { MODEL_DEFAULTS } from '#src/recap/domain/backend.ts';
import type { Effort } from '#src/recap/domain/effort.ts';
import type { JobTag } from '#src/recap/domain/job-tag.ts';
import { duration } from '#src/recap/domain/time.ts';
import { scrubbedFrom } from '../os/process/control.ts';
import { LIBRARY_HARNESS } from './library-constants.ts';

export { LIBRARY_IDS } from './library-constants.ts';

export type HarnessRuntime = Pick<Runtime, 'headless' | 'promptLimit' | 'capabilities' | 'policyNotice'>;

export type LibraryId = Extract<HarnessId, 'claude' | 'codex' | 'opencode'>;

const effortOf = (capabilities: Capabilities | null, effort: Effort): LibraryEffort =>
    capabilities === null || !isUsable(capabilities[CapabilityName.Effort][Engine.Cli]) || effort === 'default' ? LIBRARY_HARNESS.harnessDefaultEffort : effort;

const cellOf = (cell: LibraryConfinementCell): ConfinementCell => ({ axis: cell.axis, state: cell.support.state });

function failedOf(failure: RunFailure): Ran {
    if (failure.kind === LIBRARY_HARNESS.timeoutKind) {
        return unknown({ why: 'timeout', after: duration(failure.timeoutMs) });
    }
    const code = failure.kind === LIBRARY_HARNESS.exitKind && failure.code !== null ? failure.code : LIBRARY_HARNESS.failedCode;
    return unknown({ why: 'failed', code, detail: `${failure.kind}: ${failure.message}`.slice(0, LIBRARY_HARNESS.detailLimit) });
}

function ranOf(output: RunOutput): Ran {
    return { kind: 'ran', text: output.text, costUsd: output.cost.usd ?? 0, costBasis: output.cost.basis, confinement: output.confinement.map(cellOf) };
}

export class LibraryHarness<Id extends LibraryId> implements Harness<Id> {
    readonly id: Id;
    readonly limit: number | null;
    private readonly runtime: HarnessRuntime;
    private readonly timeoutMs: number;
    private readonly jobTag: JobTag | undefined;
    private readonly claudeAck: boolean;

    constructor(runtime: HarnessRuntime, id: Id, timeoutMs: number, jobTag?: JobTag, claudeAck = false) {
        this.runtime = runtime;
        this.id = id;
        this.limit = runtime.promptLimit(id);
        this.timeoutMs = timeoutMs;
        this.jobTag = jobTag;
        this.claudeAck = claudeAck;
    }

    label(settings: HarnessSettings): string {
        const model = settings.model === '' ? MODEL_DEFAULTS[this.id] : settings.model;
        return model === '' ? this.id : `${this.id}/${model}`;
    }

    async run(call: HarnessCall, settings: HarnessSettings): Promise<Ran> {
        const login = { mode: LIBRARY_HARNESS.loginStore } as const;
        const ackRequired = this.runtime.policyNotice(this.id, LIBRARY_HARNESS.loginStore) !== null;
        const credential = ackRequired ? { ...login, acknowledgePolicy: true as const } : login;
        if (ackRequired && !this.claudeAck) {
            return unknown({ why: 'failed', code: LIBRARY_HARNESS.failedCode, detail: LIBRARY_HARNESS.ackMessage });
        }
        const model = settings.model === '' ? MODEL_DEFAULTS[this.id] : settings.model;
        const capabilities = this.runtime.capabilities(this.id);
        const jobTag = this.jobTag;
        const handle = this.runtime.headless<HarnessId>(this.id, {
            credential,
            tools: TOOLS_OFF,
            env: { kind: 'inherit', transform: (source) => scrubbedFrom(source, jobTag) },
            cwd: { private: 'delete' },
            persist: capabilities === null || !isUsable(capabilities[CapabilityName.Ephemeral][Engine.Cli]),
            timeoutMs: this.timeoutMs,
        });
        const timeout = settings.timeoutMs === undefined ? {} : { timeoutMs: settings.timeoutMs };
        const result = await handle.run({ instructions: call.instructions, input: call.input, effort: effortOf(capabilities, settings.effort), ...(model === '' ? {} : { model }), ...timeout });
        return result.ok ? ranOf(result.value) : failedOf(result.failure);
    }
}
