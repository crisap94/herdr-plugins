// The column: a long-running pane process that renders its tab's recaps. Composition
// root for the pane; reads the store the daemon writes, never writes anything but a
// refresh request.
import { FsRecapStore } from '#src/adapters/fs-recap-store.ts';
import { glowRenderer } from '#src/adapters/glow.ts';
import { codeVersion, shouldRoll } from '#src/adapters/plugin-version.ts';
import { BAR_TITLE, COLUMN_TITLE, HerdrFleet } from '#src/adapters/herdr-fleet.ts';
import { tabId } from '#src/recap/domain/ids.ts';
import { footer, present, presentBar } from '#src/recap/render/present.ts';
import type { ColumnView, Markdown, Mode } from '#src/recap/render/present.ts';
import { messagesFor } from '#src/i18n/index.ts';
import type { Locale } from '#src/i18n/index.ts';
import { loadExtensions, notesOf, warningsOf } from '#src/extensions/load.ts';
import { configGetter, loadConfig, stateDir } from '#src/daemon/config.ts';

const ESC = String.fromCodePoint(0x1b);
const BEL = String.fromCodePoint(0x07);
const TICK_MS = 1000;
/** how often the locale and the code's version are looked at (the variable is for tests: nobody needs it faster) */
const LOCALE_MS = Number(process.env['TAB_RECAP_COLUMN_POLL_MS'] ?? '') || 3000;
/** one cell of padding on each side: writing the last column of a row makes ESC[K eat it */
const GUTTER = 2;

const tab = process.env['TAB_RECAP_TAB'] ?? '';
/**
 * 'modal' when opened as a herdr popup: q / Esc close it. 'bar' when docked along the bottom of a
 * narrow tab (a phone). A column never closes itself; a tap on a column or a bar opens the modal.
 */
function modeOf(env: NodeJS.ProcessEnv): Mode {
    if (env['TAB_RECAP_MODE'] === 'modal') {
        return 'modal';
    }
    return env['TAB_RECAP_SHAPE'] === 'bar' ? 'bar' : 'column';
}
const mode = modeOf(process.env);
const title = mode === 'bar' ? BAR_TITLE : COLUMN_TITLE;
const store = new FsRecapStore(stateDir());
const config = loadConfig();
/** the locale is re-read, not frozen at start: a change in config.env shows within a few seconds */
const startedVersion = codeVersion();
let settled = { at: 0, locale: config.locale, version: startedVersion };
/** the version seen on the previous look, and whether replacing this process in place has already failed once */
let candidate: string | null = null;
let rollFailed = false;
/** Notes and warnings only: upkeep belongs to the daemon, the column never runs it. */
const extensions = loadExtensions(configGetter());
const glow = glowRenderer(config.glow);

let scroll = 0;
let lastFrame = '';
let cache: { key: string; lines: readonly string[] | null } = { key: '', lines: null };

const markdown: Markdown = (text, width) => {
    const key = `${width}\u0000${text}`;
    if (cache.key !== key) {
        cache = { key, lines: glow(text, width) };
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

/**
 * An upgrade replaces this process in place: the same pid, the same terminal, so herdr sees no pane close and the
 * daemon spends no reopen budget. (Closing and reopening 27 columns for a new version is what this avoids.) The
 * terminal is put back first; the new process sets it up again. A modal is short-lived and is left alone.
 */
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
    const stored = store.readTab(tab);
    return { tab: stored, recap: store.readRecap(tab), notes: notesOf(extensions, stored?.lanes, locale), warnings: warningsOf(extensions, locale), now: Date.now(), messages: messagesFor(locale), version: settled.version };
}

/**
 * Ask the terminal every time: herdr resizes the column right after opening it, and the
 * SIGWINCH that would refresh `process.stdout.columns` does not always arrive.
 */
function size(): [number, number] {
    try {
        const [columns, rows] = process.stdout.getWindowSize();
        return [columns, rows];
    } catch {
        return [process.stdout.columns || 40, process.stdout.rows || 24];
    }
}

function frameOf(lines: readonly string[]): string {
    return lines.map((line) => ` ${line}${ESC}[0m${ESC}[K`).join('\r\n');
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
    const lines = present(view(), width, markdown);
    const room = rows - 1;
    scroll = Math.max(0, Math.min(scroll, lines.length - room));
    const shown = lines.slice(scroll, scroll + room);
    while (shown.length < room) {
        shown.push('');
    }
    shown.push(footer(width, mode, messagesFor(localeNow())));
    paint(frameOf(shown), force);
}

let opening = false;

/** A tap (or Enter) on a column or a bar opens the tab's recap as a modal over everything. */
function openModal(): void {
    if (mode === 'modal' || opening) {
        return;
    }
    opening = true;
    void new HerdrFleet(stateDir()).show(tabId(tab)).finally(() => { opening = false; });
}

/** SGR mouse report: ESC [ < button ; x ; y M — M is a press. Button 0 is a tap / left click. */
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
    r: () => { store.request(tab); },
    h: () => { store.requestVisibility({ target: tab, hidden: true }); },
    '\r': openModal,
};

/** Mouse reporting on (press/release, SGR encoding): herdr passes taps to pane programs that ask. */
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
