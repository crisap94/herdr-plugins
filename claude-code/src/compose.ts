import { basename, dirname, join } from 'node:path';
import { claudeReader, openLedgerStore } from 'agent-sdk-session-ledger';
import {
    brand,
    createEngine,
    FULL_WRITER_VIEW,
    must,
    parseDirectory,
    parseHarnessKind,
    parseScopeId,
    parseSessionId,
    parseSessionKey,
    parseText,
    type Clock,
    type Engine,
    type Fact,
    type FactStore,
    isUnknown,
    type SessionKey,
    type FollowedSession,
    type Ids,
    type MintedId,
    type Records,
    type RestoreFacts,
    type RestoreText,
    type ScopeId,
    type Text,
    type Workplaces,
    type Writer,
    type ByteCount,
} from '@stateforge-labs/session-ledger';
import { given, SETTINGS } from './plugs.ts';
import type { Environment } from './plugs.ts';
import type { HookSession } from './payload.ts';

export const LEDGER_FILE = 'ledger.db';
export const SCOPE_PREFIX = 'claude-code:';

export function stateDirOf(env: Environment, home: string): string {
    return given(env, SETTINGS.stateDir) ?? join(given(env, 'XDG_STATE_HOME') ?? join(home, '.local', 'state'), 'session-ledger', 'claude-code');
}

export const ledgerPathOf = (stateDir: string): string => join(stateDir, LEDGER_FILE);

export interface Followed {
    readonly scope: ScopeId;
    readonly session: FollowedSession;
}

export function followedOf(hook: HookSession): Followed {
    const cwd = parseDirectory(hook.cwd);
    return {
        scope: must(parseScopeId(`${SCOPE_PREFIX}${hook.session}`)),
        session: {
            key: must(parseSessionKey(hook.session)),
            harness: must(parseHarnessKind('claude')),
            session: must(parseSessionId(hook.session)),
            cwd: cwd.kind === 'ok' ? cwd.value : null,
            title: null,
        },
    };
}

export const recordsMatchSession = (hook: HookSession): boolean => basename(hook.records) === `${hook.session}.jsonl`;

export const randomIds: Ids = { next: (): MintedId => brand<string, 'MintedId'>(globalThis.crypto.randomUUID()) };

export interface RestoreRendering {
    readonly text: (facts: RestoreFacts) => RestoreText;
    readonly bytes: () => ByteCount;
}

export interface HostPlugs {
    readonly stateDir: string;
    readonly records: string;
    readonly writer: () => Writer;
    readonly language: () => Text;
    readonly clock: Clock;
    readonly workplaces: Workplaces;
    readonly ids: Ids;
    readonly log: (line: string) => void;
    readonly restore?: RestoreRendering;
}

export type Role = 'writing' | 'reading';

export interface Composed {
    readonly kind: 'ready';
    readonly engine: Engine;
    readonly records: Records;
    openFacts(scope: ScopeId, key: SessionKey): readonly Fact[];
    close(): void;
}

export interface Refused {
    readonly kind: 'refused';
    readonly detail: string;
}

const sealed = (records: Records): Records => ({
    readRecap: (scope) => records.readRecap(scope),
    lastRunOf: (scope) => records.lastRunOf(scope),
    beginRun: () => undefined,
    recordRun: () => undefined,
    failRun: () => undefined,
    advance: () => undefined,
});

const openFactsOf = (records: Records, facts: FactStore) => (scope: ScopeId, key: SessionKey): readonly Fact[] => {
    const recap = records.readRecap(scope);
    if (recap === null || isUnknown(recap)) {
        return [];
    }
    return recap.tasks
        .filter((task) => task.sessions.includes(key))
        .flatMap((task) => {
            const open = facts.openOf({ scope, key: task.id });
            return isUnknown(open) ? [] : open;
        });
};

export function composeEngine(plugs: HostPlugs, role: Role = 'writing'): Composed | Refused {
    const path = ledgerPathOf(plugs.stateDir);
    const opened = openLedgerStore(path);
    if (opened.kind !== 'ready') {
        opened.close();
        return { kind: 'refused', detail: `the ledger at ${path} is ${opened.kind === 'newer-store' ? 'newer' : 'older'} (version ${opened.found}, this host knows ${opened.known})` };
    }
    const reader = claudeReader({ root: dirname(dirname(plugs.records)) });
    const reading = role === 'reading';
    const records = reading ? sealed(opened.records) : opened.records;
    const engine = createEngine({
        source: {
            sessions: {
                readerFor: (kind) => (reading || kind !== reader.harness ? undefined : reader),
                unavailableReason: () => must(parseText(reading ? 'the ledger is open for reading only' : 'only Claude transcripts can be read here')),
            },
        },
        store: { records, facts: opened.facts },
        models: { writer: plugs.writer },
        environment: { clock: plugs.clock, ids: plugs.ids, workplaces: plugs.workplaces, log: (line) => { plugs.log(line); } },
        settings: {
            language: plugs.language,
            writerView: () => FULL_WRITER_VIEW,
            ...(plugs.restore === undefined ? {} : { restoreText: plugs.restore.text, restoreBytes: plugs.restore.bytes }),
        },
    });
    return { kind: 'ready', engine, records, openFacts: openFactsOf(records, opened.facts), close: (): void => { opened.close(); } };
}

export type Opening = { readonly kind: 'opened'; readonly opened: Composed } | Refused;

export function openingOf(plugs: HostPlugs, role: Role = 'writing'): () => Opening {
    return (): Opening => {
        const composed = composeEngine(plugs, role);
        return composed.kind === 'ready' ? { kind: 'opened', opened: composed } : composed;
    };
}
