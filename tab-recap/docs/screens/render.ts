// The README's screenshots, step one: the plugin's own views, drawn from invented data into HTML.
// `node docs/screens/render.ts [outDir]` writes one page per screen; `shoot.mjs` turns them into PNGs.
// Gated like the code: it only calls the pure views (`present`, `presentBar`, `setupView`).
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { en } from '#src/i18n/en.ts';
import { es } from '#src/i18n/es.ts';
import type { Messages } from '#src/i18n/messages.ts';
import { blankRecap } from '#src/ports/recap-store.ts';
import type { TabRecap, TabView } from '#src/ports/recap-store.ts';
import { draftFrom, initial, withAvailable } from '#src/recap/application/setup-keys.ts';
import type { Setup } from '#src/recap/application/setup-keys.ts';
import { present, presentBar } from '#src/recap/render/present.ts';
import type { ColumnView } from '#src/recap/render/present.ts';
import { setupView } from '#src/recap/render/setup.ts';

export interface Page {
    /** file name without extension */
    readonly name: string;
    readonly width: number;
    readonly html: string;
}

const ESC = String.fromCodePoint(0x1b);
const SGR = new RegExp(`${ESC}\\[(\\d+)m`, 'g');
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

/** One styled line (ANSI SGR, the only escapes the views use) as HTML spans. */
export function lineToHtml(line: string): string {
    const pen: Pen = { bold: false, dim: false, italic: false, colour: null };
    const out: string[] = [];
    let at = 0;
    const emit = (text: string): void => {
        if (text === '') {
            return;
        }
        const style = pen.colour === null ? '' : ` style="color:${pen.colour}"`;
        out.push(`<span class="${classOf(pen)}"${style}>${escapeHtml(text).replaceAll('📝', `${MEMO} `)}</span>`);
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
    readonly markdown: string;
    readonly backend: string;
}

const FIXTURES: Readonly<Record<'en' | 'es', Fixture>> = {
    en: {
        messages: en,
        title: 'Checkout migration',
        prompts: ['keep the old endpoint until Friday', 'add a test for expired cards'],
        backend: 'claude/haiku',
        markdown: [
            '## Goal', '- Move checkout from the v1 to the v2 payments API without downtime.',
            '## Now', '- Wiring the v2 client behind a feature flag; unit tests are green.',
            '## Waiting on you', '- Should the v1 endpoint also keep accepting gift cards after the cut-over?',
            '## Done', '- Mapped every v1 field to its v2 equivalent.', '- Added retries with backoff to the client.',
            '## Decisions', '- Keep v1 alive until Friday so a rollback is one flag flip.',
            '## Next', '- Expired-card test, then a canary at 5% of traffic.',
            '## Key refs', '- `src/payments/v2/client.ts`', '- branch `feat/payments-v2`',
        ].join('\n'),
    },
    es: {
        messages: es,
        title: 'Migración del checkout',
        prompts: ['mantén el endpoint viejo hasta el viernes', 'añade una prueba para tarjetas vencidas'],
        backend: 'claude/haiku',
        markdown: [
            '## Objetivo', '- Pasar el checkout de la API de pagos v1 a la v2 sin interrupciones.',
            '## Ahora', '- Conectando el cliente v2 tras un feature flag; las pruebas unitarias pasan.',
            '## Esperando tu respuesta', '- ¿El endpoint v1 debe seguir aceptando tarjetas de regalo tras el cambio?',
            '## Hecho', '- Asignado cada campo de v1 a su equivalente en v2.', '- Añadidos reintentos con espera al cliente.',
            '## Decisiones', '- Mantener v1 hasta el viernes para que volver atrás sea un solo flag.',
            '## Próximos pasos', '- Prueba de tarjeta vencida y luego un canario al 5 % del tráfico.',
            '## Referencias clave', '- `src/payments/v2/client.ts`', '- rama `feat/payments-v2`',
        ].join('\n'),
    },
};

const lane = (pane: string, agent: string, prompt: string, title: string | null): TabRecap['lanes'][number] =>
    ({ pane, agent, transcript: `${agent}.jsonl`, cursor: 1, title, lastPrompt: prompt, claudeRecap: null });

function columnView(fixture: Fixture): ColumnView {
    const tab: TabView = {
        tab: 'w1:t1', column: 'w1:p9', at: NOW,
        lanes: [
            { pane: 'w1:p1', agent: 'claude', status: 'blocked', title: fixture.title },
            { pane: 'w1:p2', agent: 'codex', status: 'working', title: null },
        ],
    };
    const recap: TabRecap = {
        ...blankRecap('w1:t1'), at: NOW - 120_000, backend: fixture.backend, markdown: fixture.markdown,
        lanes: [lane('w1:p1', 'claude', fixture.prompts[0], fixture.title), lane('w1:p2', 'codex', fixture.prompts[1], null)],
    };
    return { tab, recap, notes: new Map(), warnings: [], now: NOW, messages: fixture.messages };
}

function setupState(locale: 'en' | 'es'): Setup {
    const models = { claude: 'haiku', codex: '', opencode: '', hermes: '', custom: '' };
    const draft = draftFrom({ backend: 'claude', models, words: 450 }, { locale, recapLanguage: 'ui' });
    return withAvailable(initial(draft, {}), ['claude', 'codex', 'opencode']);
}

const noMarkdown = (): null => null;
const COLUMN = 44;
const BAR = 46;
const SETUP = 66;

/** Every screenshot of the README, as HTML, from invented data. */
export function pages(): readonly Page[] {
    return (['en', 'es'] as const).flatMap((locale) => {
        const fixture = FIXTURES[locale];
        const view = columnView(fixture);
        return [
            page(`column-${locale}`, COLUMN, present(view, COLUMN, noMarkdown)),
            page(`bar-${locale}`, BAR, presentBar(view, BAR)),
            page(`setup-${locale}`, SETUP, setupView(setupState(locale), fixture.messages, SETUP)),
        ];
    });
}

if (import.meta.main) {
    const outDir = process.argv[2] ?? join(import.meta.dirname, 'html');
    mkdirSync(outDir, { recursive: true });
    for (const { name, html } of pages()) {
        writeFileSync(join(outDir, `${name}.html`), html);
    }
    process.stdout.write(`${pages().length} pages in ${outDir}\n`);
}
