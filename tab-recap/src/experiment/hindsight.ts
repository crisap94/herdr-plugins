import type { Entry } from '#src/ports/transcripts.ts';

export const HINDSIGHT_ENTRIES = 6;
export const HINDSIGHT_CHARS = 8_000;

export interface Hindsight {
    readonly next_prompt: string | null;
    readonly following: readonly { readonly role: Entry['role']; readonly kind?: string; readonly text: string }[];
}

export function hindsightOf(entries: readonly Entry[], count = HINDSIGHT_ENTRIES, chars = HINDSIGHT_CHARS): Hindsight {
    let room = chars;
    const following: { role: Entry['role']; kind?: string; text: string }[] = [];
    for (const entry of entries.slice(0, count)) {
        if (room <= 0) break;
        const text = entry.text.length > room ? `${entry.text.slice(0, room)}…` : entry.text;
        room -= text.length;
        following.push({ role: entry.role, ...(entry.kind === undefined ? {} : { kind: entry.kind }), text });
    }
    const prompt = entries.find((entry) => entry.role === 'user')?.text ?? null;
    return { next_prompt: prompt === null ? null : prompt.slice(0, chars), following };
}

export const agentTextOf = (hindsight: Hindsight): string => hindsight.following.filter((entry) => entry.role !== 'user').map((entry) => entry.text).join('\n');
