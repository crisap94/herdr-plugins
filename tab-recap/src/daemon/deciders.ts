import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { HarnessPortDecider } from '#src/adapters/job/decider.ts';
import { JevPortDecider } from '#src/adapters/job/jev-decider.ts';
import { jevKey } from '#src/adapters/job/jev-key.ts';
import type { DeciderPort } from '@stateforge-labs/session-ledger';
import { placementFor } from '#src/recap/domain/job.ts';
import type { JobSetting } from '#src/recap/domain/job.ts';
import { settingReader } from './config.ts';
import type { Settings } from './config.ts';
import type { HarnessRuntime } from '#src/adapters/harness/library.ts';
import { jobTagFor, MAKERS } from './harness-makers.ts';
import type { JobCall, JobTag } from '#src/recap/domain/job-tag.ts';
import type { BackendHarness, LogLine } from '#src/ports/harness.ts';
import type { BackendId } from '@stateforge-labs/session-ledger';
import type { Directory } from '@stateforge-labs/session-ledger';
import { must } from '@stateforge-labs/session-ledger';
import { parseText, type Text } from '@stateforge-labs/session-ledger';
import type { FsPath } from '#src/recap/domain/fs-path.ts';

type HarnessFor = (harness: BackendId, tag: JobTag | undefined) => BackendHarness;

function harnessDeciderFor(config: Settings, job: JobSetting, available: readonly BackendId[], harnessFor: HarnessFor, call: JobCall): DeciderPort | null {
    const placed = placementFor(job, { backend: config.backend, models: config.models }, available);
    return placed === null ? null : new HarnessPortDecider(harnessFor(placed.harness, jobTagFor(config, call)), { model: placed.model, effort: placed.effort });
}

const readKeyFile = (path: FsPath): Text | null => {
    try {
        const parsed = parseText(readFileSync(path, 'utf8'));
        return parsed.kind === 'ok' ? parsed.value : null;
    } catch { return null; }
};

const homeOf = (): Text => must(parseText(process.env['HOME'] ?? homedir()));

const foundKey = (): Text | null => jevKey(settingReader(), readKeyFile, homeOf());

const jevDecider = (config: Settings): DeciderPort => new JevPortDecider({ url: config.jev.url, model: config.jev.model, key: foundKey });

function decider(config: Settings, available: readonly BackendId[], work: Directory, runtime: HarnessRuntime, log: LogLine | undefined): DeciderPort | null {
    const { by } = config.decider;
    if (by === 'jev') {
        return jevDecider(config);
    }
    return harnessDeciderFor(config, { ...config.decider, by }, available, (id, tag) => MAKERS[id](config, work, runtime, tag, log), 'decider');
}

function coverageDecider(config: Settings, available: readonly BackendId[], work: Directory, runtime: HarnessRuntime, log: LogLine | undefined): DeciderPort | null {
    const { by } = config.coverageJob;
    const jevKeyFound = config.coverage === 'auto' && foundKey() !== null;
    if (config.coverage === 'jev' || jevKeyFound) {
        return jevDecider(config);
    }
    if (by === 'jev') {
        return jevDecider(config);
    }
    return harnessDeciderFor(config, { ...config.coverageJob, by }, available, (id, tag) => MAKERS[id](config, work, runtime, tag, log), 'coverageCheck');
}

export function deciderFor(config: Settings, available: readonly BackendId[], work: Directory, runtime: HarnessRuntime, log?: LogLine): DeciderPort | null {
    return decider(config, available, work, runtime, log);
}

export function coverageDeciderFor(config: Settings, available: readonly BackendId[], work: Directory, runtime: HarnessRuntime, log?: LogLine): DeciderPort | null {
    return coverageDecider(config, available, work, runtime, log);
}
