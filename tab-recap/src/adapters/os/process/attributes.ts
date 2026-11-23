import { mergeResourceAttributes, serializeJobAttribute } from '@stateforge-labs/harness-adapters/telemetry';
import { must } from '#src/protocol/result.ts';
import { isJobTag, JOB_ATTRIBUTE_KEY } from '#src/recap/domain/job-tag.ts';
import type { JobTag } from '#src/recap/domain/job-tag.ts';
import { parseText, type Text } from '#src/recap/domain/text.ts';

export interface JobAttributesRecord {
    readonly [JOB_ATTRIBUTE_KEY]: JobTag;
}

function tagOf(attributes: JobAttributesRecord): JobTag {
    const value: unknown = attributes[JOB_ATTRIBUTE_KEY];
    if (!isJobTag(value)) {
        throw new TypeError('Unknown job tag');
    }
    return value;
}

export function serializeJobAttributes(attributes: JobAttributesRecord): Text {
    return must(parseText(serializeJobAttribute({ key: JOB_ATTRIBUTE_KEY, value: tagOf(attributes) })));
}

export function mergeJobAttributes(inherited: Text | undefined, attributes: JobAttributesRecord): Text {
    return must(parseText(mergeResourceAttributes(inherited, { key: JOB_ATTRIBUTE_KEY, value: tagOf(attributes) })));
}
