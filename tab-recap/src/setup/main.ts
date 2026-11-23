import { catalogFor } from '#src/i18n/index.ts';
import { countOf, type Count } from '#src/recap/domain/count.ts';
import { must } from '#src/protocol/result.ts';
import { parseText, textOf } from '#src/recap/domain/text.ts';
import { fsPathOf } from '#src/recap/domain/fs-path.ts';
import { parseInstant } from '#src/recap/domain/time.ts';
import { parseAgentKind, parsePaneId, uncheckedAgentKind, parseTabId } from '#src/recap/domain/ids.ts';
import { parseDirectory } from '#src/recap/domain/directory.ts';
import { setValues } from '#src/adapters/os/config/file.ts';
import { notReadyLine, openCliStore } from '#src/daemon/cli-store.ts';
import { HerdrFleetPorts } from '#src/adapters/herdr/fleet.ts';
import { AUTO_PATH_KINDS, PathHarnessDirectory } from '#src/adapters/harness/on-path.ts';
import { styleFor } from '#src/adapters/os/terminal-style.ts';
import { BEL, FRAME_END, FRAME_HOME, LINE_END, RESET_SGR, SCREEN_OFF, SCREEN_ON, TITLE_OSC } from '#src/adapters/os/tui.ts';
import type { RecapRequest } from '#src/ports/summarizer.ts';
import { availableIn, intersect, summarizerFor } from '#src/daemon/backends.ts';
import { configDirectory, environmentReader, localeFrom, loadSettings, settingGetter, parseSettingsFile, stateDirectory } from '#src/daemon/config.ts';
import { requestRewrites } from '#src/recap/application/setup-changes.ts';
import { messagesFor } from '#src/i18n/index.ts';
import { draftFrom, initial, locksOf, saved, step, tested, withAvailable } from '#src/recap/application/setup-keys.ts';
import type { Effect, SaveEffect, Setup, TestEffect } from '#src/recap/application/setup-keys.ts';
import { coloured } from '#src/recap/render/wrap.ts';
import { harnessLabels } from '#src/recap/domain/backend.ts';
import { setupFooterLine, setupLines } from '#src/recap/render/setup.ts';
import { isUnknown, saying } from '#src/ports/unknowable.ts';
import { join } from 'node:path';
import { createRuntime } from '@stateforge-labs/harness-adapters/runtime';
import { stripVTControlCharacters } from 'node:util';

const style = styleFor(process.stdout);
const RESET = style === coloured ? RESET_SGR : '';
const GUTTER = 2;
const TITLE = 'tab-recap:setup';
const TINY: RecapRequest = {
    language: must(parseText('en')), previousLanguage: must(parseText('en')),
    input: {
        tab: { id: must(parseText('test')), now: must(parseInstant(Date.now())), zone: must(parseText('UTC')) },
        agents: [{ id: must(parseText('a1')), kind: must(parseAgentKind('test')), label: must(parseText('')), pane: must(parsePaneId('test')), source: 'transcript', cwd: null, repo: null, branch: null, files: [] }],
        tasks: [], ledgers: [{ task: null, facts: [] }], notes: [],
        transcripts: [{ agent: must(parseText('a1')), entries: [{ role: 'user', text: textOf('say hello') }] }],
    },
};

const tab = process.env['TAB_RECAP_TAB'] ?? '';
const fleet = new HerdrFleetPorts(textOf(stateDirectory()));
const get = settingGetter();
const config = loadSettings();

let state: Setup = initial(
    draftFrom(config, { locale: get('TAB_RECAP_LOCALE'), recapLanguage: get('TAB_RECAP_RECAP_LANG'), screenAgents: get('TAB_RECAP_SCREEN_AGENTS'), gitNote: get('TAB_RECAP_GIT_NOTE'), telemetryTags: get('TAB_RECAP_TELEMETRY_TAGS'), effort: get('TAB_RECAP_EFFORT'), compactTarget: get('TAB_RECAP_COMPACT_TARGET'), compactHint: get('TAB_RECAP_COMPACT_HINT'), contextWindow: get('TAB_RECAP_CONTEXT_WINDOW'), compactBy: get('TAB_RECAP_COMPACT_BY'), compactModel: get('TAB_RECAP_COMPACT_MODEL'), compactEffort: get('TAB_RECAP_COMPACT_EFFORT'), judgeBy: get('TAB_RECAP_JUDGE_BY'), judgeModel: get('TAB_RECAP_JUDGE_MODEL'), judgeEffort: get('TAB_RECAP_JUDGE_EFFORT'), curateBy: get('TAB_RECAP_CURATE_BY'), curateModel: get('TAB_RECAP_CURATE_MODEL'), curateEffort: get('TAB_RECAP_CURATE_EFFORT'), autocompact: get('TAB_RECAP_AUTOCOMPACT'), autocompactAt: get('TAB_RECAP_AUTOCOMPACT_AT'), autocompactStyle: get('TAB_RECAP_AUTOCOMPACT_STYLE'), autocompactMissed: get('TAB_RECAP_AUTOCOMPACT_MISSED_FACTS'), decideBy: get('TAB_RECAP_AUTOCOMPACT_BY'), decideModel: get('TAB_RECAP_AUTOCOMPACT_MODEL'), decideEffort: get('TAB_RECAP_AUTOCOMPACT_EFFORT'), herdrEvents: get('TAB_RECAP_HERDR_EVENTS'), compactNote: get('TAB_RECAP_COMPACT_NOTE') }),
    locksOf(environmentReader),
);
let scroll = 0;

const messages = (): ReturnType<typeof messagesFor> => messagesFor(localeFrom(textOf(state.draft.locale), environmentReader));

function size(): readonly [Count, Count] {
    try {
        const [columns, rows] = process.stdout.getWindowSize();
        return [countOf(columns), countOf(rows)];
    } catch {
        return [countOf(process.stdout.columns || 40), countOf(process.stdout.rows || 24)];
    }
}

function draw(): void {
    const [columns, rows] = size();
    const width = Math.max(10, columns - GUTTER);
    const m = messages();
    const lines = setupLines(state, catalogFor(m.locale), countOf(width), style);
    const room = Math.max(3, rows) - 1;
    const focus = Math.max(0, lines.findIndex((line) => stripVTControlCharacters(line).startsWith('▸')));
    scroll = Math.max(0, Math.min(focus - Math.floor(room / 3), lines.length - room));
    const shown: string[] = lines.slice(scroll, scroll + room);
    while (shown.length < room) {
        shown.push('');
    }
    shown.push(setupFooterLine(state, catalogFor(m.locale), countOf(width), style));
    process.stdout.write(`${FRAME_HOME}${shown.map((line) => ` ${line}${RESET}${LINE_END}`).join('\r\n')}${FRAME_END}`);
}

async function available(): Promise<void> {
    const found = intersect(await fleet.available(), await new PathHarnessDirectory(AUTO_PATH_KINDS).available());
    state = withAvailable(state, isUnknown(found) ? [] : found.ids);
    draw();
}

async function runTest(effect: TestEffect): Promise<void> {
    const { draft, available: ids } = effect;
    const summarizer = summarizerFor({ ...loadSettings(), backend: draft.backend, models: harnessLabels((id) => textOf(draft.models[id])), effort: draft.effort }, availableIn(ids.map(uncheckedAgentKind)), must(parseDirectory(join(stateDirectory(), 'summarizer'))), createRuntime());
    const began = Date.now();
    try {
        const written = await summarizer.write(TINY);
        state = tested(state, written.kind === 'written'
            ? { kind: 'ok', seconds: countOf((Date.now() - began) / 1000), costUsd: written.costUsd }
            : { kind: 'failed', why: textOf(saying(written.why)) });
    } catch (error) {
        state = tested(state, { kind: 'failed', why: textOf(error instanceof Error ? error.message : String(error)) });
    }
    draw();
}

function save(effect: SaveEffect): void {
    const { values, language } = effect;
    try {
        setValues(fsPathOf(join(configDirectory(), 'config.env')), values, parseSettingsFile);
        if (language === 'changed') {
            const store = openCliStore();
            if (store.kind !== 'ready') {
                throw new Error(notReadyLine(store, messages()));
            }
            requestRewrites(tab === '' ? null : must(parseTabId(tab)), store);
        }
        state = saved(state, null, language);
    } catch (error) {
        state = saved(state, textOf(error instanceof Error ? error.message : String(error)), 'kept');
    }
}

function perform(effect: Effect): void {
    if (effect.kind === 'close') {
        process.exit(0);
    }
    if (effect.kind === 'save') {
        save(effect);
    } else {
        void runTest(effect);
    }
}

function restore(): void {
    process.stdout.write(SCREEN_OFF);
}

process.stdout.write(`${SCREEN_ON}${TITLE_OSC}${TITLE}${BEL}`);
process.on('exit', restore);
process.on('SIGTERM', () => { process.exit(0); });
process.on('SIGINT', () => { process.exit(0); });
process.on('uncaughtException', (error) => { process.stderr.write(`${String(error)}\n`); process.exit(1); });
process.stdout.on('resize', draw);
if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (key) => {
        const stepped = step(state, textOf(String(key)));
        state = stepped.state;
        stepped.effects.forEach(perform);
        draw();
    });
}
draw();
void available();
