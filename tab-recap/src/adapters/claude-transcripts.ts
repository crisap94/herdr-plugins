import { readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { Lane } from '#src/recap/domain/lane.ts';
import type { Chunk, ChunkResult, Entry, Located, Position, PromptResult, Transcripts } from '#src/ports/transcripts.ts';
import { unknown } from '#src/ports/unknowable.ts';
import { arr, obj, parse, readJsonl, str, tailLines, toolBrief } from './jsonl.ts';
import type { Row } from './jsonl.ts';

const NOISE = ['<command-', '<local-command', '<system-reminder', '<task-notification', 'Caveat: The messages below'];

function textOf(content: unknown): string {
    if (typeof content === 'string') {
        return content;
    }
    return arr(content).filter((block) => block['type'] === 'text').map((block) => str(block['text']) ?? '').join('\n');
}

interface Meta {
    title: string | null;
    lastPrompt: string | null;
    claudeRecap: string | null;
}

function noteMeta(row: Row, meta: Meta): void {
    if (row['type'] === 'ai-title') {
        meta.title = str(row['aiTitle']) ?? meta.title;
    } else if (row['type'] === 'last-prompt') {
        meta.lastPrompt = str(row['lastPrompt']) ?? meta.lastPrompt;
    } else if (row['type'] === 'system' && row['subtype'] === 'away_summary') {
        meta.claudeRecap = str(row['content']) ?? meta.claudeRecap;
    }
}

function userEntry(row: Row): Entry | null {
    if (row['isSidechain'] === true || row['isMeta'] === true || row['isCompactSummary'] === true) {
        return null;
    }
    const text = textOf(obj(row['message'])['content']);
    const head = text.trimStart();
    return text === '' || NOISE.some((noise) => head.startsWith(noise)) ? null : { role: 'user', text };
}

function agentEntries(row: Row): readonly Entry[] {
    if (row['isSidechain'] === true) {
        return [];
    }
    const entries: Entry[] = [];
    for (const block of arr(obj(row['message'])['content'])) {
        const text = str(block['text']);
        if (block['type'] === 'text' && text !== null && text.trim() !== '') {
            entries.push({ role: 'agent', text });
        } else if (block['type'] === 'tool_use') {
            entries.push({ role: 'tool', text: toolBrief(str(block['name']) ?? 'tool', obj(block['input'])) });
        }
    }
    return entries;
}

export function extractClaude(lines: readonly string[]): Omit<Chunk, 'kind' | 'position' | 'grew'> {
    const meta: Meta = { title: null, lastPrompt: null, claudeRecap: null };
    const entries: Entry[] = [];
    for (const row of lines.map(parse)) {
        if (row === null) {
            continue;
        }
        noteMeta(row, meta);
        const user = row['type'] === 'user' ? userEntry(row) : null;
        if (user !== null) {
            entries.push(user);
        }
        if (row['type'] === 'assistant') {
            entries.push(...agentEntries(row));
        }
    }
    return { entries, ...meta };
}

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

    read(source: string, was: Position, budget: number): Promise<ChunkResult> {
        try {
            const { lines, position, grew } = readJsonl(source, was, budget);
            return Promise.resolve({ kind: 'chunk', ...extractClaude(lines), position, grew });
        } catch (error) {
            return Promise.resolve(unknown({ why: 'unreadable', detail: error instanceof Error ? error.message : String(error) }));
        }
    }
}
