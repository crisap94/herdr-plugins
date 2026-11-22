import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { must } from '#src/protocol/result.ts';
import type { FsPath } from '#src/recap/domain/fs-path.ts';
import { parseCount, type Count } from '#src/recap/domain/count.ts';
import { parseText, textOf, type Text } from '#src/recap/domain/text.ts';
import { isReadingTool, parseToolInput, toolReads } from '#src/experiment/read-paths.ts';
import type { TranscriptEvent } from '#src/experiment/outcomes.ts';
import { extractClaudeOf } from '../transcripts/claude/rows.ts';
import { parseFilledTextOrNull, parseLine, parseRowOrEmpty, parseRowsOrEmpty } from '../transcripts/jsonl.ts';

const number = (value: unknown): Count | null => (typeof value === 'number' ? must(parseCount(value)) : null);

function toolEvents(line: Text): readonly TranscriptEvent[] {
    const row = parseLine(line);
    if (row === null || row['type'] !== 'assistant' || row['isSidechain'] === true) return [];
    return parseRowsOrEmpty(parseRowOrEmpty(row['message'])['content']).filter((block) => block['type'] === 'tool_use').map((block) => {
        const name = parseFilledTextOrNull(block['name']) ?? '';
        return { kind: 'tool', reads: isReadingTool(name) ? toolReads(name, parseToolInput(parseRowOrEmpty(block['input']))) : [] };
    });
}

function entryEvents(line: Text, pos: Count): readonly TranscriptEvent[] {
    const found = extractClaudeOf([line]);
    const prompts: TranscriptEvent[] = found.entries.filter((entry) => entry.role === 'user').map((entry) => ({ kind: 'prompt', text: entry.text }));
    const metadata = parseRowOrEmpty(parseRowOrEmpty(parseLine(line) ?? {})['compactMetadata']);
    const marks: TranscriptEvent[] = (found.marks ?? []).filter((mark) => mark.kind === 'compacted').map((mark) => {
        const trigger = mark.trigger ?? parseFilledTextOrNull(metadata['trigger']);
        return { kind: 'boundary', pos, at: mark.at, trigger: trigger === null ? null : textOf(trigger), pre: number(metadata['preTokens']), post: number(metadata['postTokens']) };
    });
    return [...prompts, ...marks];
}

export async function eventsOf(path: FsPath): Promise<readonly TranscriptEvent[]> {
    const events: TranscriptEvent[] = [];
    let pos = 0;
    for await (const line of createInterface({ input: createReadStream(path, { encoding: 'utf8' }), crlfDelay: Infinity })) {
        const text = must(parseText(line));
        if (line.includes('"type":"assistant"')) events.push(...toolEvents(text));
        else if (line.includes('"type":"user"') || line.includes('compact_boundary') || line.includes('queued_command')) events.push(...entryEvents(text, must(parseCount(pos))));
        pos += Buffer.byteLength(line) + 1;
    }
    return events;
}
