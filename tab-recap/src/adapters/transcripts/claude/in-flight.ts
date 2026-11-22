import { readClaudeRecords, scanClaudeBackground } from '@stateforge-labs/harness-adapters/claude';
import type { BackgroundSplit, InFlightResult } from '#src/ports/transcripts.ts';
import { unknown } from '#src/ports/unknowable.ts';
import { must } from '#src/protocol/result.ts';
import { parseCount, type Count } from '#src/recap/domain/count.ts';
import { causeOf } from '#src/recap/domain/failure-cause.ts';
import { backgroundItem, backgroundLabel, backgroundTool, NO_RUNNING, runningOf } from '#src/recap/domain/in-flight.ts';
import type { BackgroundItem } from '#src/recap/domain/in-flight.ts';
import type { Presence } from '#src/recap/domain/presence.ts';
import { parseText, type Text, textOf } from '#src/recap/domain/text.ts';
import { parse } from '../jsonl.ts';

export { claudeInFlight } from './legacy.ts';

export const IN_FLIGHT_MAX_BYTES = 16 * 1024 * 1024;

export const CLAUDE_SPLIT: BackgroundSplit = { kind: 'separates' };

export interface TailScan { readonly count: Count; readonly items: readonly BackgroundItem[]; readonly unseen: Presence }

export function scanFlight(lines: readonly Text[]): TailScan | null {
    if (lines.every((line) => parse(line) === null) && lines.some((line) => line.trim() !== '')) return null;
    const scan = scanClaudeBackground(readClaudeRecords(lines).records);
    const items = scan.live.map((task) => backgroundItem(backgroundTool(textOf(task.tool)), task.description === null || task.description.trim() === '' ? null : backgroundLabel(textOf(task.description))));
    return { count: must(parseCount(items.length)), items, unseen: scan.unseenEnd ? 'present' : 'absent' };
}

export function claudeInFlightOf(lines: readonly Text[], truncated: Presence, split: BackgroundSplit = CLAUDE_SPLIT): InFlightResult {
    return answerOf(scanFlight(lines), truncated, split);
}

export function answerOf(scan: TailScan | null, truncated: Presence, split: BackgroundSplit): InFlightResult {
    if (scan === null) return unknown({ why: 'unreadable', detail: causeOf(must(parseText('no line of the transcript tail parses'))) });
    if (truncated === 'present' && scan.unseen === 'present') return unknown({ why: 'unreadable', detail: causeOf(must(parseText('the tail ends work that started before it'))) });
    return split.kind === 'separates' ? { kind: 'in-flight', count: NO_RUNNING, background: scan.items } : { kind: 'in-flight', count: runningOf(scan.count), background: [] };
}
