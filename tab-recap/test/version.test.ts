import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { codeVersion, parseVersion } from '#src/adapters/plugin-version.ts';
import { bindingsOf, boundKeys, herdrConfigPath, nodeAtLeast, nodeMajor } from '#src/adapters/host-check.ts';
import { Pidfile } from '#src/adapters/pidfile.ts';
import { en } from '#src/i18n/en.ts';
import { es } from '#src/i18n/es.ts';
import { blankRecap } from '#src/ports/recap-records.ts';
import type { TabView } from '#src/ports/tab-views.ts';
import { present, presentBar } from '#src/recap/render/present.ts';
import { visibleLength } from '#src/recap/render/wrap.ts';
import { oneTask } from '#test/support.ts';

const noGlow = (): null => null;
const ESC = String.fromCodePoint(0x1b);
const plain = (lines: readonly string[]): string => lines.join('\n').replaceAll(new RegExp(`${ESC}\\[[0-9;]*m`, 'g'), '');
const barOf = (width: number): readonly string[] => presentBar({ tab: tabWith('1.5.0'), recap, notes: new Map(), warnings: [], now: 0, messages: en, version: '1.5.0' }, width);
const lane = { pane: 'w1:p1', agent: 'claude', status: 'idle', title: 'x', cwd: null };
const tabWith = (daemonVersion?: string | null): TabView => ({ tab: 'w1:t1', column: null, at: 0, lanes: [lane], ...(daemonVersion === undefined ? {} : { daemonVersion }) });
const recap = { ...blankRecap('w1:t1'), at: 0, backend: 'claude', tasks: oneTask('## Now\n- running CI') };

test('the version is the manifest\'s version line; missing or garbage is null', () => {
    assert.equal(parseVersion('id = "tab-recap"\nversion = "1.4.1"\nmin_herdr_version = "0.9.0"\n'), '1.4.1');
    assert.equal(parseVersion('id = "x"\nmin_herdr_version = "0.9.0"\n'), null, 'only the exact key counts');
    assert.equal(parseVersion('id = "x"\n'), null);
    assert.equal(parseVersion('version = banana\n'), null);
    assert.equal(parseVersion('version = "1.4"\n'), null);
    assert.equal(parseVersion('version = "1.4.1-rc1"\n'), null);
    assert.equal(parseVersion(''), null);
});

test('codeVersion reads the manifest next to the code; no manifest is null', () => {
    assert.match(codeVersion() ?? '', /^\d+\.\d+\.\d+$/);
    const dir = mkdtempSync(join(tmpdir(), 'tab-recap-version-'));
    try {
        assert.equal(codeVersion(dir), null);
        writeFileSync(join(dir, 'herdr-plugin.toml'), 'version = "9.8.7"\n');
        assert.equal(codeVersion(dir), '9.8.7');
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test('the meta line ends with the version, in en and es, and says nothing when it is unknown', () => {
    for (const [messages, title] of [[en, 'TAB RECAP'], [es, 'RESUMEN DE PESTAÑA']] as const) {
        const text = plain(present({ tab: tabWith('1.5.0'), recap, notes: new Map(), warnings: [], now: 0, messages, version: '1.5.0' }, 60, noGlow));
        assert.match(text, new RegExp(`${title} · .* · claude · v1\\.5\\.0\\n`));
        assert.doesNotMatch(text, /restart|reinicia/, 'same version: no warning');
    }
    assert.doesNotMatch(plain(present({ tab: tabWith(), recap, notes: new Map(), warnings: [], now: 0, messages: en }, 60, noGlow)), /v\d/);
});

test('a daemon on another version than the code is named in yellow, in en and es; one too old to say shows v?', () => {
    const shown = (messages: typeof en, daemon: string | null | undefined): string[] =>
        present({ tab: tabWith(daemon), recap, notes: new Map(), warnings: [], now: 0, messages, version: '1.5.0' }, 60, noGlow);
    assert.match(plain(shown(en, '1.4.1')), /daemon v1\.4\.1 — restart/);
    assert.match(plain(shown(es, '1.4.1')), /daemon v1\.4\.1 — reinicia/);
    assert.match(plain(shown(en, undefined)), /daemon v\? — restart/);
    assert.ok(shown(en, '1.4.1').some((line) => line.includes(`${ESC}[33m`) && line.includes('daemon v1.4.1')), 'yellow');
    const unknownCode = present({ tab: tabWith('1.4.1'), recap, notes: new Map(), warnings: [], now: 0, messages: en, version: null }, 60, noGlow);
    assert.doesNotMatch(plain(unknownCode), /restart/, 'no code version, nothing to compare');
});

test('the bar shows the version when it fits and never wraps or overflows', () => {
    for (const width of [10, 24, 30, 40, 80]) {
        const lines = barOf(width);
        assert.equal(lines.length, 1, `one row at ${width}`);
        assert.ok(visibleLength(lines[0] ?? '') <= width, `fits at ${width}`);
    }
    assert.match(plain(barOf(40)), / · v1\.5\.0$/);
    assert.doesNotMatch(plain(barOf(24)), /v1\.5\.0/, 'too narrow: the headline keeps the room');
});

test('status prints the code version and the running daemon\'s pid and version', () => {
    const dir = mkdtempSync(join(tmpdir(), 'tab-recap-version-'));
    try {
        new Pidfile(dir).claim(process.pid, '1.2.3');
        const run = (locale: string): string => spawnSync(process.execPath, ['--no-warnings', 'bin/tab-recap.ts', 'status'], {
            encoding: 'utf8', env: { ...process.env, TAB_RECAP_STATE: dir, TAB_RECAP_LOCALE: locale },
        }).stdout;
        const manifest = readFileSync('herdr-plugin.toml', 'utf8');
        const code = parseVersion(manifest) ?? '';
        assert.match(run('en'), new RegExp(`^version  ${code.replaceAll('.', '\\.')}$`, 'm'));
        assert.match(run('en'), new RegExp(`^daemon   pid ${process.pid} v1\\.2\\.3$`, 'm'));
        assert.match(run('es'), new RegExp(`^versión  ${code.replaceAll('.', '\\.')}$`, 'm'));
        assert.equal(new Pidfile(dir).daemonVersion(), '1.2.3');
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

const CONFIG = `[keys]
prefix = "ctrl+a"

[[keys.command]]
key = "prefix+r"
type = "plugin_action"
command = "tab-recap.column"   # hide

[[keys.command]]
key = "prefix+g"
type = "plugin_action"
command = "other-plugin.thing"

[[keys.command]]
command = "tab-recap.columns"
key = "ctrl+alt+r"
`;

test('the node version parses to its major; anything else is null', () => {
    assert.equal(nodeMajor('v24.1.0'), 24);
    assert.equal(nodeMajor('v18.20.4'), 18);
    assert.equal(nodeMajor('banana'), null);
    assert.equal(nodeMajor(''), null);
});

test('the host check refuses Node 24.20.0 and accepts 24.21.0 and newer', () => {
    assert.equal(nodeAtLeast('v24.20.0'), false);
    assert.equal(nodeAtLeast('v24.14.0'), false);
    assert.equal(nodeAtLeast('v24.21.0'), true);
    assert.equal(nodeAtLeast('v25.0.0'), true);
    assert.equal(nodeAtLeast('banana'), false);
});

test('bindings: only tab-recap.* actions of [[keys.command]] blocks count, in either field order', () => {
    assert.deepEqual(bindingsOf(CONFIG), [{ key: 'prefix+r', action: 'tab-recap.column' }, { key: 'ctrl+alt+r', action: 'tab-recap.columns' }]);
    assert.deepEqual(bindingsOf('[keys]\nprefix = "ctrl+b"\n'), []);
    assert.deepEqual(bindingsOf('command = "tab-recap.column"\nkey = "x"\n'), [], 'outside a key block it binds nothing');
});

test('the config is HERDR_CONFIG_PATH, else ~/.config/herdr/config.toml; a missing file binds nothing', () => {
    assert.equal(herdrConfigPath({ HERDR_CONFIG_PATH: '/x/c.toml' }, '/home/a'), '/x/c.toml');
    assert.equal(herdrConfigPath({}, '/Users/a'), '/Users/a/.config/herdr/config.toml');
    assert.deepEqual(boundKeys('/nonexistent/config.toml'), []);
});

test('status says which node runs it and which keys are bound, or that none is', () => {
    const dir = mkdtempSync(join(tmpdir(), 'tab-recap-version-'));
    try {
        const run = (config: string, locale = 'en'): string => spawnSync(process.execPath, ['--no-warnings', 'bin/tab-recap.ts', 'status'], {
            encoding: 'utf8', env: { ...process.env, TAB_RECAP_STATE: dir, TAB_RECAP_LOCALE: locale, HERDR_CONFIG_PATH: config },
        }).stdout;
        writeFileSync(join(dir, 'config.toml'), CONFIG);
        const bound = run(join(dir, 'config.toml'));
        assert.match(bound, new RegExp(`^node     ${process.execPath.replaceAll('/', '\\/')} ${process.version.replaceAll('.', '\\.')}$`, 'm'));
        assert.match(bound, /^keys     prefix\+r → tab-recap\.column, ctrl\+alt\+r → tab-recap\.columns$/m);
        assert.doesNotMatch(bound, /warning/, 'this node is new enough');
        assert.match(run(join(dir, 'missing.toml')), /^keys     no key bound — see README/m);
        assert.match(run(join(dir, 'missing.toml'), 'es'), /^teclas   ninguna tecla asignada — mira el README/m);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});
