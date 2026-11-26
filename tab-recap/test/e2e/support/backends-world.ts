import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { must, parseDirectory, unknown } from '@stateforge-labs/session-ledger';
import { Backends } from '#src/daemon/backends.ts';
import type { HarnessList } from '#src/ports/harnesses.ts';
import { scratch } from '#test/fixtures/git-repo.ts';
import { causeOf } from '#test/fakes/cause.ts';
import { fakeRuntime } from '#test/fakes/harness-runtime.ts';
import { agentKind } from '#test/support/ids.ts';

const KEYS = ['HERDR_PLUGIN_CONFIG_DIR', 'TAB_RECAP_BACKEND', 'TAB_RECAP_MODEL', 'TAB_RECAP_MODEL_CLAUDE', 'TAB_RECAP_MODEL_CODEX', 'TAB_RECAP_MODEL_OPENCODE', 'TAB_RECAP_CLAUDE_MODEL', 'TAB_RECAP_CODEX_MODEL', 'TAB_RECAP_EFFORT', 'TAB_RECAP_CUSTOM_CMD', 'TAB_RECAP_PIPELINE'] as const;

export interface BackendsWorld {
    readonly configFile: string;
    readonly backends: Backends;
    readonly toasts: string[];
    readonly lines: string[];
    offer(...ids: readonly string[]): void;
    offerSeparately(herdrIds: readonly string[] | 'unreachable', pathIds: readonly string[] | 'unreachable'): void;
    write(lines: string): void;
    close(): void;
}

const listed = (ids: readonly string[] | 'unreachable'): HarnessList => (ids === 'unreachable' ? unknown({ why: 'unreachable', detail: causeOf('no socket') }) : { kind: 'available', ids: ids.map((id) => agentKind(id)) });

export function backendsWorld(configDirectory?: string): BackendsWorld {
    const fixture = scratch('tab-recap-backends-');
    const config = configDirectory ?? join(fixture.root, 'config');
    mkdirSync(config, { recursive: true });
    const saved = KEYS.map((key) => process.env[key]);
    for (const key of KEYS) {
        delete process.env[key];
    }
    process.env['HERDR_PLUGIN_CONFIG_DIR'] = config;
    let fromHerdr: readonly string[] | 'unreachable' = [];
    let fromPath: readonly string[] | 'unreachable' = [];
    const toasts: string[] = [];
    const lines: string[] = [];
    const herdr = { available: (): Promise<HarnessList> => Promise.resolve(listed(fromHerdr)) };
    const path = { available: (): Promise<HarnessList> => Promise.resolve(listed(fromPath)) };
    const notifier = { notify: (title: string, body: string): Promise<{ kind: 'shown' }> => { toasts.push(`${title}: ${body}`); return Promise.resolve({ kind: 'shown' }); } };
    const backends = new Backends(must(parseDirectory(join(fixture.root, 'work'))), { herdr, path }, notifier, (line) => { lines.push(line); }, fakeRuntime({ scripts: {} }));
    return {
        configFile: join(config, 'config.env'), backends, toasts, lines,
        offer: (...offered) => { fromHerdr = offered; fromPath = offered; },
        offerSeparately: (herdrIds, pathIds) => { fromHerdr = herdrIds; fromPath = pathIds; },
        write: (text) => { writeFileSync(join(config, 'config.env'), text); },
        close: () => {
            KEYS.forEach((key, at) => { const value = saved[at]; if (value === undefined) { delete process.env[key]; } else { process.env[key] = value; } });
            fixture.clean();
        },
    };
}
