import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { instant } from '../../../tab-recap/src/recap/domain/time.ts';
import type { Instant } from '../../../tab-recap/src/recap/domain/time.ts';
import type { RecapRequest } from '../../../tab-recap/src/ports/summarizer.ts';
import { NO_REPOS } from '../../../tab-recap/test/support.ts';
import { writer } from '../../../tab-recap/test/fakes/golden-writer.ts';
import type { HostPlugs } from '../../src/compose.ts';
import type { HookSession } from '../../src/payload.ts';

export const SESSION = '00000000-0000-4000-8000-000000000001';

const TAB_RECAP_FIXTURES = join(import.meta.dirname, '..', '..', '..', 'tab-recap', 'test', 'fixtures');

export const TURNS: readonly string[] = readFileSync(join(TAB_RECAP_FIXTURES, 'replay-claude.jsonl'), 'utf8').split('\n').filter((line) => line !== '');

const timeOf = (line: string): number => Date.parse((JSON.parse(line) as { timestamp: string }).timestamp);

export interface TempHost {
    readonly root: string;
    readonly stateDir: string;
    readonly hook: HookSession;
    readonly plugs: HostPlugs;
    readonly seen: RecapRequest[];
    readonly logged: string[];
    readonly clock: { now: number };
    grow(lines: readonly string[]): void;
    dispose(): void;
}

export function tempHost(session: string = SESSION): TempHost {
    const root = mkdtempSync(join(tmpdir(), 'claude-code-host-'));
    const stateDir = join(root, 'state');
    const records = join(root, 'projects', '-work', `${session}.jsonl`);
    mkdirSync(dirname(records), { recursive: true });
    writeFileSync(records, '');
    const clock = { now: 1 };
    const logged: string[] = [];
    const { summarizer, seen } = writer();
    const hook: HookSession = { session, records, cwd: root };
    const plugs: HostPlugs = {
        stateDir,
        records,
        summarizer: () => summarizer,
        language: () => 'en',
        clock: { now: (): Instant => instant(clock.now) },
        repos: NO_REPOS,
        log: (line) => { logged.push(line); },
    };
    return {
        root, stateDir, hook, plugs, seen, logged, clock,
        grow: (lines): void => {
            appendFileSync(records, lines.map((line) => `${line}\n`).join(''));
            clock.now = Math.max(clock.now + 1, ...lines.flatMap((line) => (Number.isNaN(timeOf(line)) ? [] : [timeOf(line)])));
        },
        dispose: (): void => { rmSync(root, { recursive: true, force: true }); },
    };
}
