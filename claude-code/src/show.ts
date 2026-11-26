import type { Clock, Fact, Section } from '@stateforge-labs/session-ledger';
import { followedOf } from './compose.ts';
import { readingWith } from './read.ts';
import { newestSessionIn, sessionNamed } from './sessions.ts';
import type { SessionNote } from './sessions.ts';

const SECTION_IDS: readonly Section[] = ['goal', 'now', 'needs', 'done', 'decisions', 'next', 'links', 'rules'];

export const SECTION_TITLES: Readonly<Record<Section, string>> = {
    goal: 'Goal', now: 'Now', needs: 'Waiting for you', done: 'Done', decisions: 'Decisions', next: 'Next', links: 'References', rules: 'Standing rules',
};

export interface CommandIo {
    readonly stateDir: string;
    readonly cwd: string;
    readonly clock: Clock;
    readonly log: (line: string) => void;
}

export type CommandAnswer = { readonly code: 0 | 1 | 2; readonly out: string; readonly err: string };

const minuteOf = (at: number): string => `${new Date(at).toISOString().slice(0, 16).replace('T', ' ')} UTC`;

interface Shown {
    readonly updatedAt: number | null;
    readonly open: readonly Fact[];
}

const factsFor = (io: CommandIo, note: SessionNote): Shown | null => {
    const followed = followedOf(note);
    return readingWith<Shown | null>(
        io.stateDir,
        io.clock,
        io.log,
        (reading) => {
            reading.engine.follow(followed.scope, followed.session);
            const last = reading.records.lastRunOf(followed.scope);
            const open = reading.openFacts(followed.scope, followed.session.key).filter((fact) => fact.state === 'open');
            return { updatedAt: last === null || 'kind' in last ? null : last.at, open };
        },
        null,
    );
};

function ledgerText(note: SessionNote, shown: Shown): string {
    const head = [`session  ${note.session}`, `folder   ${note.cwd}`, `updated  ${shown.updatedAt === null ? 'never' : minuteOf(shown.updatedAt)}`];
    const open = shown.open.toSorted((a, b) => b.lastAt - a.lastAt);
    const groups = SECTION_IDS.flatMap((section) => {
        const lines = open.filter((fact) => fact.section === section).map((fact) => `  - ${fact.text}`);
        return lines.length === 0 ? [] : ['', SECTION_TITLES[section], ...lines];
    });
    return [...head, ...(groups.length === 0 ? ['', 'nothing open yet'] : groups), ''].join('\n');
}

export type ShowArgs = { readonly kind: 'newest' } | { readonly kind: 'session'; readonly session: string } | { readonly kind: 'usage' };

export function showArgsOf(args: readonly string[]): ShowArgs {
    if (args.length === 0) {
        return { kind: 'newest' };
    }
    const [flag, session = '', ...rest] = args;
    return flag === '--session' && session !== '' && rest.length === 0 ? { kind: 'session', session } : { kind: 'usage' };
}

export const USAGE = 'usage: session-ledger show [--session <id>]\n       session-ledger line < status-line.json\n';

export function showAnswer(io: CommandIo, args: readonly string[]): CommandAnswer {
    const parsed = showArgsOf(args);
    if (parsed.kind === 'usage') {
        return { code: 2, out: '', err: USAGE };
    }
    const note = parsed.kind === 'session' ? sessionNamed(io.stateDir, parsed.session) : newestSessionIn(io.stateDir, io.cwd);
    if (note === null) {
        const which = parsed.kind === 'session' ? `the session ${parsed.session}` : `a session started in ${io.cwd}`;
        return { code: 1, out: '', err: `session-ledger: no ledger is kept for ${which}\n` };
    }
    const shown = factsFor(io, note);
    return shown === null ? { code: 1, out: '', err: `session-ledger: the ledger in ${io.stateDir} cannot be read\n` } : { code: 0, out: ledgerText(note, shown), err: '' };
}

const sessionIdOf = (payload: string): string => {
    try {
        const found: unknown = JSON.parse(payload);
        const id = typeof found === 'object' && found !== null && 'session_id' in found ? found.session_id : null;
        return typeof id === 'string' ? id : '';
    } catch {
        return '';
    }
};

export function lineAnswer(io: CommandIo, payload: string): CommandAnswer {
    const session = sessionIdOf(payload);
    const note = session === '' ? null : sessionNamed(io.stateDir, session);
    const shown = note === null ? null : factsFor(io, note);
    if (shown === null || shown.updatedAt === null) {
        return { code: 0, out: '', err: '' };
    }
    return { code: 0, out: `ledger ${shown.open.length} open · ${minuteOf(shown.updatedAt)}\n`, err: '' };
}
