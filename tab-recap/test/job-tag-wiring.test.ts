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

interface Site {
    readonly name: string;
    readonly tag: JobTag;
    readonly call: (config: Config, available: readonly string[], work: string) => Promise<unknown>;
}

const EMPTY_INPUT: RecapInput = { tab: { id: 'tab', now: 0, zone: 'UTC' }, agents: [], tasks: [], ledgers: [], notes: [], transcripts: [] };

const WRITE: Site = { name: 'summarizerFor', tag: 'recap-writer', call: (config, available, work) => summarizerFor(config, available, work).write({ input: EMPTY_INPUT, language: 'en', previousLanguage: 'en' }) };

const SITES: readonly Site[] = [
    WRITE,
    { name: 'enumeratorFor', tag: 'recap-writer', call: (config, available, work) => enumeratorFor(config, available, work)?.write('document') ?? Promise.resolve(null) },
    { name: 'briefFor', tag: 'compaction-brief', call: (config, available, work) => briefFor(config, available, work)?.write('document') ?? Promise.resolve(null) },
    { name: 'judgeFor', tag: 'judge', call: (config, available, work) => judgeFor(config, available, work)?.ask('score', 'document') ?? Promise.resolve(null) },
    { name: 'curatorFor', tag: 'curator', call: (config, available, work) => curatorFor(config, available, work)?.write('document') ?? Promise.resolve(null) },
    { name: 'deciderFor', tag: 'decider', call: (config, available, work) => deciderFor(config, available, work)?.ask({}, {}) ?? Promise.resolve(null) },
    { name: 'coverageDeciderFor', tag: 'coverage-check', call: (config, available, work) => coverageDeciderFor(config, available, work)?.ask({}, {}) ?? Promise.resolve(null) },
];

const SETTING_KEYS = ['HERDR_PLUGIN_CONFIG_DIR', 'PATH', 'TAB_RECAP_BACKEND', 'TAB_RECAP_CUSTOM_CMD', 'TAB_RECAP_TELEMETRY_TAGS', 'TAB_RECAP_AUTOCOMPACT_BY', 'TAB_RECAP_AUTOCOMPACT_COVERAGE_BY', 'OTEL_RESOURCE_ATTRIBUTES'];

const FAKE_BINARY = `#!/bin/sh
cat > /dev/null
printf '%s' "$OTEL_RESOURCE_ATTRIBUTES" > "$(dirname "$0")/$(basename "$0").env"
printf '%s' '{"result":"ok","total_cost_usd":0}'
while [ $# -gt 0 ]; do
    if [ "$1" = "-o" ]; then printf '%s' ok > "$2"; fi
    shift
done
`;

const CUSTOM_COMMAND = 'tab-recap-fake-custom';

const POSIX_ONLY = process.platform === 'win32' ? 'posix shell stand-ins' : false;

async function envSeenBy(backend: string, tagging: 'on' | 'off', site: Site, inherited?: string): Promise<string> {
    const root = mkdtempSync(join(tmpdir(), 'job-tag-wiring-'));
    const bin = join(root, 'bin');
    const saved = SETTING_KEYS.map((key) => process.env[key]);
    SETTING_KEYS.forEach((key) => { delete process.env[key]; });
    try {
        mkdirSync(bin);
        for (const name of new Set([backend, CUSTOM_COMMAND, 'claude', 'codex', 'opencode', 'hermes'])) {
            writeFileSync(join(bin, name), FAKE_BINARY);
            chmodSync(join(bin, name), 0o755);
        }
        Object.assign(process.env, {
            HERDR_PLUGIN_CONFIG_DIR: join(root, 'config'),
            PATH: `${bin}${delimiter}${saved[1] ?? ''}`,
            TAB_RECAP_BACKEND: backend,
            TAB_RECAP_CUSTOM_CMD: CUSTOM_COMMAND,
            TAB_RECAP_TELEMETRY_TAGS: tagging,
            TAB_RECAP_AUTOCOMPACT_BY: 'recap',
            TAB_RECAP_AUTOCOMPACT_COVERAGE_BY: 'decider',
            ...(inherited === undefined ? {} : { OTEL_RESOURCE_ATTRIBUTES: inherited }),
        });
        await site.call(loadConfig(), [backend], join(root, 'work'));
        return readFileSync(join(bin, `${backend === 'custom' ? CUSTOM_COMMAND : backend}.env`), 'utf8');
    } finally {
        SETTING_KEYS.forEach((key, at) => { const before = saved[at]; if (before === undefined) { delete process.env[key]; } else { process.env[key] = before; } });
        rmSync(root, { recursive: true, force: true });
    }
}

for (const backend of ['claude', 'codex'] as const) {
    for (const site of SITES) {
        test(`${site.name} on ${backend}: the child carries '${site.tag}' in OTEL_RESOURCE_ATTRIBUTES when tagging is on`, { skip: POSIX_ONLY }, async () => {
            assert.equal(await envSeenBy(backend, 'on', site), `tab_recap.job=${site.tag}`);
        });

        test(`${site.name} on ${backend}: the child carries no job tag when tagging is off`, { skip: POSIX_ONLY }, async () => {
            assert.equal(await envSeenBy(backend, 'off', site), '');
        });
    }
}

for (const backend of ['opencode', 'hermes', 'custom'] as const) {
    test(`${backend}: the child gets no job tag with tagging on, and an inherited OTEL_RESOURCE_ATTRIBUTES passes through unchanged`, { skip: POSIX_ONLY }, async () => {
        assert.equal(await envSeenBy(backend, 'on', WRITE, 'service.name=parent,team=ops'), 'service.name=parent,team=ops');
    });
}

test('claude: an inherited OTEL_RESOURCE_ATTRIBUTES is kept with the job tag appended', { skip: POSIX_ONLY }, async () => {
    assert.equal(await envSeenBy('claude', 'on', WRITE, 'service.name=parent,tab_recap.job=old'), 'service.name=parent,tab_recap.job=recap-writer');
});
