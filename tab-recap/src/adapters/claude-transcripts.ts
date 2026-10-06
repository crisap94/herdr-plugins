import { readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { Lane } from '#src/recap/domain/lane.ts';
import type { ChunkResult, Located, ObservedResult, Position, PromptResult, Transcripts } from '#src/ports/transcripts.ts';
import { unknown } from '#src/ports/unknowable.ts';
import { readJsonl, tailLines } from './jsonl.ts';
import { claudeObserved } from './context-rows.ts';
import { extractClaude } from './claude-rows.ts';

export { extractClaude };

/** Claude Code transcripts. Never derive the project slug: sessions move with /cd. */
export class ClaudeTranscripts implements Transcripts {
    readonly agent = 'claude';
    private readonly root: string;

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
            } catch { /* not in this project */ }
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

    read(source: string, was: Position, budget: number): Promise<ChunkResult> {
        try {
            const { lines, position, grew } = readJsonl(source, was, budget);
            return Promise.resolve({ kind: 'chunk', ...extractClaude(lines), position, grew });
        } catch (error) {
            return Promise.resolve(unknown({ why: 'unreadable', detail: error instanceof Error ? error.message : String(error) }));
        }
    }
}
