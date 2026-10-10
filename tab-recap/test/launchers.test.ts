import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const LAUNCH = new URL('../src/host/launch.mjs', import.meta.url).href;
const ENTRY = new URL('./fixtures/launch-entry.mjs', import.meta.url).href;
const OLD = { nodeVersion: 'v20.11.0', execPath: '/old/bin/node', platform: 'macos', path: '' };
const NEW = { ...OLD, nodeVersion: 'v24.21.0' };

function launched(kind: string, host: object, argv: string[] = [], locale = 'en'): { status: number | null; out: string; err: string } {
    const home = mkdtempSync(join(tmpdir(), 'tab-recap-launch-'));
    try {
        const script = `import { launch } from ${JSON.stringify(LAUNCH)}; await launch(${JSON.stringify(kind)}, ${JSON.stringify(ENTRY)}, ${JSON.stringify({ host, argv })});`;
        const done = spawnSync(process.execPath, ['--no-warnings', '--input-type=module', '-e', script], {
            encoding: 'utf8', timeout: 10_000,
            env: { ...process.env, HERDR_PLUGIN_CONFIG_DIR: home, TAB_RECAP_STATE: home, TAB_RECAP_LOCALE: locale },
        });
        return { status: done.status, out: done.stdout, err: done.stderr };
    } finally {
        rmSync(home, { recursive: true, force: true });
    }
}

test('a supported host loads the entry, whatever the kind, without a word of its own', () => {
    for (const kind of ['daemon', 'pane', 'command']) {
        const done = launched(kind, NEW);
        assert.deepEqual([done.status, done.out, done.err], [0, 'entry ran\n', ''], kind);
    }
});

test('an unsupported host stops a command: stderr, exit 1, the entry never loaded', () => {
    const done = launched('command', OLD, ['refresh']);
    assert.equal(done.status, 1);
    assert.match(done.err, /needs Node >= 24\.21\.0, but this is v20\.11\.0 \(\/old\/bin\/node\)/);
    assert.match(done.err, /brew install node[\s\S]*herdr server stop[\s\S]*launchctl setenv PATH/, 'the macOS steps');
    assert.doesNotMatch(done.err, /\n\s+at /, 'no stack trace');
    assert.doesNotMatch(done.out, /entry ran/);
});

test('`status` goes on: it loads the entry and reports itself', () => {
    const done = launched('command', OLD, ['status']);
    assert.deepEqual([done.status, done.out, done.err], [0, 'entry ran\n', '']);
});

test('an unsupported host stops the daemon with one dated line in its log and exit 1', () => {
    const done = launched('daemon', { ...OLD, platform: 'linux' });
    assert.equal(done.status, 1);
    assert.match(done.err, /^\d{4}-\d\d-\d\dT[\d:.]+Z tab-recap needs Node >= 24\.21\.0, but this is v20\.11\.0/);
    assert.match(done.err, /nvm install 24 · mise use -g node@24 · n 24/, 'the Linux steps');
    assert.doesNotMatch(done.out, /entry ran/);
});

test('the refusal follows the interface language', () => {
    assert.match(launched('command', OLD, [], 'es').err, /necesita Node >= 24\.21\.0, pero este es v20\.11\.0/);
});

test('a pane shows the refusal and stays until SIGTERM, then leaves quietly', async () => {
    const script = `import { launch } from ${JSON.stringify(LAUNCH)}; await launch('pane', ${JSON.stringify(ENTRY)}, { host: ${JSON.stringify(OLD)} });`;
    const home = mkdtempSync(join(tmpdir(), 'tab-recap-launch-'));
    const child = spawn(process.execPath, ['--no-warnings', '--input-type=module', '-e', script], { env: { ...process.env, TAB_RECAP_LOCALE: 'en', HERDR_PLUGIN_CONFIG_DIR: home, TAB_RECAP_STATE: home } });
    try {
        let out = '';
        child.stdout.setEncoding('utf8').on('data', (chunk: string) => { out += chunk; });
        const exited = new Promise<number | null>((resolve) => { child.on('exit', resolve); });
        for (let waited = 0; !out.includes('herdr server stop') && waited < 5000; waited += 50) {
            await new Promise((resolve) => { setTimeout(resolve, 50); });
        }
        assert.match(out, /needs Node >= 24\.21\.0, but this is v20\.11\.0/);
        assert.match(out, /\r\n/, 'drawn for a terminal');
        assert.equal(child.exitCode, null, 'it stays');
        assert.doesNotMatch(out, /entry ran/);
        child.kill('SIGTERM');
        assert.equal(await exited, 0);
    } finally {
        child.kill('SIGKILL');
        rmSync(home, { recursive: true, force: true });
    }
});

const LAUNCHERS = ['bin/tab-recap.mjs', 'src/column/launch.mjs', 'src/setup/launch.mjs', 'src/compact/launch.mjs', 'src/daemon/launch.mjs'];

test('the five launchers share one shape: plain JavaScript, no static import of a .ts, one launch() call', () => {
    for (const file of LAUNCHERS) {
        const source = readFileSync(join(ROOT, file), 'utf8');
        assert.doesNotMatch(source, /^\s*import\b[^\n]*\.ts['"]/m, `${file} imports no TypeScript statically`);
        assert.doesNotMatch(source, /:\s*(string|number|boolean)\b|\bas\s+\w+|\binterface\b/, `${file} has no TypeScript syntax`);
        assert.match(source, /^import \{ launch \} from '[./a-z]*host\/launch\.mjs';$/m, file);
        assert.match(source, /^await launch\('(pane|daemon|command)', new URL\('\.\/(main|tab-recap)\.ts', import\.meta\.url\)\.href\);$/m, file);
    }
});

test('a real launcher on this Node loads its entry', () => {
    const done = spawnSync(process.execPath, ['--no-warnings', join(ROOT, 'bin', 'tab-recap.mjs'), '--help'], { encoding: 'utf8', env: { ...process.env, TAB_RECAP_LOCALE: 'en' } });
    assert.equal(done.status, 0, done.stderr);
    assert.match(done.stdout, /USAGE: tab-recap /);
});

test('every node command of the manifest is a launcher', () => {
    const manifest = readFileSync(join(ROOT, 'herdr-plugin.toml'), 'utf8');
    const commands = [...manifest.matchAll(/^command = \["node", "([^"]+)"/gm)].map((found) => found[1]);
    assert.ok(commands.length >= 14, 'the actions, the startup, the event and the panes');
    for (const file of commands) {
        assert.ok(LAUNCHERS.includes(file ?? ''), `${file} is a launcher`);
    }
    assert.deepEqual(new Set(commands.filter((file) => file !== 'bin/tab-recap.mjs')), new Set(['src/column/launch.mjs', 'src/setup/launch.mjs', 'src/compact/launch.mjs']));
    assert.doesNotMatch(manifest, /platforms = .*windows/, 'Windows is not declared yet');
});

test('the daemon is started through its launcher', () => {
    assert.match(readFileSync(join(ROOT, 'bin', 'tab-recap.ts'), 'utf8'), /\[join\(root, 'src', 'daemon', 'launch\.mjs'\)\]/);
    assert.match(readFileSync(join(ROOT, 'package.json'), 'utf8'), /node src\/daemon\/launch\.mjs/);
});
