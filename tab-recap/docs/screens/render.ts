// The README's screenshots, step one: the plugin's own views, drawn from invented data into HTML.
// `bun docs/screens/render.ts [outDir]` writes one page per screen; `shoot.mjs` turns them into PNGs.
// Gated like the code: it only calls the pure views (`present`, `presentBar`, `setupLines`).
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { en } from '#src/i18n/en.ts';
import { es } from '#src/i18n/es.ts';
import type { Messages } from '#src/i18n/messages.ts';
import { blankRecap } from '#src/ports/recap-records.ts';
import type { TabRecap } from '#src/ports/recap-records.ts';
import { cursorOf, sourcePathOf } from '#src/ports/transcripts.ts';
import type { LaneWebRecord, TabViewRecord } from '#src/ports/tab-views.ts';
import { draftFrom, initial, withAvailable } from '#src/recap/application/setup-keys.ts';
import type { Setup } from '#src/recap/application/setup-keys.ts';
import { renderRecap } from '#src/recap/application/recap-shape.ts';
import type { RecapSections } from '#src/recap/domain/shape.ts';
import { present, presentBar } from '#src/recap/render/present.ts';
import type { ColumnView } from '#src/recap/render/present.ts';
import { catalogFor } from '#src/i18n/index.ts';
import { setupLines } from '#src/recap/render/setup.ts';
import { expandedLines } from './expanded-fixture.ts';
import { agentKind, paneId, tabId } from '#src/recap/domain/ids.ts';
import { instant } from '#src/recap/domain/time.ts';
import { textOf, parseTextOrNull } from '#src/recap/domain/text.ts';
import { paneIdOf } from '@stateforge-labs/session-ledger/unstable/recap/domain/lane-shape.ts';
import { countOf } from '#src/recap/domain/count.ts';

export interface Page {
    /** file name without extension */
    readonly name: string;
    readonly width: number;
    readonly html: string;
}

const ESC = String.fromCodePoint(0x1b);
const SGR = new RegExp(`${ESC}\\[(\\d+)m`, 'g');
/** OSC 8 hyperlink: `ESC ] 8 ; ; URL ESC \\ text ESC ] 8 ; ; ESC \\` (the column's clickable references). */
const LINK = new RegExp(`${ESC}\\]8;;([^${ESC}]*)${ESC}\\\\([^${ESC}]*)${ESC}\\]8;;${ESC}\\\\`, 'g');
const LINK_MARK = { open: '\u0001', close: '\u0002' };
const NOW = 1_760_000_000_000;
const COLOURS: Readonly<Record<number, string>> = { 31: '#ff6b6b', 32: '#7ee787', 33: '#e3b341', 34: '#79c0ff', 35: '#d2a8ff', 36: '#56d4dd', 90: '#8b949e' };
const MEMO = '<svg class="memo" viewBox="0 0 16 16" aria-hidden="true"><rect x="3" y="1.5" width="10" height="13" rx="1.5" fill="#f0e6c8"/><path d="M5.5 5h5M5.5 8h5M5.5 11h3" stroke="#6b5d3a" stroke-width="1.2" stroke-linecap="round"/></svg>';

const escapeHtml = (text: string): string => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

interface Pen {
    bold: boolean;
    dim: boolean;
    italic: boolean;
    colour: string | null;
}

function classOf(pen: Pen): string {
    return [pen.bold ? 'b' : '', pen.dim ? 'd' : '', pen.italic ? 'i' : ''].filter((c) => c !== '').join(' ');
}

function apply(pen: Pen, code: number): void {
    const flags: Readonly<Record<number, readonly [keyof Pen, boolean]>> = { 1: ['bold', true], 2: ['dim', true], 3: ['italic', true], 23: ['italic', false] };
    if (code === 22) {
        pen.bold = false;
        pen.dim = false;
    } else if (code === 39) {
        pen.colour = null;
    } else if (COLOURS[code] !== undefined) {
        pen.colour = COLOURS[code];
    } else if (flags[code] !== undefined) {
        const [key, on] = flags[code];
        Object.assign(pen, { [key]: on });
    }
}

/** One styled line (ANSI SGR plus OSC 8 links, the only escapes the views use) as HTML spans; links are underlined. */
export function lineToHtml(raw: string): string {
    const line = raw.replace(LINK, (_all, _url: string, text: string) => `${LINK_MARK.open}${text}${LINK_MARK.close}`);
    const pen: Pen = { bold: false, dim: false, italic: false, colour: null };
    const out: string[] = [];
    let at = 0;
    const emit = (text: string): void => {
        if (text === '') {
            return;
        }
        const style = pen.colour === null ? '' : ` style="color:${pen.colour}"`;
        const body = escapeHtml(text).replaceAll('📝', `${MEMO} `).replaceAll(LINK_MARK.open, '<u class="a">').replaceAll(LINK_MARK.close, '</u>');
        out.push(`<span class="${classOf(pen)}"${style}>${body}</span>`);
    };
    for (const found of line.matchAll(SGR)) {
        emit(line.slice(at, found.index));
        apply(pen, Number(found[1]));
        at = found.index + found[0].length;
    }
    emit(line.slice(at));
    return out.join('');
}

const CSS = `
html, body { margin: 0; background: #0d1117; }
body { padding: 24px; display: inline-block; }
.term { font: 14px/1.45 "DejaVu Sans Mono", Menlo, Consolas, monospace; background: #161b22; border: 1px solid #30363d; border-radius: 10px; overflow: hidden; box-shadow: 0 8px 28px rgba(0,0,0,.45); }
.bar { display: flex; gap: 7px; padding: 10px 14px; background: #21262d; }
.bar i { width: 11px; height: 11px; border-radius: 50%; background: #484f58; }
pre { margin: 0; padding: 14px 16px 18px; color: #e6edf3; font: inherit; white-space: pre; }
.b { font-weight: 700; } .d { opacity: .6; } .i { font-style: italic; }
.memo { width: 1.1em; height: 1.1em; vertical-align: -0.2em; }
.a { color: #79c0ff; text-decoration: underline; text-underline-offset: 2px; }
`;

function page(name: string, width: number, lines: readonly string[]): Page {
    const rows = lines.map(lineToHtml).join('\n');
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${name}</title><style>${CSS}</style></head>`
        + `<body><div class="term" style="width:calc(${width}ch + 32px)"><div class="bar"><i></i><i></i><i></i></div><pre>${rows}</pre></div></body></html>\n`;
    return { name, width, html };
}

interface Fixture {
    readonly messages: Messages;
    readonly title: string;
    readonly prompts: readonly [string, string];
    readonly sections: RecapSections;
    readonly backend: string;
}

/** Invented content; `decisions` is empty on purpose, to show the dash. */
const FIXTURES: Readonly<Record<'en' | 'es', Fixture>> = {
    en: {
        messages: en,
        title: 'Checkout migration',
        prompts: ['keep the old endpoint until Friday', 'add a test for expired cards'],
        backend: 'claude/haiku',
        sections: {
            goal: textOf('Move checkout to the v2 payments API, no downtime.'),
            now: [textOf('Wiring the v2 client behind a feature flag'), textOf('Unit tests are green')],
            needs: [textOf('Should v1 keep accepting gift cards after the cut-over?')],
            done: [textOf('!938 merged: every v1 field mapped to v2'), textOf('Added retries with backoff to the client')],
            decisions: [],
            next: [textOf('Test for expired cards'), textOf('Canary at 5% of traffic')],
            links: [textOf('`src/payments/v2/client.ts`'), textOf('`feat/payments-v2`'), textOf('!940')], rules: [textOf('Never push to main')],
        },
    },
    es: {
        messages: es,
        title: 'Migración del checkout',
        prompts: ['mantén el endpoint viejo hasta el viernes', 'añade una prueba para tarjetas vencidas'],
        backend: 'claude/haiku',
        sections: {
            goal: textOf('Pasar el checkout a la API de pagos v2, sin cortes.'),
            now: [textOf('Conectando el cliente v2 tras un feature flag'), textOf('Las pruebas unitarias pasan')],
            needs: [textOf('¿v1 debe seguir aceptando tarjetas de regalo tras el cambio?')],
            done: [textOf('!938 fusionado: cada campo de v1 asignado en v2'), textOf('Reintentos con espera añadidos al cliente')],
            decisions: [],
            next: [textOf('Prueba de tarjetas vencidas'), textOf('Canario al 5 % del tráfico')],
            links: [textOf('`src/payments/v2/client.ts`'), textOf('`feat/payments-v2`'), textOf('!940')], rules: [textOf('Nunca hacer push a main')],
        },
    },
};

/** Invented repository: references in the recap link to it (drawn underlined). */
const WEB: LaneWebRecord = { base: textOf('https://git.example/team/shop'), forge: 'gitlab', branch: textOf('feat/payments-v2') };
const VERSION = '1.8.1';

const lane = (pane: string, agent: string, prompt: string, title: string | null): TabRecap['lanes'][number] =>
    ({ pane: paneId(textOf(pane)), agent: agentKind(textOf(agent)), transcript: sourcePathOf(`${agent}.jsonl`), cursor: cursorOf(1), tail: null, title: parseTextOrNull(title), lastPrompt: textOf(prompt), claudeRecap: null });

function columnView(fixture: Fixture): ColumnView {
    const tab: TabViewRecord = {
        tab: tabId(textOf('w1:t1')), column: textOf('w1:p9'), at: instant(NOW), daemonVersion: textOf(VERSION),
        lanes: [
            { pane: paneIdOf('w1:p1'), agent: agentKind(textOf('claude')), status: textOf('blocked'), title: parseTextOrNull(fixture.title), cwd: null, lastPrompt: null, web: WEB, context: { tokens: countOf(520_000), window: countOf(1_000_000), source: 'catalogue' } },
            { pane: paneIdOf('w1:p2'), agent: agentKind(textOf('codex')), status: textOf('working'), title: null, cwd: null, lastPrompt: null, web: WEB, context: { tokens: countOf(61_000), window: countOf(258_400), source: 'agent' } },
        ],
    };
    const recap: TabRecap = {
        ...blankRecap(tabId(textOf('w1:t1'))), at: instant(NOW - 120_000), backend: textOf(fixture.backend), tasks: [{ id: textOf('t1'), name: textOf(''), lanes: [paneIdOf('w1:p1'), paneIdOf('w1:p2')], sections: fixture.sections, markdown: renderRecap(fixture.sections, fixture.messages.locale) }],
        lanes: [lane('w1:p1', 'claude', fixture.prompts[0], fixture.title), lane('w1:p2', 'codex', fixture.prompts[1], null)],
    };
    return { tab, recap, notes: new Map(), warnings: [], now: NOW, messages: fixture.messages, version: VERSION, compactHint: 40 };
}

function setupState(locale: 'en' | 'es'): Setup {
    const models = { claude: 'haiku', codex: '', opencode: '', custom: '' };
    const draft = draftFrom({ backend: 'claude', models }, { locale, recapLanguage: 'ui' });
    return withAvailable(initial(draft, {}), ['claude', 'codex', 'opencode']);
}

const noMarkdown = (): null => null;
const COLUMN = 44;
const BAR = 46;
const SETUP = 66;
const EXPANDED = 100;

/** Every screenshot of the README, as HTML, from invented data. */
export function pages(): readonly Page[] {
    return [page('expanded-en', EXPANDED, expandedLines(EXPANDED)), ...(['en', 'es'] as const).flatMap((locale) => {
        const fixture = FIXTURES[locale];
        const view = columnView(fixture);
        return [
            page(`column-${locale}`, COLUMN, present(view, COLUMN, noMarkdown)),
            page(`bar-${locale}`, BAR, presentBar(view, BAR)),
            page(`setup-${locale}`, SETUP, setupLines(setupState(locale), catalogFor(fixture.messages.locale), countOf(SETUP))),
        ];
    })];
}

if (import.meta.main) {
    const outDir = process.argv[2] ?? join(import.meta.dirname, 'html');
    mkdirSync(outDir, { recursive: true });
    for (const { name, html } of pages()) {
        writeFileSync(join(outDir, `${name}.html`), html);
    }
    process.stdout.write(`${pages().length} pages in ${outDir}\n`);
}
