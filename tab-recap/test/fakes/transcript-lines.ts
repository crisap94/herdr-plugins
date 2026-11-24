import { brand } from '@stateforge-labs/session-ledger';
import { parseCodexToolCall } from '@stateforge-labs/harness-adapters/codex';
import { sourcePathOf, type Position } from '@stateforge-labs/session-ledger';
import type { BackgroundSplit } from '@stateforge-labs/session-ledger';
import { countOf } from '@stateforge-labs/session-ledger';
import type { FsPath } from '#src/recap/domain/fs-path.ts';
import { registeredKindOf } from '@stateforge-labs/session-ledger';
import { textOf, type Text } from '@stateforge-labs/session-ledger';
import { claudeObservedOf } from '#src/adapters/transcripts/claude/context.ts';
import { CLAUDE_SPLIT, claudeInFlightOf } from '#src/adapters/transcripts/claude/in-flight.ts';
import { extractClaudeOf } from '#src/adapters/transcripts/claude/rows.ts';
import { codexObservedOf } from '#src/adapters/transcripts/codex/context.ts';
import { codexInFlightOf } from '#src/adapters/transcripts/codex/in-flight.ts';
import { codexMarksOf } from '#src/adapters/transcripts/codex/marks.ts';
import { codexCallsOf } from '#src/adapters/transcripts/codex/tool-calls.ts';
import { extractCodexOf } from '#src/adapters/transcripts/codex/transcripts.ts';
import { readJsonlFrom, type Row } from '#src/adapters/transcripts/jsonl.ts';
import { replayKindOfPath } from '#src/adapters/transcripts/registry.ts';
import { isPlainReadText, namedCallOf, type HarnessKind } from '#src/adapters/transcripts/tool-calls.ts';

export const fsPathOf = brand<string, 'FsPath'>;

export { sourcePathOf };

export const linesOf = (lines: readonly string[]): readonly Text[] => lines.map(textOf);

export const claudeObserved = (lines: readonly string[]): ReturnType<typeof claudeObservedOf> => claudeObservedOf(linesOf(lines));

export const codexObserved = (lines: readonly string[]): ReturnType<typeof codexObservedOf> => codexObservedOf(linesOf(lines));

export const claudeInFlight = (lines: readonly string[], truncated = false, split: BackgroundSplit = CLAUDE_SPLIT): ReturnType<typeof claudeInFlightOf> => claudeInFlightOf(linesOf(lines), truncated ? 'present' : 'absent', split);

export const codexInFlight = (lines: readonly string[], truncated: boolean): ReturnType<typeof codexInFlightOf> => codexInFlightOf(linesOf(lines), truncated ? 'present' : 'absent');

export const codexMarks = (lines: readonly string[]): ReturnType<typeof codexMarksOf> => codexMarksOf(linesOf(lines));

export const extractClaude = (lines: readonly string[]): ReturnType<typeof extractClaudeOf> => extractClaudeOf(linesOf(lines));

export const extractCodex = (lines: readonly string[]): ReturnType<typeof extractCodexOf> => extractCodexOf(linesOf(lines));

export const codexCalls = (name: string, raw: unknown, input: Row): ReturnType<typeof codexCallsOf> => codexCallsOf(textOf(name), parseCodexToolCall(name, raw), input);

export const namedCall = (harness: HarnessKind, name: string, input: Row): ReturnType<typeof namedCallOf> => namedCallOf(harness, textOf(name), input);

export const isPlainRead = (command: string): boolean => isPlainReadText(textOf(command)) === 'present';

export const readerKindOf = (raw: string): ReturnType<typeof registeredKindOf> => registeredKindOf(textOf(raw));

export const replayKindOf = (flag: string | null, file: string): ReturnType<typeof replayKindOfPath> => replayKindOfPath(flag === null ? null : textOf(flag), fsPathOf(file));

export function readJsonl(path: string, was: Position, budget: number): { readonly lines: readonly Text[]; readonly position: Position; readonly grew: boolean; readonly more: 'present' | 'absent' } {
    const read = readJsonlFrom(fsPathOf(path), was, countOf(budget));
    return { lines: read.lines, position: read.position, grew: read.grew === 'present', more: read.more };
}

export type { FsPath };
