import type { HistoryFact } from '#src/ports/ledger.ts';
import type { Entry } from '#src/ports/transcripts.ts';

export interface AutocompactState {
    readonly last_prompt: string | null;
    readonly last_reply: string | null;
    readonly recent_turns: readonly { readonly role: string; readonly text: string }[];
    readonly goal: string | null;
    readonly open_work: readonly { readonly section: string; readonly text: string }[];
}

export const REPLY_HEAD = 600;
export const REPLY_TAIL = 1200;
export const TURNS_SHOWN = 6;
export const TURN_CLIP = 600;
export const OPEN_WORK_SHOWN = 12;
const OPEN_WORK_SECTIONS: ReadonlySet<string> = new Set(['now', 'next', 'needs']);

const clip = (text: string, limit: number): string => (text.length > limit ? `${text.slice(0, limit - 1)}…` : text);

export const replyOf = (text: string): string => (text.length > REPLY_HEAD + REPLY_TAIL ? `${text.slice(0, REPLY_HEAD)}[…]${text.slice(-REPLY_TAIL)}` : text);

const turnOf = (entry: Entry): { role: string; text: string } => ({ role: entry.role, text: clip(entry.role === 'tool' ? `${entry.kind ?? 'other'}: ${entry.text}` : entry.text, TURN_CLIP) });

export function autocompactState(recent: readonly Entry[], history: readonly HistoryFact[]): AutocompactState {
    const open = history.filter((fact) => fact.state === 'open');
    const [prompt, reply] = [recent.findLast((entry) => entry.role === 'user'), recent.findLast((entry) => entry.role === 'agent')];
    return {
        last_prompt: prompt?.text ?? null,
        last_reply: reply === undefined ? null : replyOf(reply.text),
        recent_turns: recent.slice(-TURNS_SHOWN).map(turnOf),
        goal: open.find((fact) => fact.section === 'goal')?.text ?? null,
        open_work: open.filter((fact) => OPEN_WORK_SECTIONS.has(fact.section)).slice(0, OPEN_WORK_SHOWN).map((fact) => ({ section: fact.section, text: fact.text })),
    };
}
