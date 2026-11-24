import { tokensOf } from '@stateforge-labs/session-ledger';
import type { CompactionRow } from './model.ts';
import { assertSeconds, parseWords, parseWordsOrNull } from './wording.ts';
import type { TextWording } from './wording.ts';
import type { Style } from './wrap.ts';
import { countOf } from '@stateforge-labs/session-ledger';

export function stageClockOf(since: number, now: number): string {
    const seconds = Math.max(0, Math.floor((now - since) / 1000));
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

export function figuresOf(record: Pick<CompactionRow, 'tokensBefore' | 'tokensAfter' | 'tookMs'>, m: TextWording): { readonly pair: string; readonly tokens: string; readonly took: string } {
    const { tokensBefore: before, tokensAfter: after, tookMs } = record;
    const seconds = Math.round((tookMs ?? 0) / 1000);
    assertSeconds(seconds);
    const [from, to] = before === null || after === null ? ['', ''] : [tokensOf(countOf(before)), tokensOf(countOf(after))];
    return {
        pair: from === '' ? '' : `${from} → ${to}`,
        tokens: from === '' ? '' : m.compaction.stage.tokens(parseWords(from), parseWords(to)),
        took: tookMs === null ? '' : m.compaction.stage.took(seconds),
    };
}

type View = { readonly wording: TextWording; readonly style: Style };

function compactedLine(record: CompactionRow, view: View, agent: string | null): string {
    const { wording: m, style } = view;
    const figures = figuresOf(record, m);
    const done = style.green(`✓ ${m.compaction.stage.compacted(parseWordsOrNull(agent), parseWords([figures.pair, figures.took].filter((part) => part !== '').join(' · ')))}`);
    return record.brief === 'template' && agent === null ? `${done}${style.gray(` · ${m.compaction.stage.template}`)}` : done;
}

export function stageLine(record: CompactionRow, now: number, view: View, agent: string | null = null): string {
    const { wording: m, style } = view;
    const { stage } = m.compaction;
    const clock = parseWords(stageClockOf(record.stageAt, now));
    const who = parseWordsOrNull(agent);
    const why = parseWordsOrNull(record.why);
    switch (record.stage) {
        case 'briefing':
            return style.yellow(`✎ ${stage.briefing(who, parseWordsOrNull(record.writer), clock)}`);
        case 'compacting':
            return style.yellow(`◐ ${record.queued ? stage.queued(who, clock) : stage.compacting(who, clock)}`);
        case 'restoring':
            return style.yellow(`◐ ${stage.restoring(who)}`);
        case 'compacted':
            return compactedLine(record, view, agent);
        case 'failed':
            return style.red(`✗ ${stage.failed(who, why)}`);
        case 'unconfirmed':
            return style.gray(`? ${stage.unconfirmed(who, why)}`);
        case 'skipped':
            return style.gray(`– ${stage.skipped(who, why)}`);
        default: {
            const exhaustive: never = record.stage;
            return String(exhaustive);
        }
    }
}
