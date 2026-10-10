import { stateStore } from '#src/adapters/db/database.ts';
import { glowRenderer } from '#src/adapters/glow.ts';
import { styleFor } from '#src/adapters/terminal-style.ts';
import { codeVersion, shouldRoll } from '#src/adapters/plugin-version.ts';
import { BAR_TITLE, COLUMN_TITLE, HerdrFleet } from '#src/adapters/herdr-fleet.ts';
import { tabId } from '#src/recap/domain/ids.ts';
import { footer, present, presentBar } from '#src/recap/render/present.ts';
import type { ColumnView, Markdown, Mode } from '#src/recap/render/present.ts';
import { messagesFor } from '#src/i18n/index.ts';
import type { Locale } from '#src/i18n/index.ts';
import { loadExtensions, notesOf, warningsOf } from '#src/extensions/load.ts';
import { configGetter, loadConfig, stateDir } from '#src/daemon/config.ts';
import { coloured, plain } from '#src/recap/render/wrap.ts';
import { expandedScreen } from './expanded-modal.ts';
import { COMMAND_LAUNCHER } from './command.ts';
import { compactFromColumn } from './compact.ts';
import { spawn } from 'node:child_process';
import { stripVTControlCharacters } from 'node:util';

const ESC = String.fromCodePoint(0x1b);
const BEL = String.fromCodePoint(0x07);
const TICK_MS = 1000;
const LOCALE_MS = Number(process.env['TAB_RECAP_COLUMN_POLL_MS'] ?? '') || 3000;
const GUTTER = 2;

const tab = process.env['TAB_RECAP_TAB'] ?? '';
function modeOf(env: NodeJS.ProcessEnv): Mode {
    if (env['TAB_RECAP_MODE'] === 'modal') {
        return 'modal';
    }
    return env['TAB_RECAP_SHAPE'] === 'bar' ? 'bar' : 'column';
}
const mode = modeOf(process.env);
const title = mode === 'bar' ? BAR_TITLE : COLUMN_TITLE;
const opened = stateStore(stateDir());
const store = opened.kind === 'ready' ? opened : null;
const config = loadConfig();
const startedVersion = codeVersion();
let settled = { at: 0, locale: config.locale, version: startedVersion };
let candidate: string | null = null;
let rollFailed = false;
const extensions = loadExtensions(configGetter());
const glow = glowRenderer(config.glow);
const style = styleFor(process.stdout);
const RESET = style === coloured ? `${ESC}[0m` : '';

const expandedLines = mode === 'modal' ? expandedScreen(store) : null;

let scroll = 0;
let lastFrame = '';
let cache: { key: string; lines: readonly string[] | null } = { key: '', lines: null };

const markdown: Markdown = (text, width) => {
    const key = `${width}\u0000${text}`;
    if (cache.key !== key) {
        const drawn = glow(text, width);
        cache = { key, lines: style === plain && drawn !== null ? drawn.map(stripVTControlCharacters) : drawn };
    }
    return cache.lines;
};

function localeNow(): Locale {
    if (Date.now() - settled.at > LOCALE_MS) {
        settled = { at: Date.now(), locale: loadConfig().locale, version: codeVersion() };
        rollWhenUpgraded();
    }
    return settled.locale;
}

function rollWhenUpgraded(): void {
    const current = settled.version;
    if (mode !== 'modal' && !rollFailed && typeof process.execve === 'function' && shouldRoll(startedVersion, current, candidate)) {
        restore();
        try {
            process.execve(process.execPath, [process.execPath, ...process.execArgv, ...process.argv.slice(1)], process.env);
        } catch {
            rollFailed = true;
            enter();
            draw(true);
        }
    }
    candidate = current;
}

function view(): ColumnView {
    const locale = localeNow();
    const stored = store?.views.readTab(tab) ?? null;
    const newer = opened.kind === 'newer-db' ? [messagesFor(locale).database.newer(opened.backup)] : [];
    return { tab: stored, recap: store?.records.readRecap(tab) ?? null, notes: notesOf(extensions, stored?.lanes, locale), warnings: [...newer, ...warningsOf(extensions, locale)], now: Date.now(), messages: messagesFor(locale), version: settled.version, compactHint: loadConfig().compaction.hint, compactions: store?.compactions.shownFor(tab) ?? [], style };
}

function size(): [number, number] {
    try {
        const [columns, rows] = process.stdout.getWindowSize();
        return [columns, rows];
    } catch {
        return [process.stdout.columns || 40, process.stdout.rows || 24];
    }
}

function frameOf(lines: readonly string[]): string {
    return lines.map((line) => ` ${line}${RESET}${ESC}[K`).join('\r\n');
}

function paint(frame: string, force: boolean): void {
    if (force || frame !== lastFrame) {
        lastFrame = frame;
        process.stdout.write(`${ESC}]2;${title}${BEL}${ESC}[H${frame}${ESC}[J`);
    }
}

function draw(force = false): void {
    const [columns, rows0] = size();
    const width = Math.max(10, columns - GUTTER);
    if (mode === 'bar') {
        paint(frameOf(presentBar(view(), width)), force);
        return;
    }
    const rows = Math.max(3, rows0);
    const lines = expandedLines === null ? present(view(), width, markdown) : expandedLines(view(), width);
    const room = rows - 1;
    scroll = Math.max(0, Math.min(scroll, lines.length - room));
    const shown = lines.slice(scroll, scroll + room);
    while (shown.length < room) {
        shown.push('');
    }
    shown.push(footer(width, mode, messagesFor(localeNow()), style));
    paint(frameOf(shown), force);
}

let opening = false;

function openModal(): void {
    if (mode === 'modal' || opening) {
        return;
    }
    opening = true;
    void new HerdrFleet(stateDir()).show(tabId(tab)).finally(() => { opening = false; });
}

function askToCompact(): void {
    if (mode !== 'modal') {
        compactFromColumn(store, tab);
        return;
    }
    spawn(process.execPath, [COMMAND_LAUNCHER, 'compact'], { detached: true, stdio: 'ignore', env: { ...process.env, TAB_RECAP_TAB: tab, TAB_RECAP_COMPACT_DELAY_MS: '400' } }).unref();
    process.exit(0);
}

function openSettings(): void {
    const delay = mode === 'modal' ? '400' : '0';
    spawn(process.execPath, [COMMAND_LAUNCHER, 'configure'], { detached: true, stdio: 'ignore', env: { ...process.env, HERDR_PLUGIN_CONTEXT_JSON: '', HERDR_TAB_ID: tab, TAB_RECAP_OPEN_DELAY_MS: delay } }).unref();
    if (mode === 'modal') {
        process.exit(0);
    }
}

function isTap(input: string): boolean {
    const at = input.indexOf(`${ESC}[<`);
    if (at < 0 || !input.endsWith('M')) {
        return false;
    }
    return input.slice(at + 3).split(';')[0] === '0';
}

const KEYS: Readonly<Record<string, () => void>> = {
    j: () => { scroll += 1; },
    [`${ESC}[B`]: () => { scroll += 1; },
    k: () => { scroll -= 1; },
    [`${ESC}[A`]: () => { scroll -= 1; },
    ' ': () => { scroll += (process.stdout.rows || 24) - 2; },
    [`${ESC}[6~`]: () => { scroll += (process.stdout.rows || 24) - 2; },
    b: () => { scroll -= (process.stdout.rows || 24) - 2; },
    [`${ESC}[5~`]: () => { scroll -= (process.stdout.rows || 24) - 2; },
    g: () => { scroll = 0; },
    G: () => { scroll = Number.MAX_SAFE_INTEGER; },
    r: () => { store?.requests.request(tab); },
    c: askToCompact,
    s: openSettings,
    h: () => { store?.requests.requestVisibility({ target: tab, hidden: true }); },
    '\r': openModal,
};

const MOUSE_ON = `${ESC}[?1000h${ESC}[?1006h`;
const MOUSE_OFF = `${ESC}[?1000l${ESC}[?1006l`;

function restore(): void {
    process.stdout.write(`${MOUSE_OFF}${ESC}[?25h${ESC}[?1049l`);
}

function enter(): void {
    process.stdout.write(`${ESC}[?1049h${ESC}[?25l${mode === 'modal' ? '' : MOUSE_ON}${ESC}]2;${title}${BEL}`);
}

enter();
process.on('exit', restore);
process.on('SIGTERM', () => { process.exit(0); });
process.stdout.on('resize', () => { draw(true); });
if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (key: string) => {
        if (key === '\u0003' || (mode === 'modal' && (key === 'q' || key === ESC))) {
            process.exit(0);
        }
        if (isTap(key)) {
            openModal();
            return;
        }
        KEYS[key]?.();
        draw();
    });
}
draw(true);
setInterval(() => { draw(); }, TICK_MS);
