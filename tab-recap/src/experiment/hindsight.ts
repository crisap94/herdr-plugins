import { must } from '#src/protocol/result.ts';
import type { Entry } from '#src/ports/transcripts.ts';
import { parseCount, type Count } from '#src/recap/domain/count.ts';
import { parseText, type Text } from '#src/recap/domain/text.ts';

export const HINDSIGHT_ENTRIES = 6;
export const HINDSIGHT_CHARS = 8_000;

const ENTRIES = must(parseCount(HINDSIGHT_ENTRIES));
const CHARS = must(parseCount(HINDSIGHT_CHARS));

export interface FollowingEntry { readonly role: Entry['role']; readonly kind?: NonNullable<Entry['kind']>; readonly text: Text }

export interface Hindsight {
    readonly next_prompt: Text | null;
    readonly following: readonly FollowingEntry[];
}

export function hindsightOf(entries: readonly Entry[], count: Count = ENTRIES, chars: Count = CHARS): Hindsight {
    let room: number = chars;
    const following: FollowingEntry[] = [];
    for (const entry of entries.slice(0, count)) {
        if (room <= 0) break;
        const text = must(parseText(entry.text.length > room ? `${entry.text.slice(0, room)}…` : entry.text));
        room -= text.length;
        following.push({ role: entry.role, ...(entry.kind === undefined ? {} : { kind: entry.kind }), text });
    }
    const prompt = entries.find((entry) => entry.role === 'user')?.text ?? null;
    return { next_prompt: prompt === null ? null : must(parseText(prompt.slice(0, chars))), following };
}

export const agentTextOf = (hindsight: Hindsight): Text => must(parseText(hindsight.following.filter((entry) => entry.role !== 'user').map((entry) => entry.text).join('\n')));
