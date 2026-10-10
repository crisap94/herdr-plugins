import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WriteStream } from 'node:tty';
import { stripVTControlCharacters } from 'node:util';
import { styleFor } from '#src/adapters/terminal-style.ts';
import { en } from '#src/i18n/en.ts';
import { present, presentBar } from '#src/recap/render/present.ts';
import { coloured, plain } from '#src/recap/render/wrap.ts';
import { setupView } from '#src/recap/render/setup.ts';
import { blankRecap } from '#src/ports/recap-records.ts';
import { draftFrom, initial, withAvailable } from '#src/recap/application/setup-keys.ts';
import { oneTask } from '#test/support.ts';

const ESC = String.fromCodePoint(0x1b);

test('colours: the coloured table writes escapes, the plain table the same text without any', () => {
    assert.equal(coloured.bold('x'), `${ESC}[1mx${ESC}[22m`);
    assert.equal(coloured.gray('x'), `${ESC}[90mx${ESC}[39m`);
    assert.deepEqual(Object.keys(plain), Object.keys(coloured));
    for (const name of Object.keys(coloured) as (keyof typeof coloured)[]) {
        assert.equal(plain[name]('x'), 'x');
        assert.equal(stripVTControlCharacters(coloured[name]('x')), 'x');
    }
});

const noGlow = (): null => null;
const lane = { cwd: '/work', pane: 'w1:t1:p1', agent: 'claude', status: 'working', title: 'work', lastPrompt: 'do 📝 things ✅' } as const;
const view = (style?: typeof plain): Parameters<typeof present>[0] => ({
    tab: { tab: 'w1:t1', column: null, at: 0, lanes: [lane] },
    recap: { ...blankRecap('w1:t1'), at: 0, tasks: oneTask('## Now\n- 📝📝📝📝📝📝📝📝📝📝 ✅✅✅✅✅✅✅✅✅✅ done') },
    notes: new Map(),
    warnings: [],
    now: 60_000,
    messages: en,
    ...(style === undefined ? {} : { style }),
});

test('colours: with the plain table the column has no escape sequence and the same visible text', () => {
    const withColour = present(view(), 30, noGlow);
    const without = present(view(plain), 30, noGlow);
    assert.ok(withColour.some((line) => line.includes(ESC)));
    assert.ok(without.every((line) => line === stripVTControlCharacters(line)));
    assert.deepEqual(without, withColour.map(stripVTControlCharacters));
    assert.ok(presentBar(view(plain), 30).every((line) => !line.includes(ESC)));
});

const models = { claude: '', codex: '', opencode: '', hermes: '', custom: '' };
const setup = initial(draftFrom({ backend: 'codex', models }, { locale: undefined, recapLanguage: undefined }), { locale: 'TAB_RECAP_LOCALE' });

test('colours: the setup screen takes the plain table too', () => {
    const lines = setupView(withAvailable(setup, ['claude']), en, 60, plain);
    assert.ok(lines.every((line) => !line.includes(ESC)));
});

const nodeHasColors = Reflect.get(WriteStream.prototype, 'hasColors') as (this: unknown, env?: object) => boolean;
const nodeColorDepth = Reflect.get(WriteStream.prototype, 'getColorDepth') as unknown;
const terminal = { hasColors: (env?: object): boolean => nodeHasColors.call({ getColorDepth: nodeColorDepth }, env) };
const COLOUR_TERM = { TERM: 'xterm-256color' };

test('colours: a colour terminal gets colours; NO_COLOR, FORCE_COLOR=0, NODE_DISABLE_COLORS and a non-terminal get none', () => {
    assert.equal(styleFor(terminal, COLOUR_TERM), coloured);
    for (const env of [{ NO_COLOR: '1' }, { FORCE_COLOR: '0' }, { NODE_DISABLE_COLORS: '1' }]) {
        assert.equal(styleFor(terminal, { ...COLOUR_TERM, ...env }), plain, JSON.stringify(env));
    }
    assert.equal(styleFor({}, COLOUR_TERM), plain);
});

test('colours: the table a NO_COLOR terminal gets draws the same text with no escape sequences', () => {
    const asked = styleFor(terminal, { ...COLOUR_TERM, NO_COLOR: '1' });
    const lines = present({ ...view(), style: asked }, 30, noGlow);
    assert.ok(lines.every((line) => !line.includes(ESC)));
    assert.deepEqual(lines, present(view(), 30, noGlow).map(stripVTControlCharacters));
});
