import { textOf, type Text } from '#src/recap/domain/text.ts';
import { environmentName, type EnvironmentName } from '#src/recap/domain/backend.ts';
import { fsPathOf } from '#src/recap/domain/fs-path.ts';
import { join } from 'node:path';
import { setValues } from '#src/adapters/os/config/file.ts';
import { notReadyLine, openCliStore } from '#src/daemon/cli-store.ts';
import { configDirectory, environmentReader, localeFrom, loadSettings, messagesOf, settingGetter, parseSettingsFile } from '#src/daemon/config.ts';
import { apply, rawSettingsFrom, settingIds, settingsOf } from './desktop-settings-model.ts';
import { requestRewrites } from '#src/recap/application/setup-changes.ts';
import { changes, draftFrom, initial, locksOf } from '#src/recap/application/setup-keys.ts';
import type { Draft, Locks } from '#src/recap/application/setup-keys.ts';
import { USAGE_EXIT } from '#src/recap/domain/handoff-outcome.ts';

const OK = 0;
const FAILED = 1;
const SET = 'set';
const LANGUAGE_KEYS = [environmentName(textOf('TAB_RECAP_RECAP_LANG')), environmentName(textOf('TAB_RECAP_LOCALE'))];

interface Loaded {
    readonly draft: Draft;
    readonly locks: Locks;
}

function load(): Loaded {
    const config = loadSettings();
    return { draft: draftFrom(config, rawSettingsFrom(settingGetter())), locks: locksOf(environmentReader) };
}

function report(loaded: Loaded, extra: Readonly<Record<string, unknown>>): void {
    const effective = localeFrom(textOf(loaded.draft.locale), environmentReader);
    console.log(JSON.stringify({ locale: { setting: loaded.draft.locale, effective }, settings: settingsOf(loaded.draft, loaded.locks), ...extra }));
}

function assignmentsOf(words: readonly string[]): ReadonlyMap<string, string> | null {
    const pairs = words.map((word): readonly [string, string] | null => {
        const at = word.indexOf('=');
        return at <= 0 ? null : [word.slice(0, at), word.slice(at + 1)];
    });
    return pairs.length === 0 || pairs.some((pair) => pair === null) ? null : new Map(pairs.flatMap((pair) => (pair === null ? [] : [pair])));
}

function persist(values: ReadonlyMap<EnvironmentName, Text>): Readonly<Record<string, unknown>> {
    setValues(fsPathOf(join(configDirectory(), 'config.env')), values, parseSettingsFile);
    if (!LANGUAGE_KEYS.some((key) => values.has(key))) {
        return {};
    }
    const store = openCliStore();
    if (store.kind !== 'ready') {
        return { rewrites: notReadyLine(store, messagesOf()) };
    }
    requestRewrites(null, store);
    return {};
}

export function settingsCommand(words: readonly string[]): number {
    const loaded = load();
    if (words.length === 0) {
        report(loaded, {});
        return OK;
    }
    const assignments = words[0] === SET ? assignmentsOf(words.slice(1)) : null;
    if (assignments === null) {
        console.error(`tab-recap: 2 — settings [set ${settingIds.map((id) => `${id}=…`).slice(0, 2).join(' ')} …]`);
        return USAGE_EXIT;
    }
    const applied = apply(loaded.draft, loaded.locks, assignments);
    const values = changes({ ...initial(loaded.draft, loaded.locks), draft: applied.draft });
    const pending = values.size > 0 ? persist(values) : {};
    report(load(), { saved: [...values.keys()], rejected: applied.rejected, ...pending });
    return applied.rejected.length === 0 ? OK : FAILED;
}
