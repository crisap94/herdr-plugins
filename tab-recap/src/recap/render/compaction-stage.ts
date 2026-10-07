// What a lane's header says while a compaction is shown: the stage, its colour and its clock. Pure; the wording is in the catalogs.
import type { Messages } from '#src/i18n/messages.ts';
import { tokensOf } from '#src/recap/domain/compaction.ts';
import type { CompactionRecord } from '#src/ports/compaction-records.ts';
import type { Style } from './wrap.ts';

/** `m:ss` from the stage's start. */
export function clockOf(since: number, now: number): string {
    const seconds = Math.max(0, Math.floor((now - since) / 1000));
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

/** What the records said, as words: the pair of counts (only when both are known) and the time it took (when known). */
export function figuresOf(record: Pick<CompactionRecord, 'tokensBefore' | 'tokensAfter' | 'tookMs'>, m: Messages): { readonly pair: string; readonly tokens: string; readonly took: string } {
    const { tokensBefore: before, tokensAfter: after, tookMs } = record;
    const [from, to] = before === null || after === null ? ['', ''] : [tokensOf(before), tokensOf(after)];
    return {
        pair: from === '' ? '' : `${from} → ${to}`,
        tokens: from === '' ? '' : m.compaction.stage.tokens(from, to),
        took: tookMs === null ? '' : m.compaction.stage.took(Math.round(tookMs / 1000)),
    };
}

type View = { readonly messages: Messages; readonly style: Style };

/** `✓ compacted 39.5k → 3.1k · 16 s`, and the template's tag in gray on the column. */
function compactedLine(record: CompactionRecord, view: View, agent: string | null): string {
    const { messages: m, style } = view;
    const figures = figuresOf(record, m);
    const done = style.green(`✓ ${m.compaction.stage.compacted(agent, [figures.pair, figures.took].filter((part) => part !== '').join(' · '))}`);
    return record.brief === 'template' && agent === null ? `${done}${style.gray(` · ${m.compaction.stage.template}`)}` : done;
}

/** The stage as one painted line. `agent` is given on the phone's bar (which has no lane header to say whose it is). */
export function stageLine(record: CompactionRecord, now: number, view: View, agent: string | null = null): string {
    const { messages: m, style } = view;
    const { stage } = m.compaction;
    const clock = clockOf(record.stageAt, now);
    switch (record.stage) {
        case 'briefing':
            return style.yellow(`✎ ${stage.briefing(agent, record.writer, clock)}`);
        case 'compacting':
            return style.yellow(`◐ ${stage.compacting(agent, clock)}`);
        case 'restoring':
            return style.yellow(`◐ ${stage.restoring(agent)}`);
        case 'compacted':
            return compactedLine(record, view, agent);
        case 'failed':
            return style.red(`✗ ${stage.failed(agent, record.why)}`);
        case 'unconfirmed':
            return style.gray(`? ${stage.unconfirmed(agent, record.why)}`);
        case 'skipped':
            return style.gray(`– ${stage.skipped(agent, record.why)}`);
        default: {
            const exhaustive: never = record.stage;
            return String(exhaustive);
        }
    }
}
