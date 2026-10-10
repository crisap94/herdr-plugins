import { readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { Lane } from '#src/recap/domain/lane.ts';
import type { ChunkResult, InFlightResult, Located, ObservedResult, Position, PromptResult, Transcripts } from '#src/ports/transcripts.ts';
import { isUnknown, unknown } from '#src/ports/unknowable.ts';
import { readJsonl, tailLines, tailOf } from './jsonl.ts';
import { claudeObserved } from './claude-context.ts';
import { extractClaude } from './claude-rows.ts';
import { IN_FLIGHT_MAX_BYTES, answerOf, scanFlight } from './claude-in-flight.ts';

export { extractClaude };

function answerAt(source: string, budget: number): InFlightResult {
    let bytes = budget;
    let tail = tailOf(source, bytes);
    let scan = scanFlight(tail.lines);
    while (tail.truncated && scan?.unseen === true && bytes < IN_FLIGHT_MAX_BYTES) {
        bytes = Math.min(bytes * 2, IN_FLIGHT_MAX_BYTES);
        tail = tailOf(source, bytes);
        scan = scanFlight(tail.lines);
    }
    return answerOf(scan, tail.truncated);
}

export const KEPT_UNKNOWN_MAX = 256;

export class ClaudeTranscripts implements Transcripts {
    readonly agent = 'claude';
    private readonly root: string;
    private readonly unknownAt = new Map<string, { readonly size: number; readonly answer: InFlightResult }>();

    constructor(root = join(homedir(), '.claude', 'projects')) {
        this.root = root;
    }

    locate(lane: Lane): Promise<Located> {
        return Promise.resolve(this.find(lane));
    }

    private find(lane: Lane): Located {
        if (lane.session === null) {
            return unknown({ why: 'not-found', what: `a session id for ${lane.pane}` });
        }
        let best: { path: string; mtime: number } | null = null;
        let dirs: string[] = [];
        try { dirs = readdirSync(this.root); } catch { return unknown({ why: 'unreadable', detail: this.root }); }
        for (const dir of dirs) {
            const path = join(this.root, dir, `${lane.session}.jsonl`);
            try {
                const stat = statSync(path);
                if (best === null || stat.mtimeMs > best.mtime) { best = { path, mtime: stat.mtimeMs }; }
            } catch { }
        }
        return best === null ? unknown({ why: 'not-found', what: `the transcript of ${lane.session}` }) : { kind: 'located', source: best.path };
    }

    latestPrompt(source: string, budget: number): Promise<PromptResult> {
        try {
            const found = extractClaude(tailLines(source, budget));
            return Promise.resolve({ kind: 'prompt', text: found.entries.findLast((entry) => entry.role === 'user')?.text ?? found.lastPrompt });
        } catch (error) {
            return Promise.resolve(unknown({ why: 'unreadable', detail: error instanceof Error ? error.message : String(error) }));
        }
    }

    observed(source: string, budget: number): Promise<ObservedResult> {
        try {
            return Promise.resolve({ kind: 'observed', observed: claudeObserved(tailLines(source, budget)) });
        } catch (error) {
            return Promise.resolve(unknown({ why: 'unreadable', detail: error instanceof Error ? error.message : String(error) }));
        }
    }

    private keep(source: string, kept: { readonly size: number; readonly answer: InFlightResult }): void {
        this.unknownAt.delete(source);
        this.unknownAt.set(source, kept);
        for (const oldest of this.unknownAt.keys()) {
            if (this.unknownAt.size <= KEPT_UNKNOWN_MAX) break;
            this.unknownAt.delete(oldest);
        }
    }

    inFlight(source: string, budget: number): Promise<InFlightResult> {
        try {
            const size = statSync(source).size;
            const kept = this.unknownAt.get(source);
            if (kept !== undefined && kept.size === size) return Promise.resolve(kept.answer);
            const answer = answerAt(source, budget);
            if (isUnknown(answer)) this.keep(source, { size, answer });
            else this.unknownAt.delete(source);
            return Promise.resolve(answer);
        } catch (error) {
            return Promise.resolve(unknown({ why: 'unreadable', detail: error instanceof Error ? error.message : String(error) }));
        }
    }

    read(source: string, was: Position, budget: number): Promise<ChunkResult> {
        try {
            const { lines, position, grew } = readJsonl(source, was, budget);
            return Promise.resolve({ kind: 'chunk', ...extractClaude(lines), position, grew });
        } catch (error) {
            return Promise.resolve(unknown({ why: 'unreadable', detail: error instanceof Error ? error.message : String(error) }));
        }
    }
}
