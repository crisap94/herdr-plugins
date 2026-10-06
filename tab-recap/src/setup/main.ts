// The settings modal: a popup pane process. Composition root — it asks herdr and the PATH what is
// available, runs the pure reducer on raw keys, and performs the effects it returns.
import { setValues } from '#src/adapters/config-file.ts';
import { stateStore } from '#src/adapters/db/database.ts';
import { HerdrFleet } from '#src/adapters/herdr-fleet.ts';
import { PathHarnesses } from '#src/adapters/path-harnesses.ts';
import { styleFor } from '#src/adapters/terminal-style.ts';
import { intersect, summarizerFor } from '#src/daemon/backends.ts';
import { configDir, configGetter, loadConfig, localeOf, parseEnv, stateDir } from '#src/daemon/config.ts';
import { messagesFor } from '#src/i18n/index.ts';
import { draftFrom, initial, locksOf, saved, step, tested, withAvailable } from '#src/recap/application/setup-keys.ts';
import type { Draft, Effect, Setup } from '#src/recap/application/setup-keys.ts';
import { coloured } from '#src/recap/render/wrap.ts';
import { AUTO_ORDER } from '#src/recap/domain/backend.ts';
import { setupFooter, setupView } from '#src/recap/render/setup.ts';
import { isUnknown, saying } from '#src/ports/unknowable.ts';
import { join } from 'node:path';

const style = styleFor(process.stdout);
const ESC = String.fromCodePoint(0x1b);
const RESET = style === coloured ? `${ESC}[0m` : '';
const BEL = String.fromCodePoint(0x07);
const STYLE = new RegExp(`${ESC}\\[[0-9;]*m`, 'g');
/** one cell of padding on each side, as in the column */
const GUTTER = 2;
const TITLE = 'tab-recap:setup';
const TINY = { previous: '', excerpt: '=== test ===\nuser: say hello', language: 'en', previousLanguage: 'en', lanes: ['test'] };

const tab = process.env['TAB_RECAP_TAB'] ?? '';
const fleet = new HerdrFleet(stateDir());
const get = configGetter();
const config = loadConfig();

let state: Setup = initial(
    draftFrom(config, { locale: get('TAB_RECAP_LOCALE'), recapLanguage: get('TAB_RECAP_RECAP_LANG'), screenAgents: get('TAB_RECAP_SCREEN_AGENTS'), gitNote: get('TAB_RECAP_GIT_NOTE') }),
    locksOf(process.env),
);
let scroll = 0;

const messages = (): ReturnType<typeof messagesFor> => messagesFor(localeOf(state.draft.locale, process.env));

function size(): [number, number] {
    try {
        const [columns, rows] = process.stdout.getWindowSize();
        return [columns, rows];
    } catch {
        return [process.stdout.columns || 40, process.stdout.rows || 24];
    }
}

function draw(): void {
    const [columns, rows] = size();
    const width = Math.max(10, columns - GUTTER);
    const m = messages();
    const lines = setupView(state, m, width, style);
    const room = Math.max(3, rows) - 1;
    const focus = Math.max(0, lines.findIndex((line) => line.replace(STYLE, '').startsWith('▸')));
    scroll = Math.max(0, Math.min(focus - Math.floor(room / 3), lines.length - room));
    const shown = lines.slice(scroll, scroll + room);
    while (shown.length < room) {
        shown.push('');
    }
    shown.push(setupFooter(state, m, width, style));
    process.stdout.write(`${ESC}[H${shown.map((line) => ` ${line}${RESET}${ESC}[K`).join('\r\n')}${ESC}[J`);
}

async function available(): Promise<void> {
    const found = intersect(await fleet.available(), await new PathHarnesses(AUTO_ORDER).available());
    state = withAvailable(state, isUnknown(found) ? [] : found.ids);
    draw();
}

async function runTest(draft: Draft, ids: readonly string[]): Promise<void> {
    const summarizer = summarizerFor({ ...loadConfig(), backend: draft.backend, models: draft.models }, ids, join(stateDir(), 'summarizer'));
    const began = Date.now();
    try {
        const written = await summarizer.write(TINY);
        state = tested(state, written.kind === 'written'
            ? { kind: 'ok', seconds: (Date.now() - began) / 1000, costUsd: written.costUsd }
            : { kind: 'failed', why: saying(written.why) });
    } catch (error) {
        state = tested(state, { kind: 'failed', why: error instanceof Error ? error.message : String(error) });
    }
    draw();
}

function save(values: ReadonlyMap<string, string>, languageChanged: boolean): void {
    try {
        setValues(join(configDir(), 'config.env'), values, parseEnv);
        const rewriting = languageChanged && tab !== '';
        if (rewriting) {
            const store = stateStore(stateDir());
            if (store.kind !== 'ready') {
                throw new Error(messages().database.newer(store.backup));
            }
            store.requests.request(tab);
        }
        state = saved(state, null, rewriting);
    } catch (error) {
        state = saved(state, error instanceof Error ? error.message : String(error), false);
    }
}

function perform(effect: Effect): void {
    if (effect.kind === 'close') {
        process.exit(0);
    }
    if (effect.kind === 'save') {
        save(effect.values, effect.languageChanged);
    } else {
        void runTest(effect.draft, effect.available);
    }
}

function restore(): void {
    process.stdout.write(`${ESC}[?25h${ESC}[?1049l`);
}

process.stdout.write(`${ESC}[?1049h${ESC}[?25l${ESC}]2;${TITLE}${BEL}`);
process.on('exit', restore);
process.on('SIGTERM', () => { process.exit(0); });
process.on('SIGINT', () => { process.exit(0); });
process.on('uncaughtException', (error) => { process.stderr.write(`${String(error)}\n`); process.exit(1); });
process.stdout.on('resize', draw);
if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (key: string) => {
        const stepped = step(state, key);
        state = stepped.state;
        stepped.effects.forEach(perform);
        draw();
    });
}
draw();
void available();
