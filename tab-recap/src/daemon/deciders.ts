import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { deciderPortOf } from '#src/adapters/job/decider.ts';
import { JevPortDecider } from '#src/adapters/job/jev-decider.ts';
import { jevKey } from '#src/adapters/job/jev-key.ts';
import type { Decider, DeciderPort } from '#src/ports/decider.ts';
import { placementFor } from '#src/recap/domain/job.ts';
import type { JobSetting } from '#src/recap/domain/job.ts';
import { settingReader } from './config.ts';
import type { Config } from './config.ts';
import type { HarnessRuntime } from '#src/adapters/harness/library.ts';
import { jobTagFor, MAKERS } from './harness-makers.ts';
import type { JobCall, JobTag } from '#src/recap/domain/job-tag.ts';
import type { Harness, LogLine } from '#src/ports/harness.ts';
import type { BackendId } from '#src/recap/domain/backend.ts';
import type { Directory } from '#src/recap/domain/directory.ts';
import { must } from '#src/protocol/result.ts';
import { parseText, type Text } from '#src/recap/domain/text.ts';
import type { FsPath } from '#src/recap/domain/fs-path.ts';

type HarnessFor = (harness: BackendId, tag: JobTag | undefined) => Harness<BackendId>;

function harnessDeciderFor(config: Config, job: JobSetting, available: readonly BackendId[], harnessFor: HarnessFor, call: JobCall): DeciderPort | null {
    const placed = placementFor(job, { backend: config.backend, models: config.models }, available);
    return placed === null ? null : deciderPortOf(harnessFor(placed.harness, jobTagFor(config, call)), { model: placed.model, effort: placed.effort });
}

const readKeyFile = (path: FsPath): Text | null => {
    try {
        const parsed = parseText(readFileSync(path, 'utf8'));
        return parsed.kind === 'ok' ? parsed.value : null;
    } catch { return null; }
};

const homeOf = (): Text => must(parseText(process.env['HOME'] ?? homedir()));

const foundKey = (): Text | null => jevKey(settingReader(), readKeyFile, homeOf());

const jevDecider = (config: Config): DeciderPort => new JevPortDecider({ url: config.jev.url, model: config.jev.model, key: foundKey });

function decider(config: Config, available: readonly BackendId[], work: Directory, runtime: HarnessRuntime, log: LogLine | undefined): DeciderPort | null {
    const { by } = config.decider;
    if (by === 'jev') {
        return jevDecider(config);
    }
    return harnessDeciderFor(config, { ...config.decider, by }, available, (id, tag) => MAKERS[id](config, work, runtime, tag, log), 'decider');
}

function coverageDecider(config: Config, available: readonly BackendId[], work: Directory, runtime: HarnessRuntime, log: LogLine | undefined): DeciderPort | null {
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

export function deciderFor(config: Config, available: readonly BackendId[], work: Directory, runtime: HarnessRuntime, log?: LogLine): Decider | null {
    return decider(config, available, work, runtime, log);
}

export function coverageDeciderFor(config: Config, available: readonly BackendId[], work: Directory, runtime: HarnessRuntime, log?: LogLine): Decider | null {
    return coverageDecider(config, available, work, runtime, log);
}

export function deciderPortFor(config: Config, available: readonly BackendId[], work: Directory, runtime: HarnessRuntime, log?: LogLine): DeciderPort | null {
    return decider(config, available, work, runtime, log);
}

export function coverageDeciderPortFor(config: Config, available: readonly BackendId[], work: Directory, runtime: HarnessRuntime, log?: LogLine): DeciderPort | null {
    return coverageDecider(config, available, work, runtime, log);
}
