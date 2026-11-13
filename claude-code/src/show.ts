import type { RestoreFacts } from '../../tab-recap/src/recap/application/engine.ts';
import type { Clock } from '../../tab-recap/src/ports/clock.ts';
import { SECTION_IDS } from '../../tab-recap/src/recap/domain/fact.ts';
import type { Section } from '../../tab-recap/src/recap/domain/fact.ts';
import { followedOf } from './compose.ts';
import { readingWith } from './read.ts';
import { newestSessionIn, sessionNamed } from './sessions.ts';
import type { SessionNote } from './sessions.ts';

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

const factsFor = (io: CommandIo, note: SessionNote): RestoreFacts | null => {
    const followed = followedOf(note);
    return readingWith<RestoreFacts | null>(io.stateDir, io.clock, io.log, (engine) => engine.restore(followed.scope, followed.session), null);
};

function ledgerText(note: SessionNote, facts: RestoreFacts): string {
    const head = [`session  ${note.session}`, `folder   ${note.cwd}`, `updated  ${facts.lastRun === null ? 'never' : minuteOf(facts.lastRun.at)}`];
    const open = facts.open.filter((fact) => fact.state === 'open').toSorted((a, b) => b.lastAt - a.lastAt);
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
    const facts = factsFor(io, note);
    return facts === null ? { code: 1, out: '', err: `session-ledger: the ledger in ${io.stateDir} cannot be read\n` } : { code: 0, out: ledgerText(note, facts), err: '' };
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
    const facts = note === null ? null : factsFor(io, note);
    if (facts?.lastRun === null || facts === null) {
        return { code: 0, out: '', err: '' };
    }
    const open = facts.open.filter((fact) => fact.state === 'open').length;
    return { code: 0, out: `ledger ${open} open · ${minuteOf(facts.lastRun.at)}\n`, err: '' };
}
