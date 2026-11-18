import type { Harness, HarnessAsk, HarnessCall, HarnessChoice, HarnessSettings, Ran, StructuredSupport, ToolSupport } from '#src/ports/harness.ts';
import type { Harnesses, HarnessesResult } from '#src/ports/harnesses.ts';
import { must } from '#src/protocol/result.ts';
import type { JobTag } from '#src/recap/domain/job-tag.ts';
import { parseAgentKind } from '#src/recap/domain/ids.ts';
import { parseFsPath } from '#src/recap/domain/fs-path.ts';
import { parseText } from '#src/recap/domain/text.ts';
import { parseMilliseconds } from '#src/recap/domain/time.ts';
import { CustomHarnessPort } from './custom.ts';
import { type Acknowledgement, type HarnessRuntime, type LibraryId, LibraryHarnessPort } from './library.ts';
import { dirsOf, PathHarnessDirectory, presenceOnPath } from './on-path.ts';

const choiceOf = (settings: HarnessSettings): HarnessChoice =>
    settings.timeoutMs === undefined
        ? { model: must(parseText(settings.model)), effort: settings.effort }
        : { model: must(parseText(settings.model)), effort: settings.effort, timeoutMs: settings.timeoutMs };

const askOf = (call: HarnessCall): HarnessAsk => ({
    instructions: must(parseText(call.instructions)),
    input: must(parseText(call.input)),
    ...(call.answer === undefined ? {} : { answer: call.answer }),
});

export class LibraryHarness<Id extends LibraryId> implements Harness<Id> {
    readonly id: Id;
    readonly limit: number | null;
    readonly structured: StructuredSupport;
    readonly tools: ToolSupport;
    private readonly port: LibraryHarnessPort;

    constructor(runtime: HarnessRuntime, id: Id, timeoutMs: number, jobTag?: JobTag, claudeAck = false) {
        const acknowledgement: Acknowledgement = claudeAck ? 'acknowledged' : 'unacknowledged';
        this.port = new LibraryHarnessPort(runtime, id, must(parseMilliseconds(timeoutMs)), jobTag, acknowledgement);
        this.id = id;
        this.limit = this.port.limit;
        this.structured = this.port.structured;
        this.tools = this.port.tools;
    }

    label(settings: HarnessSettings): string {
        return this.port.label(choiceOf(settings));
    }

    async run(call: HarnessCall, settings: HarnessSettings): Promise<Ran> {
        return this.port.run(askOf(call), choiceOf(settings));
    }
}

export class CustomHarness implements Harness {
    readonly id = 'custom';
    readonly limit = null;
    private readonly port: CustomHarnessPort;

    constructor(command: string, workDir: string, timeoutMs: number) {
        this.port = new CustomHarnessPort(must(parseText(command)), must(parseFsPath(workDir)), must(parseMilliseconds(timeoutMs)));
    }

    label(): string {
        return this.port.label();
    }

    async run(call: HarnessCall): Promise<Ran> {
        return this.port.run(askOf(call));
    }
}

export function onPath(command: string, path: string): boolean {
    return presenceOnPath(must(parseAgentKind(command)), dirsOf(must(parseText(path)))) === 'present';
}

export class PathHarnesses implements Harnesses {
    private readonly directory: PathHarnessDirectory;

    constructor(ids: readonly string[]) {
        this.directory = new PathHarnessDirectory(ids.map((id) => must(parseAgentKind(id))));
    }

    available(): Promise<HarnessesResult> {
        return this.directory.available();
    }
}
