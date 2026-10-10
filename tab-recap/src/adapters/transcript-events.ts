import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { readsOf } from '#src/experiment/read-paths.ts';
import type { Event } from '#src/experiment/outcomes.ts';
import { extractClaude } from './claude-rows.ts';
import { arr, obj, parse, str } from './jsonl.ts';

const number = (value: unknown): number | null => (typeof value === 'number' ? value : null);

function toolEvents(line: string): readonly Event[] {
    const row = parse(line);
    if (row === null || row['type'] !== 'assistant' || row['isSidechain'] === true) return [];
    return arr(obj(row['message'])['content']).filter((block) => block['type'] === 'tool_use').map((block) => ({ kind: 'tool', reads: readsOf(str(block['name']) ?? '', obj(block['input'])) }));
}

function entryEvents(line: string, pos: number): readonly Event[] {
    const found = extractClaude([line]);
    const prompts: Event[] = found.entries.filter((entry) => entry.role === 'user').map((entry) => ({ kind: 'prompt', text: entry.text }));
    const metadata = obj(obj(parse(line) ?? {})['compactMetadata']);
    const marks: Event[] = (found.marks ?? []).filter((mark) => mark.kind === 'compacted').map((mark) => ({
        kind: 'boundary', pos, at: mark.at, trigger: mark.trigger ?? str(metadata['trigger']), pre: number(metadata['preTokens']), post: number(metadata['postTokens']),
    }));
    return [...prompts, ...marks];
}

export async function eventsOf(path: string): Promise<readonly Event[]> {
    const events: Event[] = [];
    let pos = 0;
    for await (const line of createInterface({ input: createReadStream(path, { encoding: 'utf8' }), crlfDelay: Infinity })) {
        if (line.includes('"type":"assistant"')) events.push(...toolEvents(line));
        else if (line.includes('"type":"user"') || line.includes('compact_boundary') || line.includes('queued_command')) events.push(...entryEvents(line, pos));
        pos += Buffer.byteLength(line) + 1;
    }
    return events;
}
