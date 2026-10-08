// The brief an agent is compacted with: the writer's answer checked, the template when it gives none. The agent must never
// learn where its instructions come from, so an answer that names the plugin is refused.
import type { CompactionBriefs } from '#src/ports/compaction-briefs.ts';
import { isUnknown, saying } from '#src/ports/unknowable.ts';
import type { RecapSections } from '#src/recap/domain/shape.ts';
import { MESSAGE_LIMIT as BRIEF_LIMIT } from './compaction-message.ts';

/** Words no message to an agent may hold: they would tell it about the plugin that wrote the message. */
export const FORBIDDEN = /\b(recaps?|plugins?|herdr|tabs?)\b/iu;
/** The names of the plugin's own parts: refused unless the conversation itself says them. */
const PHRASES = /\b(tab-recap|recap column)\b/giu;
const WORDS = /\b(recaps?|plugins?|herdr|tabs?)\b/giu;

export type Vetted = { readonly kind: 'ok'; readonly text: string } | { readonly kind: 'bad'; readonly why: string };

const family = (word: string): string => word.toLowerCase().replace(/s$/u, '');

/** The forbidden names and words `text` holds, except those the agent's own conversation (`own`) already uses: its work may be about a browser tab or a terminal app. */
export function refusedIn(text: string, own: string): readonly string[] {
    const spoken = new Set([...own.matchAll(PHRASES)].map((hit) => hit[0].toLowerCase()));
    const phrases = [...text.matchAll(PHRASES)].map((hit) => hit[0]).filter((phrase) => !spoken.has(phrase.toLowerCase()));
    const used = new Set([...own.matchAll(WORDS)].map((hit) => family(hit[0])));
    const words = [...text.replace(PHRASES, ' ').matchAll(WORDS)].map((hit) => hit[0]).filter((word) => !used.has(family(word)));
    return [...phrases, ...words];
}

/** The recap's items that carry a refused word are left out: the template is built from them. */
export function clean(sections: RecapSections, own: string): RecapSections {
    const ok = (line: string): boolean => refusedIn(line, own).length === 0;
    return {
        goal: ok(sections.goal) ? sections.goal : '', now: sections.now.filter(ok), needs: sections.needs.filter(ok), done: sections.done.filter(ok), decisions: sections.decisions.filter(ok),
        next: sections.next.filter(ok), links: sections.links.filter(ok), rules: sections.rules.filter(ok),
    };
}

/** The longest cut of `text` within `limit` that ends a sentence; else at a word. */
function cut(text: string, limit: number): string {
    const head = text.slice(0, limit);
    const sentence = Math.max(head.lastIndexOf('. '), head.lastIndexOf('? '), head.lastIndexOf('! '));
    if (sentence > 0) {
        return head.slice(0, sentence + 1);
    }
    return /[.?!]$/u.test(head) ? head : head.slice(0, Math.max(1, head.lastIndexOf(' ')));
}

/** Trimmed, folded to one line, free of forbidden words the conversation (`own`) does not use itself, at most BRIEF_LIMIT characters. */
export function vetted(answer: string, own = ''): Vetted {
    const line = answer.replace(/\s+/gu, ' ').trim();
    if (line === '') {
        return { kind: 'bad', why: 'the answer is empty' };
    }
    const word = refusedIn(line, own)[0];
    return word === undefined ? { kind: 'ok', text: line.length <= BRIEF_LIMIT ? line : cut(line, BRIEF_LIMIT) } : { kind: 'bad', why: `the answer says "${word}"` };
}

export interface BriefDeskDeps {
    /** the brief's writer as the job is set now; null when it is off or no harness is there */
    readonly writer: () => CompactionBriefs | null;
    log(line: string): void;
}

/** The brief, or why there is none (then the template is used). */
export interface Written {
    readonly text: string | null;
    readonly why: string | null;
}

/** Writes the brief; no text when none was given (the template is used then, and the log says why). */
export class BriefDesk {
    private readonly deps: BriefDeskDeps;

    constructor(deps: BriefDeskDeps) {
        this.deps = deps;
    }

    /** whether a brief will be written at all (the job is on and a harness is there) */
    enabled(): boolean {
        return this.deps.writer() !== null;
    }

    /** the job as it will run: "codex · gpt-6-luna · high"; null when none */
    job(): string | null {
        return this.deps.writer()?.job ?? null;
    }

    /** `own` is the agent's own text (its recent turns and the history items): a word it uses itself is not refused. */
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
