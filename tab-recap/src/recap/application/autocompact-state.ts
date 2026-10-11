import type { HistoryFact } from '#src/ports/ledger.ts';
import type { Entry } from '#src/ports/transcripts.ts';
import { must } from '#src/protocol/result.ts';
import { parseCount, type Count } from '#src/recap/domain/count.ts';
import { parseText, type Text } from '#src/recap/domain/text.ts';

export interface Turn {
    readonly role: Entry['role'];
    readonly text: Text;
}

export interface OpenWorkItem {
    readonly section: Text;
    readonly text: Text;
}

export interface AutocompactState {
    readonly last_prompt: Text | null;
    readonly last_reply: Text | null;
    readonly recent_turns: readonly Turn[];
    readonly goal: Text | null;
    readonly open_work: readonly OpenWorkItem[];
}

export const REPLY_HEAD = 600;
export const REPLY_TAIL = 1200;
export const TURNS_SHOWN = 6;
const TURN_CLIP = must(parseCount(600));
export const OPEN_WORK_SHOWN = 12;
const OPEN_WORK_SECTIONS: ReadonlySet<string> = new Set(['now', 'next', 'needs']);

const clip = (text: Text, limit: Count): Text => {
    if (text.length <= limit) {
        return text;
    }
    const cut = parseText(`${text.slice(0, limit - 1)}…`);
    return cut.kind === 'ok' ? cut.value : text;
};

export const replyOf = (text: Text): Text => {
    if (text.length <= REPLY_HEAD + REPLY_TAIL) {
        return text;
    }
    const cut = parseText(`${text.slice(0, REPLY_HEAD)}[…]${text.slice(-REPLY_TAIL)}`);
    return cut.kind === 'ok' ? cut.value : text;
};

const textOf = (entry: Entry | undefined): Text | null => {
    if (entry === undefined) {
        return null;
    }
    const text = parseText(entry.text);
    return text.kind === 'ok' ? text.value : null;
};

const factTextOf = (fact: HistoryFact | undefined): Text | null => {
    if (fact === undefined) {
        return null;
    }
    const text = parseText(fact.text);
    return text.kind === 'ok' ? text.value : null;
};

const turnOf = (entry: Entry): readonly Turn[] => {
    const text = parseText(entry.role === 'tool' ? `${entry.kind ?? 'other'}: ${entry.text}` : entry.text);
    return text.kind === 'ok' ? [{ role: entry.role, text: clip(text.value, TURN_CLIP) }] : [];
};

const openItemOf = (fact: HistoryFact): readonly OpenWorkItem[] => {
    const section = parseText(fact.section);
    const text = parseText(fact.text);
    return section.kind === 'ok' && text.kind === 'ok' ? [{ section: section.value, text: text.value }] : [];
};

export function autocompactState(recent: readonly Entry[], history: readonly HistoryFact[]): AutocompactState {
    const open = history.filter((fact) => fact.state === 'open');
    const [prompt, reply] = [recent.findLast((entry) => entry.role === 'user'), recent.findLast((entry) => entry.role === 'agent')];
    const replyText = textOf(reply);
    return {
        last_prompt: textOf(prompt),
        last_reply: replyText === null ? null : replyOf(replyText),
        recent_turns: recent.slice(-TURNS_SHOWN).flatMap(turnOf),
        goal: factTextOf(open.find((fact) => fact.section === 'goal')),
        open_work: open.filter((fact) => OPEN_WORK_SECTIONS.has(fact.section)).slice(0, OPEN_WORK_SHOWN).flatMap(openItemOf),
    };
}
