import { readClaudeRecords, scanClaudeBackground } from '@stateforge-labs/harness-adapters/claude';
import type { BackgroundSplit, InFlightResult } from '@stateforge-labs/session-ledger';
import { unknown } from '@stateforge-labs/session-ledger';
import { must } from '@stateforge-labs/session-ledger';
import { parseCount, type Count } from '@stateforge-labs/session-ledger';
import { causeOf } from '@stateforge-labs/session-ledger';
import { backgroundItem, backgroundLabel, backgroundTool, NO_RUNNING, runningOf } from '@stateforge-labs/session-ledger';
import type { BackgroundItem } from '@stateforge-labs/session-ledger';
import type { Presence } from '#src/recap/domain/presence.ts';
import { parseText, type Text, textOf } from '@stateforge-labs/session-ledger';
import { parseLine } from '../jsonl.ts';

export const IN_FLIGHT_MAX_BYTES = 16 * 1024 * 1024;

export const CLAUDE_SPLIT: BackgroundSplit = { kind: 'separates' };

export interface TailScan { readonly count: Count; readonly items: readonly BackgroundItem[]; readonly unseen: Presence }

export function scanFlight(lines: readonly Text[]): TailScan | null {
    if (lines.every((line) => parseLine(line) === null) && lines.some((line) => line.trim() !== '')) return null;
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
