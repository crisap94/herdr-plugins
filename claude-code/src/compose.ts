import { basename, dirname, join } from 'node:path';
import { createEngine } from '../../tab-recap/src/recap/application/engine.ts';
import type { Engine, FollowedSession, ScopeId } from '../../tab-recap/src/recap/application/engine.ts';
import { openStore } from '../../tab-recap/src/adapters/db/database.ts';
import type { Store } from '../../tab-recap/src/adapters/db/database.ts';
import { ClaudeTranscripts } from '../../tab-recap/src/adapters/transcripts/claude/transcripts.ts';
import { GitLaneRepo } from '../../tab-recap/src/adapters/git/lane-repo.ts';
import { LIBRARY_IDS, LibraryHarness } from '../../tab-recap/src/adapters/harness/library.ts';
import type { HarnessRuntime } from '../../tab-recap/src/adapters/harness/library.ts';
import { noticing } from '../../tab-recap/src/adapters/harness/confinement-notice.ts';
import { RecapWriter } from '../../tab-recap/src/adapters/job/writer.ts';
import { capabilityWording } from '../../tab-recap/src/ports/capability-reasons.ts';
import { TranscriptRegistry } from '../../tab-recap/src/ports/transcript-registry.ts';
import type { Clock } from '../../tab-recap/src/ports/clock.ts';
import type { LaneRepo } from '../../tab-recap/src/ports/lane-repo.ts';
import type { Summarizer } from '../../tab-recap/src/ports/summarizer.ts';
import { recapLanguageOf } from '../../tab-recap/src/i18n/index.ts';
import type { Locale } from '../../tab-recap/src/i18n/index.ts';
import { effortOf } from '../../tab-recap/src/recap/domain/effort.ts';
import { tabId } from '../../tab-recap/src/recap/domain/ids.ts';
import { laneFrom } from '../../tab-recap/src/recap/domain/lane.ts';
import { instant } from '../../tab-recap/src/recap/domain/time.ts';
import type { Instant } from '../../tab-recap/src/recap/domain/time.ts';
import { FULL_WRITER_VIEW } from '../../tab-recap/src/recap/domain/writer-view.ts';
import type { HookSession } from './payload.ts';

export type Environment = Readonly<Record<string, string | undefined>>;

export const SETTINGS = {
    stateDir: 'SESSION_LEDGER_STATE_DIR',
    language: 'SESSION_LEDGER_RECAP_LANG',
    locale: 'SESSION_LEDGER_LOCALE',
    effort: 'SESSION_LEDGER_EFFORT',
    model: 'SESSION_LEDGER_MODEL',
    timeoutMs: 'SESSION_LEDGER_TIMEOUT_MS',
    claudePolicyAck: 'SESSION_LEDGER_CLAUDE_POLICY_ACK',
} as const;

export const WRITER_MARKER = 'SESSION_LEDGER_WRITER';
export const WRITER_MARKER_VALUE = '1';
export const LEDGER_FILE = 'ledger.db';
export const SCOPE_PREFIX = 'claude-code:';
export const HOST_WORKSPACE = 'claude-code';
export const DEFAULT_TIMEOUT_MS = 180_000;

const POSIX_LOCALE_KEYS = ['LC_ALL', 'LC_MESSAGES', 'LANG'] as const;

const given = (env: Environment, key: string): string | undefined => {
    const found = env[key];
    return found === undefined || found.trim() === '' ? undefined : found;
};

export function stateDirOf(env: Environment, home: string): string {
    return given(env, SETTINGS.stateDir) ?? join(given(env, 'XDG_STATE_HOME') ?? join(home, '.local', 'state'), 'session-ledger', 'claude-code');
}

export const ledgerPathOf = (stateDir: string): string => join(stateDir, LEDGER_FILE);

function localeOf(env: Environment): Locale {
    const setting = given(env, SETTINGS.locale);
    if (setting === 'en' || setting === 'es') {
        return setting;
    }
    const posix = POSIX_LOCALE_KEYS.map((key) => given(env, key)).find((found) => found !== undefined) ?? '';
    return posix.toLowerCase().startsWith('es') ? 'es' : 'en';
}

export function languageOf(env: Environment): string {
    return recapLanguageOf(given(env, SETTINGS.language), localeOf(env));
}

export interface Followed {
    readonly scope: ScopeId;
    readonly session: FollowedSession;
}

export function followedOf(hook: HookSession): Followed {
    const scope = tabId(`${SCOPE_PREFIX}${hook.session}`);
    const session = laneFrom({ paneId: hook.session, tabId: String(scope), workspaceId: HOST_WORKSPACE, agent: LIBRARY_IDS.claude, session: hook.session, cwd: hook.cwd });
    return { scope, session };
}

export function transcriptsFor(records: string): TranscriptRegistry {
    const reader = new ClaudeTranscripts(dirname(dirname(records)));
    return new TranscriptRegistry({ [reader.agent]: reader }, null, (kind): string => capabilityWording('history-unavailable', kind));
}

export const recordsMatchSession = (hook: HookSession): boolean => basename(hook.records) === `${hook.session}.jsonl`;

type EnvPolicy = NonNullable<Parameters<HarnessRuntime['headless']>[1]['env']>;

function markedEnv(env: EnvPolicy | undefined): EnvPolicy {
    if (env?.kind === 'closed') {
        return { ...env, set: { ...env.set, [WRITER_MARKER]: WRITER_MARKER_VALUE } };
    }
    const transform = env?.transform;
    return { kind: 'inherit', transform: (source) => ({ ...(transform === undefined ? source : transform(source)), [WRITER_MARKER]: WRITER_MARKER_VALUE }) };
}

export function markedRuntime(runtime: HarnessRuntime): HarnessRuntime {
    return {
        promptLimit: (id) => runtime.promptLimit(id),
        capabilities: (id) => runtime.capabilities(id),
        policyNotice: (id, mode) => runtime.policyNotice(id, mode),
        headless: (id, options) => runtime.headless(id, { ...options, env: markedEnv(options.env) }),
    };
}

function timeoutOf(env: Environment): number {
    const parsed = Number(given(env, SETTINGS.timeoutMs));
    return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TIMEOUT_MS;
}

export function claudeWriter(runtime: HarnessRuntime, env: Environment, log: (line: string) => void): Summarizer {
    const acknowledged = given(env, SETTINGS.claudePolicyAck)?.trim().toLowerCase() === 'on';
    const harness = noticing(new LibraryHarness(markedRuntime(runtime), LIBRARY_IDS.claude, timeoutOf(env), undefined, acknowledged), log);
    return new RecapWriter(harness, { model: given(env, SETTINGS.model) ?? '', effort: effortOf(given(env, SETTINGS.effort)) });
}

export const systemClock: Clock = { now: (): Instant => instant(Date.now()) };

export const gitRepos = (clock: Clock): LaneRepo => new GitLaneRepo(clock);

export interface HostPlugs {
    readonly stateDir: string;
    readonly records: string;
    readonly summarizer: () => Summarizer;
    readonly language: () => string;
    readonly clock: Clock;
    readonly repos: LaneRepo;
    readonly log: (line: string) => void;
}

export type Composed =
    | { readonly kind: 'ready'; readonly engine: Engine; readonly store: Store; close(): void }
    | { readonly kind: 'newer-db'; readonly found: number; readonly known: number };

export function composeEngine(plugs: HostPlugs): Composed {
    const opened = openStore(ledgerPathOf(plugs.stateDir), { now: () => plugs.clock.now(), log: plugs.log });
    if (opened.kind === 'newer-db') {
        opened.db.close();
        return { kind: 'newer-db', found: opened.found, known: opened.known };
    }
    const engine = createEngine({
        source: { transcripts: transcriptsFor(plugs.records) },
        store: { records: opened.records, ledger: opened.ledger },
        models: { summarizer: plugs.summarizer },
        environment: { clock: plugs.clock, repos: plugs.repos, log: plugs.log },
        settings: { language: plugs.language, writerView: () => FULL_WRITER_VIEW },
    });
    return { kind: 'ready', engine, store: opened, close: (): void => { opened.close(); } };
}

export type Opening = { readonly kind: 'opened'; readonly opened: { readonly engine: Engine; close(): void } } | { readonly kind: 'refused'; readonly detail: string };

export function openingOf(plugs: HostPlugs): () => Opening {
    return (): Opening => {
        const composed = composeEngine(plugs);
        return composed.kind === 'ready'
            ? { kind: 'opened', opened: composed }
            : { kind: 'refused', detail: `the ledger at ${ledgerPathOf(plugs.stateDir)} is version ${composed.found}, newer than the ${composed.known} this host knows` };
    };
}
