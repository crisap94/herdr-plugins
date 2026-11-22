import type { ProcessControl, Runner } from '#src/ports/process-control.ts';
import { JOB_HARNESSES, jobEnvironmentNames } from '#src/recap/domain/backend.ts';
import type { EnvironmentName } from '#src/recap/domain/backend.ts';
import { JOB_ATTRIBUTE_KEY } from '#src/recap/domain/job-tag.ts';
import type { JobTag } from '#src/recap/domain/job-tag.ts';
import { must } from '#src/protocol/result.ts';
import { parseText } from '#src/recap/domain/text.ts';
import { type JobAttributesRecord, mergeJobAttributes } from './attributes.ts';
import { posixProcess } from './control-posix.ts';

export type { Runner, RunOptions, RunResult } from '#src/ports/process-control.ts';
export { serializeJobAttributes, type JobAttributesRecord } from './attributes.ts';
export { mergeJobAttributes } from './attributes.ts';
export { KILL_AFTER_MS } from './core.ts';

export const hostProcess: ProcessControl = posixProcess();

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

export function scrubbedFrom(source: NodeJS.ProcessEnv, jobTag?: JobTag): NodeJS.ProcessEnv {
    const env = scrubEnvironment(source, SCRUBBED_ENV_NAMES);
    if (jobTag === undefined) {
        return env;
    }
    try {
        const attributes = { [JOB_ATTRIBUTE_KEY]: jobTag } satisfies JobAttributesRecord;
        const inherited = env['OTEL_RESOURCE_ATTRIBUTES'];
        env['OTEL_RESOURCE_ATTRIBUTES'] = mergeJobAttributes(inherited === undefined ? undefined : must(parseText(inherited)), attributes);
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
