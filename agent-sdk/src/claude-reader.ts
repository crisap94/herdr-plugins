import { claudeProjectsRoot, compactBoundary, compactionFailed, compactSummary, awaySummary, humanPrompt, locateClaudeTranscript, readClaudeRecords, type ClaudeRecord } from '@stateforge-labs/harness-adapters/claude';
import { readJsonl } from '@stateforge-labs/harness-adapters/jsonl';
import {
    instant,
    parseHarnessKind,
    unknown,
    type AgentNote,
    type Chunk,
    type Count,
    type Cursor,
    type Entry,
    type FailureCause,
    type Grew,
    type HarnessKind,
    type Instant,
    type Located,
    type Mark,
    type Position,
    type SessionReader,
    type SourcePath,
    type Text,
    type Unknown,
} from '@stateforge-labs/session-ledger';

export interface ClaudeReaderOptions {
    readonly root?: string;
}

const isText = (raw: string): raw is Text => raw.length >= 0;
const isSourcePath = (raw: string): raw is SourcePath => raw.length > 0;
const isCursor = (raw: number): raw is Cursor => Number.isSafeInteger(raw) && raw >= 0;
const isGrew = (raw: boolean): raw is Grew => typeof raw === 'boolean';
const isCause = (raw: string): raw is FailureCause => raw.length >= 0;

const harnessOf = (): HarnessKind => {
    const parsed = parseHarnessKind('claude');
    if (parsed.kind === 'err') {
        throw new Error('agent-sdk: invalid harness');
    }
    return parsed.value;
};

const textOf = (raw: string): Text => {
    if (!isText(raw)) {
        throw new Error('agent-sdk: invalid text');
    }
    return raw;
};

const notFound = (what: string): Unknown => unknown({ why: 'not-found', what: textOf(what) });

const unreadable = (failure: unknown): Unknown => {
    const message = failure instanceof Error ? failure.message : 'the transcript could not be read';
    const detail = isCause(message) ? message : null;
    if (detail === null) {
        throw new Error('agent-sdk: invalid cause');
    }
    return unknown({ why: 'unreadable', detail });
};

const instantOf = (at: number | null): Instant | undefined => (at === null ? undefined : instant(at));

const entriesOf = (record: ClaudeRecord): readonly Entry[] => {
    const prompt = humanPrompt(record);
    if (prompt !== null) {
        const at = instantOf(record.at);
        return [{ role: 'user', text: textOf(prompt), ...(at === undefined ? {} : { at }) }];
    }
    if (record.kind !== 'assistant' || record.sidechain) {
        return [];
    }
    const at = instantOf(record.at);
    const when = at === undefined ? {} : { at };
    return record.blocks.flatMap((block): readonly Entry[] => {
        if (block.kind === 'text' && block.text.trim() !== '') {
            return [{ role: 'agent', text: textOf(block.text), ...when }];
        }
        if (block.kind === 'tool_use') {
            return [{ role: 'tool', text: textOf(block.name), ...when }];
        }
        return [];
    });
};

const notesOf = (record: ClaudeRecord): readonly AgentNote[] => {
    const away = awaySummary(record);
    const summary = compactSummary(record);
    const at = record.at === null ? null : instant(record.at);
    return [
        ...(away === null ? [] : [{ kind: 'away_summary' as const, at, text: textOf(away) }]),
        ...(summary === null ? [] : [{ kind: 'compaction' as const, at, text: textOf(summary) }]),
    ];
};

const marksOf = (record: ClaudeRecord): readonly Mark[] => {
    const at = record.at === null ? null : instant(record.at);
    const boundary = compactBoundary(record);
    if (boundary !== null) {
        return [{ kind: 'compacted', at }];
    }
    return compactionFailed(record) ? [{ kind: 'compaction-failed', at }] : [];
};

const growthOf = (raw: boolean): Grew => {
    if (!isGrew(raw)) {
        throw new Error('agent-sdk: invalid growth');
    }
    return raw;
};

export function claudeReader(options: ClaudeReaderOptions): SessionReader {
    return {
        harness: harnessOf(),
        locate: async (session): Promise<Located> => {
            if (session.session === null) {
                return notFound('a session id');
            }
            try {
                const found = locateClaudeTranscript(session.session, options.root ?? claudeProjectsRoot());
                if (found === null || !isSourcePath(found.path)) {
                    return notFound(session.session);
                }
                return { kind: 'located', source: found.path };
            } catch (failure) {
                return unreadable(failure);
            }
        },
        read: async (source, was, budget: Count): Promise<Chunk | Unknown> => {
            try {
                const read = readJsonl(source, was.cursor, budget);
                const { records } = readClaudeRecords(read.lines);
                const prompts = records.flatMap((record) => {
                    const prompt = humanPrompt(record);
                    return prompt === null ? [] : [prompt];
                });
                const last = prompts.at(-1);
                const position: Position = { cursor: isCursor(read.cursor) ? read.cursor : was.cursor, tail: null };
                return {
                    kind: 'chunk',
                    entries: records.flatMap(entriesOf),
                    title: null,
                    lastPrompt: last === undefined ? null : textOf(last),
                    claudeRecap: null,
                    notes: records.flatMap(notesOf),
                    marks: records.flatMap(marksOf),
                    position,
                    grew: growthOf(read.grew),
                };
            } catch (failure) {
                return unreadable(failure);
            }
        },
    };
}
