import { readClaudeRecords, scanClaudeBackground } from '@stateforge-labs/harness-adapters/claude';
import type { BackgroundSplit, InFlightResult } from '#src/ports/transcripts.ts';
import { unknown } from '#src/ports/unknowable.ts';
import { backgroundItem, backgroundLabel, backgroundTool } from '#src/recap/domain/in-flight.ts';
import type { BackgroundItem } from '#src/recap/domain/in-flight.ts';
import { parse } from '../jsonl.ts';

export const IN_FLIGHT_MAX_BYTES = 16 * 1024 * 1024;

export const CLAUDE_SPLIT: BackgroundSplit = { kind: 'separates' };

export interface TailScan { readonly count: number; readonly items: readonly BackgroundItem[]; readonly unseen: boolean }

export function scanFlight(lines: readonly string[]): TailScan | null {
    if (lines.every((line) => parse(line) === null) && lines.some((line) => line.trim() !== '')) return null;
    const scan = scanClaudeBackground(readClaudeRecords(lines).records);
    const items = scan.live.map((task) => backgroundItem(backgroundTool(task.tool), task.description === null || task.description.trim() === '' ? null : backgroundLabel(task.description)));
    return { count: items.length, items, unseen: scan.unseenEnd };
}

export function claudeInFlight(lines: readonly string[], truncated = false, split: BackgroundSplit = CLAUDE_SPLIT): InFlightResult {
    return answerOf(scanFlight(lines), truncated, split);
}

export function answerOf(scan: TailScan | null, truncated: boolean, split: BackgroundSplit): InFlightResult {
    if (scan === null) return unknown({ why: 'unreadable', detail: 'no line of the transcript tail parses' });
    if (truncated && scan.unseen) return unknown({ why: 'unreadable', detail: 'the tail ends work that started before it' });
    return split.kind === 'separates' ? { kind: 'in-flight', count: 0, background: scan.items } : { kind: 'in-flight', count: scan.count, background: [] };
}
