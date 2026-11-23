import type * as LibraryRuntime from '@stateforge-labs/harness-adapters/runtime';
import type { Capabilities, ConfinementCell as LibraryConfinementCell, Effort as LibraryEffort, HarnessId, JsonObject, Runtime, RunFailure, RunOutput } from '@stateforge-labs/harness-adapters/runtime';
import { ANSWER_SCHEMAS } from '#src/adapters/job/prompts/answer-schemas.ts';
import type { BackendHarness, ConfinementCell, HarnessAsk, HarnessChoice, HarnessRun, RanText, StructuredSupport, ToolSupport } from '#src/ports/harness.ts';
import { unknown, exitCodeOf } from '#src/ports/unknowable.ts';
import { must } from '#src/protocol/result.ts';
import { uncheckedBackendText, type BackendText } from '#src/recap/domain/ids.ts';
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

export type HarnessRuntime = Pick<Runtime, 'headless' | 'promptLimit' | 'capabilities' | 'policyNotice'>;

export class RuntimeLoadError extends Error {
    constructor(message: Text) {
        super(message);
        this.name = 'RuntimeLoadError';
    }
}

export interface RuntimeSource {
    readonly createRuntime: () => HarnessRuntime;
}

export type RuntimeLoader = () => RuntimeSource;

type LibraryModule = typeof LibraryRuntime;

const loadFailure = (error: Error): RuntimeLoadError =>
    error instanceof RuntimeLoadError ? error : new RuntimeLoadError(must(parseText(error.message)));

const isLibraryRuntime = (loaded: unknown): loaded is LibraryModule =>
    typeof loaded === 'object' && loaded !== null && 'createRuntime' in loaded && typeof loaded.createRuntime === 'function' && 'isUsable' in loaded && typeof loaded.isUsable === 'function' && 'CapabilityName' in loaded && 'Engine' in loaded && 'TOOLS_OFF' in loaded;

let memoised: LibraryModule | null = null;

export function libraryRuntime(): LibraryModule {
    if (memoised !== null) return memoised;
    try {
        const loaded: unknown = require('@stateforge-labs/harness-adapters/runtime');
        if (!isLibraryRuntime(loaded)) throw new RuntimeLoadError(must(parseText('the harness runtime module has no createRuntime')));
        memoised = loaded;
        return loaded;
    } catch (error) {
        throw loadFailure(error instanceof Error ? error : new Error(String(error)));
    }
}

export function lazyRuntime(load: RuntimeLoader = libraryRuntime): HarnessRuntime {
    let created: HarnessRuntime | null = null;
    const runtime = (): HarnessRuntime => {
        if (created !== null) return created;
        try {
            created = load().createRuntime();
            return created;
        } catch (error) {
            throw loadFailure(error instanceof Error ? error : new Error(String(error)));
        }
    };
    return {
        headless: (id, options) => runtime().headless(id, options),
        promptLimit: (id, engine) => runtime().promptLimit(id, engine),
        capabilities: (id) => runtime().capabilities(id),
        policyNotice: (id, mode) => runtime().policyNotice(id, mode),
    };
}

export type LibraryId = Extract<HarnessId, 'claude' | 'codex' | 'opencode'>;

export type Acknowledgement = 'acknowledged' | 'unacknowledged';

type CapabilityKey = 'effort' | 'structuredOutput' | 'ephemeral';

type Usability = 'usable' | 'unusable';

const usabilityOf = (capabilities: Capabilities | null, key: CapabilityKey): Usability => {
    if (capabilities === null) return 'unusable';
    const { CapabilityName, Engine, isUsable } = libraryRuntime();
    const named = { effort: CapabilityName.Effort, structuredOutput: CapabilityName.StructuredOutput, ephemeral: CapabilityName.Ephemeral }[key];
    return isUsable(capabilities[named][Engine.Cli]) ? 'usable' : 'unusable';
};

const effortOf = (capabilities: Capabilities | null, effort: Effort): LibraryEffort =>
    usabilityOf(capabilities, 'effort') === 'unusable' || effort === 'default' ? LIBRARY_HARNESS.harnessDefaultEffort : effort;

const cellOf = (cell: LibraryConfinementCell): ConfinementCell => ({ axis: cell.axis, state: cell.support.state });

const structuredOf = (capabilities: Capabilities | null): StructuredSupport =>
    usabilityOf(capabilities, 'structuredOutput') === 'usable' ? 'schema' : 'none';

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
    return unknown({ why: 'failed', code: exitCodeOf(code), detail: causeOf(must(parseText(`${failure.kind}: ${failure.message}`.slice(0, LIBRARY_HARNESS.detailLimit)))) });
}

function ranOf(output: RunOutput): RanText {
    const text = output.output === undefined ? output.text : JSON.stringify(output.output);
    return { kind: 'ran', text: must(parseText(text)), costUsd: must(parseUsd(output.cost.usd ?? 0)), costBasis: output.cost.basis, confinement: output.confinement.map(cellOf) };
}

export class LibraryHarnessPort implements BackendHarness {
    readonly id: BackendText;
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
        this.id = uncheckedBackendText(library);
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
            return unknown({ why: 'failed', code: exitCodeOf(LIBRARY_HARNESS.failedCode), detail: causeOf(must(parseText(LIBRARY_HARNESS.ackMessage))) });
        }
        if (call.answer?.kind === 'schema' && this.structured !== 'schema') {
            return unknown({ why: 'failed', code: exitCodeOf(LIBRARY_HARNESS.failedCode), detail: causeOf(must(parseText('structured output is not available in this harness library'))) });
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
            tools: libraryRuntime().TOOLS_OFF,
            env: { kind: 'inherit', transform: (source) => scrubbedFrom(source, jobTag) },
            cwd: { private: 'delete' },
            persist: usabilityOf(capabilities, 'ephemeral') === 'unusable',
            timeoutMs: this.timeoutMs,
        });
        const timeout = settings.timeoutMs === undefined ? {} : { timeoutMs: settings.timeoutMs };
        const result = await handle.run({ instructions: call.instructions, input: call.input, effort: effortOf(capabilities, settings.effort), ...(model.length === 0 ? {} : { model }), ...timeout, ...outputOf(call, this.structured) });
        return result.ok ? ranOf(result.value) : failedOf(result.failure);
    }
}
