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

export function clipHead(value: string, max: number): Clipped {
    const body = value.trim();
    return body.length <= max ? { text: body, clipped: false } : { text: body.slice(0, max).trimEnd(), clipped: true };
}

