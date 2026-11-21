import { opencodeDatabasePath } from '@stateforge-labs/harness-adapters/opencode/store';
import type { Lane } from '#src/recap/domain/lane.ts';
import type { ChunkResult, Located, ObservedResult, Position, PromptResult, SupportedInFlight, Transcripts } from '#src/ports/transcripts.ts';
import { must } from '#src/protocol/result.ts';
import { parseFsPath } from '#src/recap/domain/fs-path.ts';
import { OpencodeReader } from './transcripts.ts';

export class OpencodeTranscripts implements Transcripts {
    readonly agent = 'opencode';
    readonly inFlight: SupportedInFlight;
    private readonly reader: OpencodeReader;

    constructor(database: string = opencodeDatabasePath()) {
        this.reader = new OpencodeReader(must(parseFsPath(database)));
        this.inFlight = this.reader.inFlight;
    }

    locate(lane: Lane): Promise<Located> {
        return this.reader.locate(lane);
    }

    read(source: string, was: Position, budget: number): Promise<ChunkResult> {
        return this.reader.read(source, was, budget);
    }

    latestPrompt(source: string): Promise<PromptResult> {
        return this.reader.latestPrompt(source);
    }

    observed(source: string): Promise<ObservedResult> {
        return this.reader.observed(source);
    }
}
