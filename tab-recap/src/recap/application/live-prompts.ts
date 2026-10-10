import type { Lane } from '#src/recap/domain/lane.ts';
import type { Transcripts } from '#src/ports/transcripts.ts';
import { isUnknown } from '#src/ports/unknowable.ts';

const TAIL_BYTES = 256 * 1024;
const ANY_KIND = '*';
const REMEMBERED = 200;

export class LivePrompts {
    private readonly transcripts: readonly Transcripts[];
    private readonly known = new Map<string, string>();

    constructor(transcripts: readonly Transcripts[]) {
        this.transcripts = transcripts;
    }

    of(pane: string): string | null {
        return this.known.get(pane) ?? null;
    }

    async refresh(lane: Lane): Promise<boolean> {
        const agent = String(lane.agent);
        const reader = this.transcripts.find((candidate) => candidate.agent === agent) ?? this.transcripts.find((candidate) => candidate.agent === ANY_KIND);
        if (reader === undefined) {
            return false;
        }
        const located = await reader.locate(lane);
        if (isUnknown(located)) {
            return false;
        }
        const found = await reader.latestPrompt(located.source, TAIL_BYTES);
        const pane = String(lane.pane);
        if (isUnknown(found) || found.text === null || found.text === this.known.get(pane)) {
            return false;
        }
        this.known.delete(pane);
        this.known.set(pane, found.text);
        if (this.known.size > REMEMBERED) {
            this.known.delete(this.known.keys().next().value ?? '');
        }
        return true;
    }
}
