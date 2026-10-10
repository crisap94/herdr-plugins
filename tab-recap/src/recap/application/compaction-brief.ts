import type { CompactionBriefs } from '#src/ports/compaction-briefs.ts';
import { isUnknown, saying } from '#src/ports/unknowable.ts';
import type { RecapSections } from '#src/recap/domain/shape.ts';
import { MESSAGE_LIMIT as BRIEF_LIMIT } from './compaction-message.ts';

export const FORBIDDEN = /\b(recaps?|plugins?|herdr|tabs?)\b/iu;
const PHRASES = /\b(tab-recap|recap column)\b/giu;
const WORDS = /\b(recaps?|plugins?|herdr|tabs?)\b/giu;

export type Vetted = { readonly kind: 'ok'; readonly text: string } | { readonly kind: 'bad'; readonly why: string };

const family = (word: string): string => word.toLowerCase().replace(/s$/u, '');

export function refusedIn(text: string, own: string): readonly string[] {
    const spoken = new Set([...own.matchAll(PHRASES)].map((hit) => hit[0].toLowerCase()));
    const phrases = [...text.matchAll(PHRASES)].map((hit) => hit[0]).filter((phrase) => !spoken.has(phrase.toLowerCase()));
    const used = new Set([...own.matchAll(WORDS)].map((hit) => family(hit[0])));
    const words = [...text.replace(PHRASES, ' ').matchAll(WORDS)].map((hit) => hit[0]).filter((word) => !used.has(family(word)));
    return [...phrases, ...words];
}

export function clean(sections: RecapSections, own: string): RecapSections {
    const ok = (line: string): boolean => refusedIn(line, own).length === 0;
    return {
        goal: ok(sections.goal) ? sections.goal : '', now: sections.now.filter(ok), needs: sections.needs.filter(ok), done: sections.done.filter(ok), decisions: sections.decisions.filter(ok),
        next: sections.next.filter(ok), links: sections.links.filter(ok), rules: sections.rules.filter(ok),
    };
}

function cut(text: string, limit: number): string {
    const head = text.slice(0, limit);
    const sentence = Math.max(head.lastIndexOf('. '), head.lastIndexOf('? '), head.lastIndexOf('! '));
    if (sentence > 0) {
        return head.slice(0, sentence + 1);
    }
    return /[.?!]$/u.test(head) ? head : head.slice(0, Math.max(1, head.lastIndexOf(' ')));
}

export function vetted(answer: string, own = ''): Vetted {
    const line = answer.replace(/\s+/gu, ' ').trim();
    if (line === '') {
        return { kind: 'bad', why: 'the answer is empty' };
    }
    const word = refusedIn(line, own)[0];
    return word === undefined ? { kind: 'ok', text: line.length <= BRIEF_LIMIT ? line : cut(line, BRIEF_LIMIT) } : { kind: 'bad', why: `the answer says "${word}"` };
}

export interface BriefDeskDeps {
    readonly writer: () => CompactionBriefs | null;
    log(line: string): void;
}

export interface Written {
    readonly text: string | null;
    readonly why: string | null;
}

export class BriefDesk {
    private readonly deps: BriefDeskDeps;

    constructor(deps: BriefDeskDeps) {
        this.deps = deps;
    }

    enabled(): boolean {
        return this.deps.writer() !== null;
    }

    job(): string | null {
        return this.deps.writer()?.job ?? null;
    }

    async write(document: string, own = '', correction?: string): Promise<Written> {
        const writer = this.deps.writer();
        if (writer === null) {
            return { text: null, why: null };
        }
        const answered = await writer.write(document, correction);
        const checked = isUnknown(answered) ? { kind: 'bad' as const, why: saying(answered.why) } : vetted(answered.text, own);
        if (checked.kind === 'ok') {
            return { text: checked.text, why: null };
        }
        this.deps.log(`compaction brief: ${writer.backend} gave none (${checked.why}); the template is used`);
        return { text: null, why: checked.why };
    }
}
