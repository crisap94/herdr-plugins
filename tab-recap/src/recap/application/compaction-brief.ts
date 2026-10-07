// The brief an agent is compacted with: the writer's answer checked, the template when it gives none. The agent must never
// learn where its instructions come from, so an answer that names the plugin is refused.
import type { CompactionBriefs } from '#src/ports/compaction-briefs.ts';
import { isUnknown, saying } from '#src/ports/unknowable.ts';
import { MESSAGE_LIMIT as BRIEF_LIMIT } from './compaction-message.ts';

/** Words no message to an agent may hold: they would tell it about the plugin that wrote the message. */
export const FORBIDDEN = /\b(recaps?|plugins?|herdr|tabs?)\b/iu;

export type Vetted = { readonly kind: 'ok'; readonly text: string } | { readonly kind: 'bad'; readonly why: string };

/** The longest cut of `text` within `limit` that ends a sentence; else at a word. */
function cut(text: string, limit: number): string {
    const head = text.slice(0, limit);
    const sentence = Math.max(head.lastIndexOf('. '), head.lastIndexOf('? '), head.lastIndexOf('! '));
    if (sentence > 0) {
        return head.slice(0, sentence + 1);
    }
    return /[.?!]$/u.test(head) ? head : head.slice(0, Math.max(1, head.lastIndexOf(' ')));
}

/** Trimmed, folded to one line, free of forbidden words, at most BRIEF_LIMIT characters. */
export function vetted(answer: string): Vetted {
    const line = answer.replace(/\s+/gu, ' ').trim();
    if (line === '') {
        return { kind: 'bad', why: 'the answer is empty' };
    }
    const word = FORBIDDEN.exec(line)?.[0];
    return word === undefined ? { kind: 'ok', text: line.length <= BRIEF_LIMIT ? line : cut(line, BRIEF_LIMIT) } : { kind: 'bad', why: `the answer says "${word}"` };
}

export interface BriefDeskDeps {
    /** the brief's writer as the job is set now; null when it is off or no harness is there */
    readonly writer: () => CompactionBriefs | null;
    log(line: string): void;
}

/** Writes the brief; null when none was given (the template is used then, and the log says why). */
export class BriefDesk {
    private readonly deps: BriefDeskDeps;

    constructor(deps: BriefDeskDeps) {
        this.deps = deps;
    }

    /** whether a brief will be written at all (the job is on and a harness is there) */
    enabled(): boolean {
        return this.deps.writer() !== null;
    }

    async write(document: string): Promise<string | null> {
        const writer = this.deps.writer();
        if (writer === null) {
            return null;
        }
        const answered = await writer.write(document);
        const checked = isUnknown(answered) ? { kind: 'bad' as const, why: saying(answered.why) } : vetted(answered.text);
        if (checked.kind === 'ok') {
            return checked.text;
        }
        this.deps.log(`compaction brief: ${writer.backend} gave none (${checked.why}); the template is used`);
        return null;
    }
}
