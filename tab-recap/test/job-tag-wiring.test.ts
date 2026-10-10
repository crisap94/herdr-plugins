import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { briefFor, curatorFor, enumeratorFor, judgeFor, summarizerFor } from '#src/daemon/backends.ts';
import { coverageDeciderFor, deciderFor } from '#src/daemon/deciders.ts';
import { loadConfig } from '#src/daemon/config.ts';
import type { Config } from '#src/daemon/config.ts';
import type { RecapInput } from '#src/ports/recap-input.ts';
import type { JobTag } from '#src/recap/domain/job-tag.ts';

type Backend = 'claude' | 'codex';

interface Site {
    readonly name: string;
    readonly tag: JobTag;
    readonly call: (config: Config, available: readonly string[], work: string) => Promise<unknown>;
}

const EMPTY_INPUT: RecapInput = { tab: { id: 'tab', now: 0, zone: 'UTC' }, agents: [], tasks: [], ledgers: [], notes: [], transcripts: [] };

const SITES: readonly Site[] = [
    { name: 'summarizerFor', tag: 'recap-writer', call: (config, available, work) => summarizerFor(config, available, work).write({ input: EMPTY_INPUT, language: 'en', previousLanguage: 'en' }) },
    { name: 'enumeratorFor', tag: 'recap-writer', call: (config, available, work) => enumeratorFor(config, available, work)?.write('document') ?? Promise.resolve(null) },
    { name: 'briefFor', tag: 'compaction-brief', call: (config, available, work) => briefFor(config, available, work)?.write('document') ?? Promise.resolve(null) },
    { name: 'judgeFor', tag: 'judge', call: (config, available, work) => judgeFor(config, available, work)?.ask('score', 'document') ?? Promise.resolve(null) },
    { name: 'curatorFor', tag: 'curator', call: (config, available, work) => curatorFor(config, available, work)?.write('document') ?? Promise.resolve(null) },
    { name: 'deciderFor', tag: 'decider', call: (config, available, work) => deciderFor(config, available, work)?.ask({}, {}) ?? Promise.resolve(null) },
    { name: 'coverageDeciderFor', tag: 'coverage-check', call: (config, available, work) => coverageDeciderFor(config, available, work)?.ask({}, {}) ?? Promise.resolve(null) },
];

const SETTING_KEYS = ['HERDR_PLUGIN_CONFIG_DIR', 'PATH', 'TAB_RECAP_BACKEND', 'TAB_RECAP_TELEMETRY_TAGS', 'TAB_RECAP_AUTOCOMPACT_BY', 'TAB_RECAP_AUTOCOMPACT_COVERAGE_BY', 'OTEL_RESOURCE_ATTRIBUTES'];

const FAKE_CLAUDE = `#!/bin/sh
cat > /dev/null
printf '%s' "$OTEL_RESOURCE_ATTRIBUTES" > "$(dirname "$0")/tag.txt"
printf '%s' '{"result":"ok","total_cost_usd":0}'
`;

const FAKE_CODEX = `#!/bin/sh
cat > /dev/null
printf '%s' "$OTEL_RESOURCE_ATTRIBUTES" > "$(dirname "$0")/tag.txt"
while [ $# -gt 0 ]; do
    if [ "$1" = "-o" ]; then printf '%s' ok > "$2"; fi
    shift
done
`;

const POSIX_ONLY = process.platform === 'win32' ? 'posix shell stand-ins' : false;

async function tagSeenBy(backend: Backend, tagging: 'on' | 'off', site: Site): Promise<string> {
    const root = mkdtempSync(join(tmpdir(), 'job-tag-wiring-'));
    const bin = join(root, 'bin');
    const saved = SETTING_KEYS.map((key) => process.env[key]);
    SETTING_KEYS.forEach((key) => { delete process.env[key]; });
    try {
        mkdirSync(bin);
        for (const [name, script] of [['claude', FAKE_CLAUDE], ['codex', FAKE_CODEX]] as const) {
            writeFileSync(join(bin, name), script);
            chmodSync(join(bin, name), 0o755);
        }
        Object.assign(process.env, {
            HERDR_PLUGIN_CONFIG_DIR: join(root, 'config'),
            PATH: `${bin}${delimiter}${saved[1] ?? ''}`,
            TAB_RECAP_BACKEND: backend,
            TAB_RECAP_TELEMETRY_TAGS: tagging,
            TAB_RECAP_AUTOCOMPACT_BY: 'recap',
            TAB_RECAP_AUTOCOMPACT_COVERAGE_BY: 'decider',
        });
        await site.call(loadConfig(), [backend], join(root, 'work'));
        return readFileSync(join(bin, 'tag.txt'), 'utf8');
    } finally {
        SETTING_KEYS.forEach((key, at) => { const before = saved[at]; if (before === undefined) { delete process.env[key]; } else { process.env[key] = before; } });
        rmSync(root, { recursive: true, force: true });
    }
}

for (const backend of ['claude', 'codex'] as const) {
    for (const site of SITES) {
        test(`${site.name} on ${backend}: the child carries '${site.tag}' in OTEL_RESOURCE_ATTRIBUTES when tagging is on`, { skip: POSIX_ONLY }, async () => {
            assert.equal(await tagSeenBy(backend, 'on', site), `tab_recap.job=${site.tag}`);
        });

        test(`${site.name} on ${backend}: the child carries no job tag when tagging is off`, { skip: POSIX_ONLY }, async () => {
            assert.equal(await tagSeenBy(backend, 'off', site), '');
        });
    }
}
