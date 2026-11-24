import { test } from 'node:test';
import type { TabViewRecord } from '#src/ports/tab-views.ts';
import assert from 'node:assert/strict';
import { en } from '#src/i18n/en.ts';
import { es } from '#src/i18n/es.ts';
import { present, presentBar } from '#src/recap/render/present.ts';
import { visibleLength, wrap } from '#src/recap/render/wrap.ts';
import { oneTask } from '#test/support.ts';
import { blankRecap } from '#src/ports/recap-records.ts';
import { NO_SECTIONS } from '#src/recap/domain/shape.ts';
import type { RecapSections } from '#src/recap/domain/shape.ts';
import { instant } from '#src/recap/domain/time.ts';
import { tabId, agentKind, paneId } from '#test/support/ids.ts';
import { textOf } from '#src/recap/domain/text.ts';
import { cursorOf, sourcePathOf } from '#src/ports/transcripts.ts';
import { viewRecord } from '#test/support/tab-view-records.ts';
import { wordingOf } from '#src/view-model/wording.ts';

const noGlow = (): null => null;

test('wrapping never exceeds the column width, escapes included', () => {
    for (const line of wrap('a fairly long sentence with a verylongunbreakablewordthatmustbecut in it', 12)) {
        assert.ok(visibleLength(line) <= 12, line);
    }
});

test('a tab with no agent says so', () => {
    const lines = present({ tab: null, recap: null, notes: new Map(), warnings: [], now: 0, messages: en }, 40, noGlow);
    assert.match(lines.join('\n'), /Waiting for an agent/);
});

test('two agents, one tab: a header per agent, then ONE recap for the tab', () => {
    const recap = {
        ...blankRecap(tabId('w1:t1')),
        sessions: [
            { key: paneId('w1:p1'), agent: agentKind('claude'), transcript: sourcePathOf('a'), cursor: cursorOf(1), tail: null, title: textOf('Victoria migration'), lastPrompt: textOf('go'), harnessRecap: null },
            { key: paneId('w1:p2'), agent: agentKind('codex'), transcript: sourcePathOf('b'), cursor: cursorOf(1), tail: null, title: null, lastPrompt: textOf('run tests'), harnessRecap: null },
        ],
        tasks: oneTask('## Goal\n- migrate'),
        at: instant(0),
        backend: textOf('claude/haiku'),
    };
    const text = present({
        tab: viewRecord({ tab: 'w1:t1', column: 'w1:p9', at: 0, lanes: [
            { pane: 'w1:p1', agent: 'claude', status: 'blocked', title: null, cwd: null },
            { pane: 'w1:p2', agent: 'codex', status: 'working', title: 'codex', cwd: null },
        ] }),
        recap,
        notes: new Map([['w1:p1', [{ label: 'idle', at: 0, details: ['main', '2 unmerged', 'dirty'] }]]]),
        warnings: [],
        now: 120_000,
        messages: en,
    }, 40, noGlow).join('\n');
    for (const expected of ['Victoria migration', 'blocked', 'working', '⚑ idle 2m ago', '› go', '› run tests', 'TAB RECAP', '2m ago', 'GOAL', '• migrate']) {
        assert.ok(text.includes(expected), `missing ${expected}`);
    }
    assert.equal(text.split('GOAL').length, 2, 'the recap appears once, not once per agent');
    assert.ok(text.split('\n').every((line) => visibleLength(line) <= 40));
});

test('a modal tells you how to close it; a column never does', async () => {
    const { footer } = await import('#src/recap/render/present.ts');
    assert.match(footer(40, 'modal', wordingOf(en)), /q close/);
    assert.doesNotMatch(footer(40, 'column', wordingOf(en)), /close/);
    assert.match(footer(44, 'column', wordingOf(en)), /tap: full screen/);
    assert.ok(visibleLength(footer(12, 'modal', wordingOf(en))) <= 12);
});

test('the bar: one row — each lane as a dot, then what needs you (or what is happening now)', async () => {
    const { firstItem } = await import('#src/recap/render/present.ts');
    const markdown = '## Goal\n- migrate\n\n## Now\n- running **CI** on !940\n\n## Waiting on you\n- approve the `prod` deploy\n';
    assert.equal(firstItem(markdown, 'now'), 'running CI on !940');
    const tab = viewRecord({ tab: 'w1:t1', column: null, at: 0, lanes: [{ pane: 'w1:p1', agent: 'claude', status: 'blocked', title: null, cwd: null }] });
    const lines = presentBar({ tab, recap: { ...blankRecap(tabId('w1:t1')), tasks: oneTask(markdown) }, notes: new Map(), warnings: [], now: 0, messages: en }, 30);
    assert.equal(lines.length, 1, 'one row: the bar is small');
    assert.match(lines[0] ?? '', /📝/);
    assert.match(lines[0] ?? '', /needs you: approve/);
    assert.ok(lines.every((line) => visibleLength(line) <= 30));
    const calm = presentBar({ tab, recap: { ...blankRecap(tabId('w1:t1')), tasks: oneTask('## Now\n- running CI') }, notes: new Map(), warnings: [], now: 0, messages: en }, 30);
    assert.match(calm[0] ?? '', /running CI/);
});

test('a warning is shown red above the lanes, then a blank line; none shows nothing', () => {
    const tab = viewRecord({ tab: 'w1:t1', column: null, at: 0, lanes: [{ pane: 'w1:p1', agent: 'claude', status: 'idle', title: 'x', cwd: null }] });
    const warned = present({ tab, recap: null, notes: new Map(), warnings: ['something is silent'], now: 0, messages: en }, 40, noGlow);
    assert.match(warned[0] ?? '', /something is silent/);
    assert.equal(warned[1], '');
    const calm = present({ tab, recap: null, notes: new Map(), warnings: [], now: 0, messages: en }, 40, noGlow);
    assert.doesNotMatch(calm.join('\n'), /silent/);
});

const tabOf = (status: string, title: string | null): TabViewRecord =>
    (viewRecord({ tab: 'w1:t1', column: null, at: 0, lanes: [{ pane: 'w1:p1', agent: 'claude', status, title, cwd: null }] }));

test('es: the column speaks Spanish — badge, recap meta, ago, notes, empty states', () => {
    const recap = { ...blankRecap(tabId('w1:t1')), tasks: oneTask('## Objetivo\n- migrar'), at: instant(0), backend: textOf('claude/haiku'), language: textOf('es') };
    const text = present({
        tab: tabOf('blocked', 'Migración'), recap,
        notes: new Map([['w1:p1', [{ label: 'idle', at: 0, details: ['main'] }]]]), warnings: [], now: 180_000, messages: es,
    }, 60, noGlow).join('\n');
    for (const expected of ['bloqueado — te necesita', 'RESUMEN DE PESTAÑA', 'hace 3 min', '⚑ idle hace 3 min · main', 'OBJETIVO']) {
        assert.ok(text.includes(expected), `missing ${expected}`);
    }
    assert.doesNotMatch(text, /blocked — |\bago\b|TAB RECAP/);
    assert.match(present({ tab: null, recap: null, notes: new Map(), warnings: [], now: 0, messages: es }, 60, noGlow).join('\n'), /Esperando a que haya un agente/);
    const none = present({ tab: tabOf('idle', 'x'), recap: null, notes: new Map(), warnings: [], now: 0, messages: es }, 60, noGlow).join(' ');
    assert.match(none, /Aún no hay resumen/);
});

test('es: the phone bar still shows needs-you first, then Now, from Spanish headings', async () => {
    const { firstItem } = await import('#src/recap/render/present.ts');
    const markdown = '## Objetivo\n- migrar\n\n## Ahora\n- ejecutando **CI** en !940\n\n## Esperando tu respuesta\n- aprueba el despliegue de `prod`\n';
    assert.equal(firstItem(markdown, 'now'), 'ejecutando CI en !940');
    assert.equal(firstItem(markdown, 'needs'), 'aprueba el despliegue de prod');
    const recap = { ...blankRecap(tabId('w1:t1')), tasks: oneTask(markdown), language: textOf('es') };
    const [line] = presentBar({ tab: tabOf('blocked', null), recap, notes: new Map(), warnings: [], now: 0, messages: es }, 60);
    assert.match(line ?? '', /te necesita: aprueba el despliegue/);
    const calm = presentBar({ tab: tabOf('working', null), recap: { ...recap, tasks: oneTask('## Ahora\n- ejecutando CI') }, notes: new Map(), warnings: [], now: 0, messages: es }, 60);
    assert.match(calm[0] ?? '', /ejecutando CI/);
    const empty = presentBar({ tab: tabOf('idle', null), recap: null, notes: new Map(), warnings: [], now: 0, messages: es }, 60);
    assert.match(empty[0] ?? '', /aún sin resumen/);
});

test('English headings are read in a recap that was written in English while the UI is Spanish (and vice versa)', async () => {
    const { firstItem } = await import('#src/recap/render/present.ts');
    assert.equal(firstItem('## Waiting on you\n- the OK', 'needs'), 'the OK');
    assert.equal(firstItem('## Esperando tu respuesta\n- el OK', 'needs'), 'el OK');
});

test('the roomy footers name the settings key, and none overflows its width', async () => {
    const { footer } = await import('#src/recap/render/present.ts');
    for (const messages of [en, es]) {
        for (const hint of [messages.hints.column[0] ?? '', messages.hints.modal[0] ?? '']) {
            assert.match(hint, /\bs\b/, `"${hint}" names s`);
        }
        for (const width of [12, 20, 30, 44, 80]) {
            for (const mode of ['column', 'modal'] as const) {
                assert.ok(visibleLength(footer(width, mode, wordingOf(messages))) <= width);
            }
        }
    }
    assert.match(footer(100, 'column', wordingOf(en)), /s settings/);
    assert.match(footer(120, 'column', wordingOf(es)), /s ajustes/);
});

test('the Spanish catalog keeps every hint within a phone column', () => {
    for (const hints of [es.hints.column, es.hints.modal]) {
        assert.ok(hints.some((hint) => visibleLength(hint) <= 12), 'a hint fits the narrowest column');
    }
});

const withSections = (sections: Partial<RecapSections>, language = 'en'): ReturnType<typeof blankRecap> =>
    ({ ...blankRecap(tabId('w1:t1')), language: textOf(language), tasks: oneTask('stale rendering that must not be shown', { ...NO_SECTIONS, ...sections }), at: instant(0) });

test('a recap with sections is drawn from them: all seven headings, in the interface language, — for the empty ones', () => {
    const recap = withSections({ goal: textOf('Ship the uploader'), now: [textOf('Running CI')] }, 'en');
    const draw = (messages: typeof en): string => present({ tab: tabOf('idle', 'x'), recap, notes: new Map(), warnings: [], now: 0, messages }, 60, noGlow).join('\n');
    const english = draw(en);
    for (const heading of ['GOAL', 'NOW', 'NEEDS YOU', 'DONE', 'DECISIONS', 'NEXT', 'LINKS']) {
        assert.ok(english.includes(heading), heading);
    }
    assert.ok(english.includes('Ship the uploader') && english.includes('Running CI') && english.includes('—'));
    assert.ok(!english.includes('stale rendering'));
    const spanish = draw(es);
    for (const heading of ['OBJETIVO', 'AHORA', 'TE NECESITA', 'HECHO', 'DECISIONES', 'SIGUIENTE', 'ENLACES']) {
        assert.ok(spanish.includes(heading), heading);
    }
});

const bar = (recap: ReturnType<typeof blankRecap>, messages: typeof en, status = 'blocked'): string =>
    presentBar({ tab: tabOf(status, null), recap, notes: new Map(), warnings: [], now: 0, messages }, 70)[0] ?? '';

test('the bar reads its headline from the data: needs you first, then now, then nothing', () => {
    assert.match(bar(withSections({ needs: [textOf('approve the deploy')], now: [textOf('running CI')] }), en), /needs you: approve the deploy/);
    assert.match(bar(withSections({ needs: [textOf('aprueba el despliegue')], now: [textOf('ejecutando CI')] }, 'es'), es), /te necesita: aprueba el despliegue/);
    const calm = bar(withSections({ now: [textOf('running CI')] }), en, 'working');
    assert.match(calm, /running CI/);
    assert.doesNotMatch(calm, /needs you/);
    assert.match(bar(withSections({}), en, 'idle'), /no recap yet/);
});

test('the bar says all done when the recap is written and every fact is done, and no recap yet only when nothing is written', () => {
    assert.match(bar(withSections({ done: [textOf('Added backoff')] }), en, 'idle'), /all done/);
    assert.doesNotMatch(bar(withSections({ done: [textOf('Added backoff')] }), en, 'idle'), /no recap yet/);
    assert.match(bar(withSections({ done: [textOf('agregar reintento')], goal: textOf('Subir el archivo') }, 'es'), es, 'idle'), /todo hecho/);
    assert.match(presentBar({ tab: tabOf('idle', null), recap: null, notes: new Map(), warnings: [], now: 0, messages: en }, 70)[0] ?? '', /no recap yet/);
});

test('a recap stored before the fixed structure is still shown as it was written, headline included', () => {
    const old = { ...blankRecap(tabId('w1:t1')), tasks: oneTask('## Goal\n- old\n\n## Waiting on you\n- answer me\n'), at: instant(0) };
    assert.equal(old.tasks[0]?.sections, null);
    assert.match(present({ tab: tabOf('idle', 'x'), recap: old, notes: new Map(), warnings: [], now: 0, messages: en }, 60, noGlow).join('\n'), /WAITING ON YOU/);
    assert.match(presentBar({ tab: tabOf('blocked', null), recap: old, notes: new Map(), warnings: [], now: 0, messages: en }, 60)[0] ?? '', /needs you: answer me/);
});

const exploding = (): never => { throw new Error('glow must not lay out the fixed structure'); };

const plain = (lines: readonly string[]): string[] => lines.map((line) => line.replace(new RegExp(`${String.fromCodePoint(0x1b)}\\[[0-9;]*m`, 'g'), ''));

test('the recap body: exactly one blank line between sections, none between a heading and its first line — whatever renderer is installed', () => {
    const recap = withSections({ goal: textOf('Ship it'), now: [textOf('Running CI')], done: [textOf('Added backoff')] });
    const lines = plain(present({ tab: tabOf('idle', 'x'), recap, notes: new Map(), warnings: [], now: 0, messages: en }, 60, exploding));
    const at = lines.indexOf('GOAL');
    assert.deepEqual(lines.slice(at), [
        'GOAL', 'Ship it', '',
        'NOW', '• Running CI', '',
        'NEEDS YOU', '—', '',
        'DONE', '• Added backoff', '',
        'DECISIONS', '—', '',
        'NEXT', '—', '',
        'LINKS', '—',
    ]);
});

test('plainMarkdown collapses runs of blank lines, so an old recap without blank lines between sections is separated too', async () => {
    const { plainMarkdown } = await import('#src/recap/render/wrap.ts');
    const lines = plain(plainMarkdown('## Goal\n- a\n## Now\n- b\n\n\n\n## Next\n- c', 40));
    assert.deepEqual(lines, ['GOAL', '• a', '', 'NOW', '• b', '', 'NEXT', '• c']);
});

test('a lane header shows the live prompt; the recap\'s last prompt only when there is none', () => {
    const recap = { ...blankRecap(tabId('w1:t1')), sessions: [{ key: paneId('w1:p1'), agent: agentKind('claude'), transcript: sourcePathOf('t'), cursor: cursorOf(1), tail: null, title: textOf('x'), lastPrompt: textOf('what the last recap saw'), harnessRecap: null }] };
    const draw = (lastPrompt: string | null | undefined): string => {
        const lane = { pane: 'w1:p1', agent: 'claude', status: 'working', title: 'x', cwd: null, ...(lastPrompt === undefined ? {} : { lastPrompt }) };
        return present({ tab: viewRecord({ tab: 'w1:t1', column: null, at: 0, lanes: [lane] }), recap, notes: new Map(), warnings: [], now: 0, messages: en }, 60, noGlow).join('\n');
    };
    assert.match(draw('what was just typed'), /› what was just typed/);
    assert.doesNotMatch(draw('what was just typed'), /last recap saw/);
    assert.match(draw(null), /› what the last recap saw/);
    assert.match(draw(undefined), /› what the last recap saw/, 'a view stored before the live prompt existed');
});
