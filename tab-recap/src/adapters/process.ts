import { nodeHost } from '#src/host/node-host.mjs';
import type { Platform } from '#src/ports/host.ts';
import type { ProcessControl, Runner } from '#src/ports/process-control.ts';
import { JOB_HARNESSES, jobEnvironmentNames } from '#src/recap/domain/backend.ts';
import type { EnvironmentName } from '#src/recap/domain/backend.ts';
import { isJobTag, JOB_ATTRIBUTE_KEY } from '#src/recap/domain/job-tag.ts';
import type { JobAttributes, JobTag } from '#src/recap/domain/job-tag.ts';
import { posixProcess } from './process-posix.ts';
import { windowsProcess } from './process-windows.ts';

export type { Runner, RunOptions, RunResult } from '#src/ports/process-control.ts';
export { KILL_AFTER_MS } from './process-core.ts';

export const processFor = (platform: Platform): ProcessControl => (platform === 'windows' ? windowsProcess() : posixProcess());

export const hostProcess: ProcessControl = processFor(nodeHost().platform);

export const run: Runner = hostProcess.run;

export const SCRUBBED_ENV_NAMES = jobEnvironmentNames(JOB_HARNESSES);

export function scrubEnvironment(source: NodeJS.ProcessEnv, names: readonly EnvironmentName[]): NodeJS.ProcessEnv {
    const env: NodeJS.ProcessEnv = {};
    const scrubbed = new Set<string>(names);
    for (const [key, value] of Object.entries(source)) {
        if (!key.startsWith('HERDR_') && !key.startsWith('TAB_RECAP_') && !scrubbed.has(key)) {
            env[key] = value;
        }
    }
    return env;
}

export function serializeJobAttributes(attributes: JobAttributes): string {
    const value: unknown = attributes[JOB_ATTRIBUTE_KEY];
    if (!isJobTag(value)) {
        throw new TypeError('Unknown job tag');
    }
    return `${JOB_ATTRIBUTE_KEY}=${encodeURIComponent(value)}`;
}

function keyOf(entry: string): string | null {
    const equals = entry.indexOf('=');
    return equals < 0 ? null : entry.slice(0, equals).trim();
}

export function mergeResourceAttributes(inherited: string | undefined, attributes: JobAttributes): string {
    const kept = inherited?.split(',').filter((entry) => entry !== '' && keyOf(entry) !== JOB_ATTRIBUTE_KEY) ?? [];
    return [...kept, serializeJobAttributes(attributes)].join(',');
}

export function scrubbedEnv(jobTag?: JobTag): NodeJS.ProcessEnv {
    const env = scrubEnvironment(process.env, SCRUBBED_ENV_NAMES);
    if (jobTag === undefined) {
        return env;
    }
    try {
        const attributes = { [JOB_ATTRIBUTE_KEY]: jobTag } satisfies JobAttributes;
        env['OTEL_RESOURCE_ATTRIBUTES'] = mergeResourceAttributes(env['OTEL_RESOURCE_ATTRIBUTES'], attributes);
    } catch (error) {
        if (!(error instanceof TypeError)) {
            throw error;
        }
        process.stderr.write(`tab-recap: could not add telemetry job tag: ${error.message}\n`);
    }
    return env;
}
