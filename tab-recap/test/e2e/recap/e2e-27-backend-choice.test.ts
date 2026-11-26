import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PathHarnessDirectory } from '#src/adapters/harness/on-path.ts';
import { kindOf } from '#test/fakes/agent-kind.ts';
import { requestOf } from '#test/support.ts';
import { backendsWorld, type BackendsWorld } from '../support/backends-world.ts';
import { evalWorld, judgingWorld, type EvalWorld } from '../support/eval-world.ts';
import { recapDaemonWorld, type RecapDaemonWorld } from '../support/recap-daemon-world.ts';
import { FILE } from '../support/replay-world.ts';

const CONFIG = 'config/config.env';
const AUTO = 'auto (claude → codex → opencode)';
const CLEAR = { TAB_RECAP_BACKEND: '', TAB_RECAP_MODEL: '', TAB_RECAP_MODEL_CLAUDE: '', TAB_RECAP_MODEL_CODEX: '', TAB_RECAP_CLAUDE_MODEL: '', TAB_RECAP_CODEX_MODEL: '' };

describe('the user picks the recap backend with the command', () => {
    let world: EvalWorld;
    let settings: BackendsWorld;

    const file = (): string => readFileSync(join(world.root, CONFIG), 'utf8');
    const backend = (...args: readonly string[]): ReturnType<EvalWorld['run']> => world.run(['backend', ...args], { env: CLEAR });
    const statusBackend = async (): Promise<string> => {
        const ran = await world.run(['status'], { env: CLEAR });
        return ran.stdout.split('\n').find((line) => line.startsWith('backend '))?.slice('backend'.length).trim() ?? '';
    };

    before(async () => {
        world = evalWorld({ judge: 'none' });
        world.write(CONFIG, '');
        settings = backendsWorld(join(world.root, 'config'));
        settings.offer('opencode', 'codex');
        await settings.backends.refresh();
    });

    after(() => {
        world.close();
        settings.close();
    });

    test('backend codex gpt-x writes the choice and the model to config.env and status shows both', { timeout: 30_000 }, async () => {
        const ran = await backend('codex', 'gpt-x');
        assert.equal(ran.code, 0, ran.stderr);
        assert.match(ran.stdout, /codex\/gpt-x/);
        assert.match(file(), /^TAB_RECAP_BACKEND=codex$/m);
        assert.match(file(), /^TAB_RECAP_MODEL_CODEX=gpt-x$/m);
        assert.equal(await statusBackend(), 'codex/gpt-x');
    });

    test('the next run uses it with no restart: the writer the daemon holds is the codex one on that model', () => {
        const writer = settings.backends.summarizer();
        assert.match(writer.backend, /^codex/);
        assert.match(writer.backend, /gpt-x/);
    });

    test('backend auto writes auto, and the same daemon then takes the first of claude, codex, opencode that is available', { timeout: 30_000 }, async () => {
        const ran = await backend('auto');
        assert.equal(ran.code, 0, ran.stderr);
        assert.match(file(), /^TAB_RECAP_BACKEND=auto$/m);
        assert.equal(await statusBackend(), AUTO);
        assert.match(settings.backends.summarizer().backend, /^codex/);
        settings.offer('opencode');
        await settings.backends.refresh();
        assert.match(settings.backends.summarizer().backend, /^opencode/);
    });

    test('a bad id exits 2, names the accepted ids, and leaves config.env as it was', { timeout: 30_000 }, async () => {
        const kept = file();
        for (const bad of ['gpt', 'constructor', '']) {
            const ran = await backend(bad);
            assert.equal(ran.code, 2, bad);
            assert.match(ran.stderr, /auto\|claude\|codex\|opencode\|custom/);
        }
        assert.equal(file(), kept);
    });

    test('every accepted id is taken, and the daemon builds a writer for each', { timeout: 60_000 }, async () => {
        settings.offer('claude', 'codex', 'opencode');
        await settings.backends.refresh();
        for (const id of ['claude', 'codex', 'opencode']) {
            const ran = await backend(id);
            assert.equal(ran.code, 0, `${id}: ${ran.stderr}`);
            assert.match(settings.backends.summarizer().backend, new RegExp(`^${id}`), id);
        }
        const custom = await backend('custom');
        assert.equal(custom.code, 0, custom.stderr);
    });

    test('a named backend is taken as named even when it is not installed, and auto with nothing installed says so once', async () => {
        await backend('opencode');
        settings.offer();
        await settings.backends.refresh();
        assert.match(settings.backends.summarizer().backend, /^opencode/);
        await backend('auto');
        await settings.backends.refresh();
        await settings.backends.refresh();
        assert.equal(settings.toasts.length, 1);
        assert.equal(settings.backends.summarizer().backend, 'none');
        const written = await settings.backends.summarizer().write(requestOf());
        assert.ok(written.kind === 'unknown' && written.why.why === 'not-found');
    });

    test('on the PATH only an executable that resolves counts as installed', async () => {
        const dir = mkdtempSync(join(tmpdir(), 'tab-recap-e2e-27-path-'));
        const saved = process.env['PATH'];
        try {
            writeFileSync(join(dir, 'opencode'), '#!/bin/sh\n');
            chmodSync(join(dir, 'opencode'), 0o755);
            writeFileSync(join(dir, 'codex'), 'not executable');
            process.env['PATH'] = dir;
            const found = await new PathHarnessDirectory([kindOf('claude'), kindOf('codex'), kindOf('opencode')]).available();
            assert.ok(found.kind === 'available');
            assert.deepEqual(found.ids, ['opencode']);
        } finally {
            if (saved === undefined) { delete process.env['PATH']; } else { process.env['PATH'] = saved; }
            rmSync(dir, { recursive: true, force: true });
        }
    });

    test('what is installed is what herdr and the PATH both offer, the PATH alone when herdr cannot be asked, and herdr alone when the PATH cannot', async () => {
        settings.offerSeparately(['claude', 'codex'], ['codex', 'opencode']);
        await settings.backends.refresh();
        assert.match(settings.backends.summarizer().backend, /^codex/);
        settings.offerSeparately('unreachable', ['opencode']);
        await settings.backends.refresh();
        assert.match(settings.backends.summarizer().backend, /^opencode/);
        settings.offerSeparately(['claude'], 'unreachable');
        await settings.backends.refresh();
        assert.match(settings.backends.summarizer().backend, /^claude/);
    });
});

describe('the model comes from its own key, then from the old ones', () => {
    let world: EvalWorld;

    const statusBackend = async (...lines: readonly string[]): Promise<string> => {
        world.write(CONFIG, `${lines.join('\n')}\n`);
        const ran = await world.run(['status'], { env: CLEAR });
        return ran.stdout.split('\n').find((line) => line.startsWith('backend '))?.slice('backend'.length).trim() ?? '';
    };

    before(() => {
        world = evalWorld({ judge: 'none' });
    });

    after(() => {
        world.close();
    });

    test('a legacy per-harness key is read, and the new key wins over it', { timeout: 30_000 }, async () => {
        assert.equal(await statusBackend('TAB_RECAP_BACKEND=codex', 'TAB_RECAP_CODEX_MODEL=gpt-old'), 'codex/gpt-old');
        assert.equal(await statusBackend('TAB_RECAP_BACKEND=codex', 'TAB_RECAP_CODEX_MODEL=gpt-old', 'TAB_RECAP_MODEL_CODEX=gpt-new'), 'codex/gpt-new');
    });

    test('the generic model key serves the named backend, and never auto', { timeout: 30_000 }, async () => {
        assert.equal(await statusBackend('TAB_RECAP_BACKEND=claude', 'TAB_RECAP_MODEL=generic'), 'claude/generic');
        assert.equal(await statusBackend('TAB_RECAP_BACKEND=codex', 'TAB_RECAP_MODEL=generic'), 'codex/generic');
        assert.equal(await statusBackend('TAB_RECAP_BACKEND=auto', 'TAB_RECAP_MODEL=generic'), AUTO);
        assert.equal(await statusBackend('TAB_RECAP_BACKEND=codex', 'TAB_RECAP_MODEL=generic', 'TAB_RECAP_MODEL_CODEX=own'), 'codex/own');
        assert.equal(await statusBackend('TAB_RECAP_BACKEND=claude', 'TAB_RECAP_CLAUDE_MODEL=', 'TAB_RECAP_MODEL=generic'), 'claude/generic');
    });

    test('config.env ignores comments, blanks and lines that are no pair, and reads a quoted value without its quotes', { timeout: 30_000 }, async () => {
        assert.equal(await statusBackend('# a comment', '', 'TAB_RECAP_BACKEND=codex', 'TAB_RECAP_MODEL_CODEX="gpt-5-mini"', 'not a pair'), 'codex/gpt-5-mini');
    });

    test('an unknown backend in config.env falls back to auto', { timeout: 30_000 }, async () => {
        assert.equal(await statusBackend('TAB_RECAP_BACKEND=nonsense'), AUTO);
    });
});

describe('the effort the writer runs at', () => {
    let world: EvalWorld;

    const effort = async (...lines: readonly string[]): Promise<string> => {
        world.write(CONFIG, lines.length === 0 ? '' : `${lines.join('\n')}\n`);
        world.forget();
        world.answer('writer', JSON.stringify({ ops: [] }));
        const ran = await world.run(['eval', '--replay', FILE, '--pipeline', 'one'], { env: { TAB_RECAP_EFFORT: '' } });
        assert.equal(ran.code, 0, ran.stderr);
        return /writer custom\/fake-judge\.sh (\S+) ·/.exec(ran.stdout)?.[1] ?? '';
    };

    before(() => {
        world = judgingWorld();
    });

    after(() => {
        world.close();
    });

    test('medium unless set to low, high or default, in any case; anything else is medium', { timeout: 60_000 }, async () => {
        assert.equal(await effort(), 'medium');
        assert.equal(await effort('TAB_RECAP_EFFORT=HIGH'), 'high');
        assert.equal(await effort('TAB_RECAP_EFFORT=low'), 'low');
        assert.equal(await effort('TAB_RECAP_EFFORT=max'), 'medium');
    });
});

describe('the running daemon takes a backend chosen with the command on its next run', () => {
    let world: RecapDaemonWorld;
    let bin = '';

    const used = (): readonly Record<string, unknown>[] => world.rows('SELECT backend, error FROM run ORDER BY at');
    const argv = (): string => { try { return readFileSync(join(bin, 'argv'), 'utf8'); } catch { return ''; } };

    before(async () => {
        bin = mkdtempSync(join(tmpdir(), 'tab-recap-e2e-27-codex-'));
        writeFileSync(join(bin, 'codex'), `#!/bin/sh\necho "$@" >> ${join(bin, 'argv')}\nout=''\nprev=''\nfor each in "$@"; do\n    [ "$prev" = '-o' ] && out="$each"\n    prev="$each"\ndone\ncat > /dev/null\n[ -n "$out" ] && printf '%s' '{"ops":[]}' > "$out"\nexit 0\n`);
        chmodSync(join(bin, 'codex'), 0o755);
        world = await recapDaemonWorld({ TAB_RECAP_RUN_PACING: 'turn', TAB_RECAP_BACKEND: '', PATH: `${bin}:${process.env['PATH'] ?? ''}` });
        writeFileSync(join(world.world.configDir, 'config.env'), 'TAB_RECAP_BACKEND=custom\n');
        world.model.answer('default', JSON.stringify({ ops: [] }));
        world.announce();
        world.grow(1);
        await world.start();
    });

    after(async () => {
        await world.close();
        rmSync(bin, { recursive: true, force: true });
    });

    test('a turn before the choice runs on the custom command, and the codex harness is not called', { timeout: 30_000 }, async () => {
        world.turn();
        await world.until(() => (used().length === 1 ? true : undefined), 'the first run');
        assert.equal(used()[0]?.['backend'], 'custom/bun');
        assert.equal(argv(), '');
    });

    test('after backend codex gpt-x the same daemon runs the next turn on codex with that model', { timeout: 30_000 }, async () => {
        const pid = world.world.pidfile().pid;
        const ran = await world.world.command('backend', 'codex', 'gpt-x');
        assert.equal(ran.code, 0, ran.stderr);
        world.grow(1);
        world.turn();
        await world.until(() => (used().length === 2 ? true : undefined), 'the second run');
        assert.deepEqual(used()[1], { backend: 'codex/gpt-x', error: null });
        assert.match(argv(), / -m gpt-x /);
        assert.equal(world.world.pidfile().pid, pid, 'no restart');
    });
});
