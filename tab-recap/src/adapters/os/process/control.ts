import { withJobAttribute } from '@stateforge-labs/harness-adapters/telemetry';
import type { ProcessPort, ProcessRunner } from '#src/ports/process-control.ts';
import { JOB_HARNESSES, jobEnvironmentNames } from '@stateforge-labs/session-ledger';
import type { EnvironmentName } from '@stateforge-labs/session-ledger';
import { isJobTag, JOB_ATTRIBUTE_KEY } from '#src/recap/domain/job-tag.ts';
import type { JobTag } from '#src/recap/domain/job-tag.ts';
import { posixProcess } from './control-posix.ts';

export type { ProcessRunner, ProcessOptions, ProcessOutcome } from '#src/ports/process-control.ts';
export { serializeJobAttributes, type JobAttributesRecord } from './attributes.ts';
export { mergeJobAttributes } from './attributes.ts';
export { KILL_AFTER_MS } from './core.ts';

export const hostProcess: ProcessPort = posixProcess();

export const run: ProcessRunner = hostProcess.run;

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

export function scrubbedFrom(source: NodeJS.ProcessEnv, jobTag?: JobTag): NodeJS.ProcessEnv {
    const env = scrubEnvironment(source, SCRUBBED_ENV_NAMES);
    if (jobTag === undefined) {
        return env;
    }
    try {
        if (!isJobTag(jobTag)) {
            throw new TypeError('Unknown job tag');
        }
        return { ...withJobAttribute(env, { key: JOB_ATTRIBUTE_KEY, value: jobTag }) };
    } catch (error) {
        if (!(error instanceof TypeError)) {
            throw error;
        }
        process.stderr.write(`tab-recap: could not add telemetry job tag: ${error.message}\n`);
    }
    return env;
}

export function scrubbedEnv(jobTag?: JobTag): NodeJS.ProcessEnv {
    return scrubbedFrom(process.env, jobTag);
}
