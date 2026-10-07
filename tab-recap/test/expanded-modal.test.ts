import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { stripVTControlCharacters } from 'node:util';
import { join } from 'node:path';
import { stateStore } from '#src/adapters/db/database.ts';
import { cursor } from '#test/db/support.ts';

const pause = (ms: number): Promise<void> => new Promise((resolve) => { setTimeout(resolve, ms); });
const hasScript = ((): boolean => { try { execFileSync('sh', ['-c', 'command -v script'], { stdio: 'ignore' }); return true; } catch { return false; } })();
const ESC = String.fromCodePoint(0x1b);

/** The modal in a real pty: it draws the expanded view of the store, and `r`, `j`/`k`, `q` and Esc keep their meaning. */
test('the modal draws the expanded view; r asks for a recap, q and Esc close it', { skip: hasScript ? false : 'the `script` command (a pty) is not installed' }, async (t) => {
    if (process.platform === 'darwin') {
        t.skip('BSD script gives the column no tty when stdin is a pipe; covered on Linux');
        return;
    }
    const dir = mkdtempSync(join(tmpdir(), 'recap-modal-'));
    const state = join(dir, 'state');
    const entry = join(import.meta.dirname, '..', 'src', 'column', 'main.ts');
    const children: ReturnType<typeof spawn>[] = [];
    try {
        const store = stateStore(state);
        assert.equal(store.kind, 'ready');
        store.views.writeTab({ tab: 'w1:t1', column: null, at: Date.now() - 3_600_000, lanes: [{ pane: 'w1:p1', agent: 'claude', status: 'idle', title: 'orchestrator', cwd: null, web: { base: 'https://git.example/acme/shop', forge: 'gitlab', branch: 'main' } }] });
        store.records.recordRun({ tab: 'w1:t1', at: Date.now() - 3_600_000, cause: 'turn-ended', backend: 'claude', language: 'en', costUsd: 0, error: null, lanes: [cursor('w1:p1')], tasks: [{ id: 't1', name: '', lanes: ['w1:p1'] }], ops: [] });
        store.close();
        const open = (): { output: () => string; code: () => number | null; send: (keys: string) => void } => {
            let output = '';
            const child = spawn('script', ['-qec', `stty cols 100 rows 12; exec node ${entry}`, '/dev/null'], {
                stdio: ['pipe', 'pipe', 'ignore'],
                env: { ...process.env, TAB_RECAP_MODE: 'modal', TAB_RECAP_TAB: 'w1:t1', TAB_RECAP_STATE: state, TAB_RECAP_LOCALE: 'en', HERDR_ENV: '', HERDR_SOCKET_PATH: join(dir, 'none.sock') },
            });
            children.push(child);
            child.stdout.setEncoding('utf8').on('data', (chunk: string) => { output += chunk; });
            return { output: () => output, code: () => child.exitCode, send: (keys) => { child.stdin.write(keys); } };
        };
        const until = async (check: () => boolean, ms = 8000): Promise<boolean> => {
            const deadline = Date.now() + ms;
            for (;;) {
                if (check()) {
                    return true;
                }
                if (Date.now() >= deadline) {
                    return false;
                }
                await pause(50);
            }
        };
        const first = open();
        assert.ok(await until(() => first.output().includes('SESSION')), 'the session facts are drawn at once');
        const drawn = stripVTControlCharacters(first.output());
        assert.match(drawn, /started \d\d:\d\d · 1 h( \d+ min)?/u);
        assert.match(drawn, /turns 1 \(turn 1\)/u);
        assert.match(drawn, /repo shop · branch main/u);
        first.send('r');
        const asked = (): boolean => {
            const reader = stateStore(state);
            const taken = reader.kind === 'ready' ? reader.requests.takeRequests().length : 0;
            if (reader.kind === 'ready') {
                reader.close();
            }
            return taken > 0;
        };
        assert.ok(await until(asked), 'r asks the daemon for a recap');
        first.send('q');
        assert.ok(await until(() => first.code() !== null), 'q closes the modal');
        const second = open();
        assert.ok(await until(() => second.output().includes('SESSION')));
        second.send(ESC);
        assert.ok(await until(() => second.code() !== null), 'Esc closes the modal');
    } finally {
        children.forEach((child) => child.kill('SIGKILL'));
        rmSync(dir, { recursive: true, force: true });
    }
});
