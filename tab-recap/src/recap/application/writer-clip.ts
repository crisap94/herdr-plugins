// How much of one turn the writer is given: its beginning and its end, because an answer's conclusion is at the end.

/** [beginning, end] characters kept per role. */
const KEEP = { user: [700, 300], agent: [300, 900] } as const;

const GAP = '\n[…]\n';

export interface Clipped {
    readonly text: string;
    readonly clipped: boolean;
}

export function clipTurn(role: 'user' | 'agent', value: string): Clipped {
    const [head, tail] = KEEP[role];
    const body = value.trim();
    return body.length <= head + tail ? { text: body, clipped: false } : { text: `${body.slice(0, head).trimEnd()}${GAP}${body.slice(-tail).trimStart()}`, clipped: true };
}

/** The first `max` characters of a note or a command; the second says whether anything was cut. */
export function clipHead(value: string, max: number): Clipped {
    const body = value.trim();
    return body.length <= max ? { text: body, clipped: false } : { text: body.slice(0, max).trimEnd(), clipped: true };
}

