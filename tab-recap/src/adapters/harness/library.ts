import { CapabilityName, Engine, isUsable, TOOLS_OFF } from '@stateforge-labs/harness-adapters/runtime';
import type { Capabilities, ConfinementCell as LibraryConfinementCell, Effort as LibraryEffort, HarnessId, JsonObject, Runtime, RunFailure, RunOutput } from '@stateforge-labs/harness-adapters/runtime';
import { ANSWER_SCHEMAS } from '#src/adapters/job/prompts/answer-schemas.ts';
import type { ConfinementCell, HarnessAsk, HarnessChoice, HarnessPort, HarnessRun, RanText, StructuredSupport, ToolSupport } from '#src/ports/harness.ts';
import { unknown } from '#src/ports/unknowable.ts';
import { must } from '#src/protocol/result.ts';
import { MODEL_DEFAULTS } from '#src/recap/domain/backend.ts';
import { parseCount, type Count } from '#src/recap/domain/count.ts';
import type { Effort } from '#src/recap/domain/effort.ts';
import { causeOf } from '#src/recap/domain/failure-cause.ts';
import type { JobTag } from '#src/recap/domain/job-tag.ts';
import { parseText, type Text } from '#src/recap/domain/text.ts';
import { duration, type Milliseconds } from '#src/recap/domain/time.ts';
import { parseUsd } from '#src/recap/domain/usd.ts';
import { scrubbedFrom } from '../os/process/control.ts';
import { LIBRARY_HARNESS } from './library-constants.ts';

export { LIBRARY_IDS } from './library-constants.ts';
export { LibraryHarness } from './legacy.ts';

export type HarnessRuntime = Pick<Runtime, 'headless' | 'promptLimit' | 'capabilities' | 'policyNotice'>;

export type LibraryId = Extract<HarnessId, 'claude' | 'codex' | 'opencode'>;

export type Acknowledgement = 'acknowledged' | 'unacknowledged';

const effortOf = (capabilities: Capabilities | null, effort: Effort): LibraryEffort =>
    capabilities === null || !isUsable(capabilities[CapabilityName.Effort][Engine.Cli]) || effort === 'default' ? LIBRARY_HARNESS.harnessDefaultEffort : effort;

const cellOf = (cell: LibraryConfinementCell): ConfinementCell => ({ axis: cell.axis, state: cell.support.state });

const structuredOf = (capabilities: Capabilities | null): StructuredSupport =>
    capabilities !== null && isUsable(capabilities[CapabilityName.StructuredOutput][Engine.Cli]) ? 'schema' : 'none';

interface StructuredOptions {
    readonly outputSchema?: JsonObject;
}

const outputOf = (call: HarnessAsk, structured: StructuredSupport): StructuredOptions =>
    call.answer?.kind === 'schema' && structured === 'schema' ? { outputSchema: ANSWER_SCHEMAS[call.answer.schema] } : {};

function failedOf(failure: RunFailure): HarnessRun {
    if (failure.kind === LIBRARY_HARNESS.timeoutKind) {
        return unknown({ why: 'timeout', after: duration(failure.timeoutMs) });
    }
    const code = failure.kind === LIBRARY_HARNESS.exitKind && failure.code !== null ? failure.code : LIBRARY_HARNESS.failedCode;
    return unknown({ why: 'failed', code, detail: causeOf(must(parseText(`${failure.kind}: ${failure.message}`.slice(0, LIBRARY_HARNESS.detailLimit)))) });
}

function ranOf(output: RunOutput): RanText {
    const text = output.output === undefined ? output.text : JSON.stringify(output.output);
    return { kind: 'ran', text: must(parseText(text)), costUsd: must(parseUsd(output.cost.usd ?? 0)), costBasis: output.cost.basis, confinement: output.confinement.map(cellOf) };
}

export class LibraryHarnessPort implements HarnessPort {
    readonly id: Text;
    readonly limit: Count | null;
    readonly structured: StructuredSupport;
    readonly tools: ToolSupport = 'none';
    private readonly runtime: HarnessRuntime;
    private readonly library: LibraryId;
    private readonly timeoutMs: Milliseconds;
    private readonly jobTag: JobTag | undefined;
    private readonly claudeAck: Acknowledgement;

    constructor(runtime: HarnessRuntime, library: LibraryId, timeoutMs: Milliseconds, jobTag?: JobTag, claudeAck: Acknowledgement = 'unacknowledged') {
        this.runtime = runtime;
        this.library = library;
        this.id = must(parseText(library));
        const limit = runtime.promptLimit(library);
        this.limit = limit === null ? null : must(parseCount(limit));
        this.structured = structuredOf(runtime.capabilities(library));
        this.timeoutMs = timeoutMs;
        this.jobTag = jobTag;
        this.claudeAck = claudeAck;
    }

    label(settings: HarnessChoice): Text {
        const model = settings.model.length === 0 ? MODEL_DEFAULTS[this.library] : settings.model;
        return must(parseText(model.length === 0 ? this.library : `${this.library}/${model}`));
    }

    private refusalOf(call: HarnessAsk): HarnessRun | null {
        if (this.runtime.policyNotice(this.library, LIBRARY_HARNESS.loginStore) !== null && this.claudeAck === 'unacknowledged') {
            return unknown({ why: 'failed', code: LIBRARY_HARNESS.failedCode, detail: causeOf(must(parseText(LIBRARY_HARNESS.ackMessage))) });
        }
        if (call.answer?.kind === 'schema' && this.structured !== 'schema') {
            return unknown({ why: 'failed', code: LIBRARY_HARNESS.failedCode, detail: causeOf(must(parseText('structured output is not available in this harness library'))) });
        }
        return null;
    }

    async run(call: HarnessAsk, settings: HarnessChoice): Promise<HarnessRun> {
        const refused = this.refusalOf(call);
        if (refused !== null) return refused;
        const login = { mode: LIBRARY_HARNESS.loginStore } as const;
        const ackRequired = this.runtime.policyNotice(this.library, LIBRARY_HARNESS.loginStore) !== null;
        const credential = ackRequired ? { ...login, acknowledgePolicy: true as const } : login;
        const model = settings.model.length === 0 ? MODEL_DEFAULTS[this.library] : settings.model;
        const capabilities = this.runtime.capabilities(this.library);
        const jobTag = this.jobTag;
        const handle = this.runtime.headless<HarnessId>(this.library, {
            credential,
            tools: TOOLS_OFF,
            env: { kind: 'inherit', transform: (source) => scrubbedFrom(source, jobTag) },
            cwd: { private: 'delete' },
            persist: capabilities === null || !isUsable(capabilities[CapabilityName.Ephemeral][Engine.Cli]),
            timeoutMs: this.timeoutMs,
        });
        const timeout = settings.timeoutMs === undefined ? {} : { timeoutMs: settings.timeoutMs };
        const result = await handle.run({ instructions: call.instructions, input: call.input, effort: effortOf(capabilities, settings.effort), ...(model.length === 0 ? {} : { model }), ...timeout, ...outputOf(call, this.structured) });
        return result.ok ? ranOf(result.value) : failedOf(result.failure);
    }
}
