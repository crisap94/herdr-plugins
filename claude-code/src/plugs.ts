import {
    brand,
    countOf,
    parseMilliseconds,
    instant,
    must,
    NO_SECTIONS,
    parseRestoreText,
    parseText,
    textOf,
    type ByteCount,
    type Clock,
    type Fact,
    type RestoreFacts,
    type RestoreText,
    type Text,
    type Workplaces,
    type Writer,
} from '@stateforge-labs/session-ledger';
import { noticing } from '../../tab-recap/src/adapters/harness/confinement-notice.ts';
import { LIBRARY_IDS, lazyRuntime, LibraryHarnessPort } from '../../tab-recap/src/adapters/harness/library.ts';
import type { HarnessRuntime } from '../../tab-recap/src/adapters/harness/library.ts';
import { GitLaneRepo } from '../../tab-recap/src/adapters/git/lane-repo.ts';
import { RecapWriter } from '../../tab-recap/src/adapters/job/writer.ts';
import { clean } from '../../tab-recap/src/recap/application/compaction-brief.ts';
import { guidanceOf } from '../../tab-recap/src/recap/application/compaction-message.ts';
import { sectionsOfOpen } from '../../tab-recap/src/recap/domain/ledger-view.ts';
import { restoreContentOf } from '../../tab-recap/src/recap/application/restore-text.ts';
import { byteBudgetOf } from '../../tab-recap/src/recap/domain/byte-budget.ts';
import { effortOf } from '../../tab-recap/src/recap/domain/effort.ts';
import { recapLanguageOfSetting } from '../../tab-recap/src/i18n/index.ts';
import type { Locale } from '../../tab-recap/src/i18n/index.ts';
import { fitRestore } from '../../tab-recap/src/recap/render/restore-markdown.ts';

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
export const DEFAULT_TIMEOUT_MS = 180_000;
export const CONTEXT_BUDGET_BYTES = 9000;

const POSIX_LOCALE_KEYS = ['LC_ALL', 'LC_MESSAGES', 'LANG'] as const;

export const given = (env: Environment, key: string): string | undefined => {
    const found = env[key];
    return found === undefined || found.trim() === '' ? undefined : found;
};

function localeOf(env: Environment): Locale {
    const setting = given(env, SETTINGS.locale);
    if (setting === 'en' || setting === 'es') {
        return setting;
    }
    const posix = POSIX_LOCALE_KEYS.map((key) => given(env, key)).find((found) => found !== undefined) ?? '';
    return posix.toLowerCase().startsWith('es') ? 'es' : 'en';
}

export function languageOf(env: Environment): Text {
    const setting = given(env, SETTINGS.language);
    return must(parseText(recapLanguageOfSetting(setting === undefined ? undefined : must(parseText(setting)), localeOf(env))));
}

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

export function claudeWriter(runtime: HarnessRuntime, env: Environment, log: (line: string) => void): Writer {
    const acknowledged = given(env, SETTINGS.claudePolicyAck)?.trim().toLowerCase() === 'on';
    const harness = noticing(new LibraryHarnessPort(markedRuntime(runtime), LIBRARY_IDS.claude, must(parseMilliseconds(timeoutOf(env))), undefined, acknowledged ? 'acknowledged' : 'unacknowledged'), log);
    return new RecapWriter(harness, { model: must(parseText(given(env, SETTINGS.model) ?? '')), effort: effortOf(given(env, SETTINGS.effort)) });
}

export function onceWriter(env: Environment, log: (line: string) => void): () => Writer {
    let made: Writer | null = null;
    return (): Writer => {
        made ??= claudeWriter(lazyRuntime(), env, log);
        return made;
    };
}

export const systemClock: Clock = { now: () => instant(Date.now()) };

export const gitWorkplaces = (clock: Clock): Workplaces => new GitLaneRepo(clock);

export const restoreBytes = (): ByteCount => brand<number, 'ByteCount'>(CONTEXT_BUDGET_BYTES);

export function restoreText(facts: RestoreFacts): RestoreText {
    const content = restoreContentOf(facts);
    const fitted = content.kind === 'content' ? fitRestore(content, byteBudgetOf(countOf(CONTEXT_BUDGET_BYTES))) : null;
    return must(parseRestoreText(fitted?.kind === 'text' ? fitted.text : ''));
}

const EMPTY = textOf('');

export function briefOf(open: readonly Fact[], lastRun: object | null): string {
    if (lastRun === null) {
        return '';
    }
    const sections = clean(sectionsOfOpen(open), EMPTY);
    return JSON.stringify(sections) === JSON.stringify(NO_SECTIONS) ? '' : guidanceOf({ sections, web: null, note: null });
}
