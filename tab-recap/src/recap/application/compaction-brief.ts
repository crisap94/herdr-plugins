import type { BriefWriter } from '#src/ports/compaction-briefs.ts';
import { isUnknown, saying } from '@stateforge-labs/session-ledger';
import type { RecapSections } from '@stateforge-labs/session-ledger';
import { FORBIDDEN, FORBIDDEN_PHRASE_PATTERN as PHRASES, FORBIDDEN_WORD_PATTERN as WORDS } from '#src/recap/domain/forbidden-words.ts';
import { MESSAGE_LIMIT as BRIEF_LIMIT } from './compaction-message.ts';
import { must } from '@stateforge-labs/session-ledger';
import { parseCount, type Count } from '@stateforge-labs/session-ledger';
import { parseText, type Text } from '@stateforge-labs/session-ledger';
import type { Presence } from '#src/recap/domain/presence.ts';

export { FORBIDDEN };

export type Vetted = { readonly kind: 'ok'; readonly text: Text } | { readonly kind: 'bad'; readonly why: Text };

type Clearance = 'clear' | 'refused';

const EMPTY = must(parseText(''));
const EMPTY_ANSWER = must(parseText('the answer is empty'));
const LIMIT = must(parseCount(BRIEF_LIMIT));



export function refusedIn(text: Text, own: Text): readonly Text[] {
    const spoken = new Set([...own.matchAll(PHRASES)].map((hit) => hit[0].toLowerCase()));
    const phrases = [...text.matchAll(PHRASES)].map((hit) => hit[0]).filter((phrase) => !spoken.has(phrase.toLowerCase()));
    const used = new Set([...own.matchAll(WORDS)].map((hit) => hit[0].toLowerCase().replace(/s$/u, '')));
    const words = [...text.replace(PHRASES, ' ').matchAll(WORDS)].map((hit) => hit[0]).filter((word) => !used.has(word.toLowerCase().replace(/s$/u, '')));
    return [...phrases, ...words].map((line) => must(parseText(line)));
}

const clearance = (line: Text, own: Text): Clearance => (refusedIn(line, own).length === 0 ? 'clear' : 'refused');

export function clean(sections: RecapSections, mine: Text): RecapSections {
    const goal = must(parseText(sections.goal));
    return {
        goal: clearance(goal, mine) === 'clear' ? goal : EMPTY,
        now: sections.now.map((line) => must(parseText(line))).filter((line) => clearance(line, mine) === 'clear'),
        needs: sections.needs.map((line) => must(parseText(line))).filter((line) => clearance(line, mine) === 'clear'),
        done: sections.done.map((line) => must(parseText(line))).filter((line) => clearance(line, mine) === 'clear'),
        decisions: sections.decisions.map((line) => must(parseText(line))).filter((line) => clearance(line, mine) === 'clear'),
        next: sections.next.map((line) => must(parseText(line))).filter((line) => clearance(line, mine) === 'clear'),
        links: sections.links.map((line) => must(parseText(line))).filter((line) => clearance(line, mine) === 'clear'),
        rules: sections.rules.map((line) => must(parseText(line))).filter((line) => clearance(line, mine) === 'clear'),
    };
}

function cut(text: Text, limit: Count): Text {
    const head = text.slice(0, limit);
    const sentence = Math.max(head.lastIndexOf('. '), head.lastIndexOf('? '), head.lastIndexOf('! '));
    if (sentence > 0) {
        return must(parseText(head.slice(0, sentence + 1)));
    }
    return must(parseText(/[.?!]$/u.test(head) ? head : head.slice(0, Math.max(1, head.lastIndexOf(' ')))));
}

export function vetted(answer: Text, own: Text = EMPTY): Vetted {
    const line = must(parseText(answer.replace(/\s+/gu, ' ').trim()));
    if (line === '') {
        return { kind: 'bad', why: EMPTY_ANSWER };
    }
    const word = refusedIn(line, own)[0];
    return word === undefined ? { kind: 'ok', text: line.length <= LIMIT ? line : cut(line, LIMIT) } : { kind: 'bad', why: must(parseText(`the answer says "${word}"`)) };
}

export interface BriefDeskDeps {
    readonly writer: () => BriefWriter | null;
    log(line: Text): void;
}

export interface Written {
    readonly text: Text | null;
    readonly why: Text | null;
}

export class BriefDesk {
    private readonly deps: BriefDeskDeps;

    constructor(deps: BriefDeskDeps) {
        this.deps = deps;
    }

    enabled(): Presence {
        return this.deps.writer() === null ? 'absent' : 'present';
    }

    job(): Text | null {
        const job = this.deps.writer()?.job ?? null;
        return job === null ? null : must(parseText(job));
    }

    async write(document: Text, own: Text = EMPTY, correction?: Text): Promise<Written> {
        const writer = this.deps.writer();
        if (writer === null) {
            return { text: null, why: null };
        }
        const answered = await writer.write(document, correction);
        const checked = isUnknown(answered) ? { kind: 'bad' as const, why: must(parseText(saying(answered.why))) } : vetted(must(parseText(answered.text)), own);
        if (checked.kind === 'ok') {
            return { text: checked.text, why: null };
        }
        this.deps.log(must(parseText(`compaction brief: ${writer.backend} gave none (${checked.why}); the template is used`)));
        return { text: null, why: checked.why };
    }
}
