import { readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { Lane } from '#src/recap/domain/lane.ts';
import type { Chunk, ChunkResult, Entry, Located, Position, Transcripts } from '#src/ports/transcripts.ts';
import { unknown } from '#src/ports/unknowable.ts';
import { arr, obj, parse, readJsonl, readLines, str, toolBrief } from './jsonl.ts';
import type { Row } from './jsonl.ts';

const NOISE = ['<environment_context', '<user_instructions', '# AGENTS.md'];
const DAYS_BACK = 14;
const CANDIDATES = 200;

function messageEntry(item: Row): Entry | null {
    const role = item['role'];
    if (role !== 'user' && role !== 'assistant') {
        return null;
    }
    const text = arr(item['content']).map((part) => str(part['text']) ?? '').join('\n');
    const head = text.trimStart();
    if (text === '' || NOISE.some((noise) => head.startsWith(noise))) {
        return null;
    }
    return { role: role === 'user' ? 'user' : 'agent', text };
}

function toolEntry(item: Row): Entry {
    const raw = item['arguments'] ?? item['input'];
    let input: Row = obj(raw);
    if (typeof raw === 'string') {
        input = parse(raw) ?? { command: raw };
    }
    return { role: 'tool', text: toolBrief(str(item['name']) ?? 'tool', input) };
}

export function extractCodex(lines: readonly string[]): Omit<Chunk, 'kind' | 'position' | 'grew'> {
    const entries: Entry[] = [];
    let lastPrompt: string | null = null;
    for (const row of lines.map(parse)) {
        const item = obj(row?.['payload']);
        if (row?.['type'] !== 'response_item') {
            continue;
        }
        if (item['type'] === 'message') {
            const entry = messageEntry(item);
            if (entry !== null) {
                entries.push(entry);
                lastPrompt = entry.role === 'user' ? entry.text : lastPrompt;
            }
        } else if (item['type'] === 'function_call' || item['type'] === 'custom_tool_call') {
            entries.push(toolEntry(item));
        }
    }
    return { entries, title: null, lastPrompt, claudeRecap: null };
}

function dayDir(root: string, back: number): string {
    const day = new Date(Date.now() - back * 86_400_000);
    return join(root, String(day.getFullYear()), String(day.getMonth() + 1).padStart(2, '0'), String(day.getDate()).padStart(2, '0'));
}

/** Codex lanes carry no session id in herdr: the newest rollout started in the lane's cwd is its transcript. */
export class CodexTranscripts implements Transcripts {
    readonly agent = 'codex';
    private readonly root: string;

    constructor(root = join(homedir(), '.codex', 'sessions')) {
        this.root = root;
    }

    private recent(): readonly { path: string; mtime: number; size: number }[] {
        const found: { path: string; mtime: number; size: number }[] = [];
        for (let back = 0; back < DAYS_BACK; back++) {
            const dir = dayDir(this.root, back);
            let names: string[] = [];
            try { names = readdirSync(dir); } catch { continue; }
            for (const name of names.filter((n) => n.endsWith('.jsonl'))) {
                try {
                    const stat = statSync(join(dir, name));
                    found.push({ path: join(dir, name), mtime: stat.mtimeMs, size: stat.size });
                } catch { /* raced a rename */ }
            }
        }
        return found.toSorted((a, b) => b.mtime - a.mtime).slice(0, CANDIDATES);
    }

    locate(lane: Lane): Promise<Located> {
        return Promise.resolve(this.find(lane));
    }

    private find(lane: Lane): Located {
        if (lane.cwd === null) {
            return unknown({ why: 'not-found', what: `a cwd for ${lane.pane}` });
        }
        for (const candidate of this.recent()) {
            const first = parse(readLines(candidate.path, 0, 64 * 1024).lines[0] ?? '');
            if (first?.['type'] === 'session_meta' && obj(first['payload'])['cwd'] === lane.cwd) {
                return { kind: 'located', source: candidate.path };
            }
        }
        return unknown({ why: 'not-found', what: `a codex rollout started in ${lane.cwd}` });
    }

    read(source: string, was: Position, budget: number): Promise<ChunkResult> {
        try {
            const { lines, position, grew } = readJsonl(source, was, budget);
            return Promise.resolve({ kind: 'chunk', ...extractCodex(lines), position, grew });
        } catch (error) {
            return Promise.resolve(unknown({ why: 'unreadable', detail: error instanceof Error ? error.message : String(error) }));
        }
    }
}
