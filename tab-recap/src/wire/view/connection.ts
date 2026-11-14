import { PROTOCOL, TIMING } from './protocol.ts';
import type { Bye, Role } from './protocol.ts';

export type ConnState = 'connecting' | 'connected' | 'daemon-down' | 'version-mismatch';
export type ConnEvent =
    | { readonly kind: 'connect-failed' }
    | { readonly kind: 'welcome'; readonly protocol: number; readonly version: string }
    | { readonly kind: 'bye'; readonly why: Bye['why']; readonly protocol: number; readonly version: string }
    | { readonly kind: 'lost' }
    ;
export type Effect =
    | { readonly kind: 'connect'; readonly afterMs: number }
    | { readonly kind: 'draw-status'; readonly state: Exclude<ConnState, 'connected'>; readonly keepFrame: boolean }
    | { readonly kind: 'reexec'; readonly toward: string }
    | { readonly kind: 'exit'; readonly code: 0 };
export interface Conn { readonly state: ConnState; readonly attempt: number; readonly failingSince: number | null; readonly hasFrame: boolean }
export interface Facts { readonly now: number; readonly role: Role; readonly ownVersion: string; readonly diskVersion: string | null; readonly rolledFor: string | null; readonly canExec: boolean }
export const initialConn: Conn = { state: 'connecting', attempt: 0, failingSince: null, hasFrame: false };

type Step = { readonly conn: Conn; readonly effects: readonly Effect[] };
type Heard = Extract<ConnEvent, { readonly kind: 'welcome' | 'bye' }>;

const SHUTDOWN_RETRY_MS = TIMING.backoffMs[0];
const LAST_BACKOFF_MS = TIMING.backoffMs[6];

const backoffOf = (conn: Conn): Effect => ({ kind: 'connect', afterMs: TIMING.backoffMs[conn.attempt] ?? LAST_BACKOFF_MS });

const reexecOf = (heard: Heard, facts: Facts): readonly Effect[] => {
    const differs = heard.version !== facts.ownVersion || heard.protocol !== PROTOCOL;
    const disk = facts.diskVersion;
    const allowed = differs && disk !== null && disk !== facts.ownVersion && facts.rolledFor !== disk && facts.canExec && facts.role !== 'modal';
    return allowed ? [{ kind: 'reexec', toward: disk }] : [];
};

const mismatch = (conn: Conn): Step => ({
    conn: { ...conn, state: 'version-mismatch', attempt: 0, failingSince: null, hasFrame: false },
    effects: [{ kind: 'draw-status', state: 'version-mismatch', keepFrame: false }, { kind: 'connect', afterMs: TIMING.mismatchRetryMs }],
});

const failed = (conn: Conn, facts: Facts): Step => {
    const since = conn.failingSince ?? facts.now;
    const next = { ...conn, attempt: conn.attempt + 1, failingSince: since };
    const down = facts.now - since >= TIMING.downAfterMs;
    if (down && conn.state !== 'daemon-down') {
        return { conn: { ...next, state: 'daemon-down', hasFrame: false }, effects: [{ kind: 'draw-status', state: 'daemon-down', keepFrame: false }, backoffOf(conn)] };
    }
    if (conn.state === 'version-mismatch') {
        return { conn: next, effects: [{ kind: 'connect', afterMs: TIMING.mismatchRetryMs }] };
    }
    return { conn: { ...next, state: down ? 'daemon-down' : 'connecting' }, effects: [backoffOf(conn)] };
};

const lost = (conn: Conn, facts: Facts): Step => {
    if (conn.state !== 'connected') {
        return failed(conn, facts);
    }
    return {
        conn: { ...conn, state: 'connecting', attempt: 1, failingSince: null },
        effects: [{ kind: 'draw-status', state: 'connecting', keepFrame: conn.hasFrame }, backoffOf(initialConn)],
    };
};

const welcomed = (conn: Conn, heard: Heard, facts: Facts): Step => {
    const reexec = reexecOf(heard, facts);
    if (reexec.length > 0) {
        return { conn, effects: reexec };
    }
    if (heard.protocol !== PROTOCOL) {
        return mismatch(conn);
    }
    return { conn: { ...conn, state: 'connected', attempt: 0, failingSince: null }, effects: [] };
};

const said = (conn: Conn, heard: Heard, facts: Facts): Step => {
    if (heard.kind === 'bye' && heard.why === 'closed') {
        return { conn, effects: [{ kind: 'exit', code: 0 }] };
    }
    if (heard.kind === 'bye' && heard.why === 'shutdown') {
        return {
            conn: { ...conn, state: 'connecting', attempt: 1, failingSince: null },
            effects: [{ kind: 'draw-status', state: 'connecting', keepFrame: conn.hasFrame }, { kind: 'connect', afterMs: SHUTDOWN_RETRY_MS }],
        };
    }
    const reexec = reexecOf(heard, facts);
    return reexec.length === 0 ? mismatch(conn) : { conn, effects: reexec };
};

export function step(conn: Conn, event: ConnEvent, facts: Facts): { readonly conn: Conn; readonly effects: readonly Effect[] } {
    if (event.kind === 'connect-failed') {
        return failed(conn, facts);
    }
    if (event.kind === 'lost') {
        return lost(conn, facts);
    }
    return event.kind === 'welcome' ? welcomed(conn, event, facts) : said(conn, event, facts);
}
