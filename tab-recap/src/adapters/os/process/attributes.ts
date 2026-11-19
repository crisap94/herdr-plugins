import { must } from '#src/protocol/result.ts';
import { isJobTag, JOB_ATTRIBUTE_KEY } from '#src/recap/domain/job-tag.ts';
import type { JobTag } from '#src/recap/domain/job-tag.ts';
import { parseText, type Text } from '#src/recap/domain/text.ts';

export interface JobAttributesRecord {
    readonly [JOB_ATTRIBUTE_KEY]: JobTag;
}

const TAG_KEY: Text = must(parseText(JOB_ATTRIBUTE_KEY));

const keyOf = (entry: Text): Text | null => {
    const equals = entry.indexOf('=');
    return equals < 0 ? null : must(parseText(entry.slice(0, equals).trim()));
};

export function serializeJobAttributes(attributes: JobAttributesRecord): Text {
    const value: unknown = attributes[JOB_ATTRIBUTE_KEY];
    if (!isJobTag(value)) {
        throw new TypeError('Unknown job tag');
    }
    return must(parseText(`${JOB_ATTRIBUTE_KEY}=${encodeURIComponent(value)}`));
}

export function mergeJobAttributes(inherited: Text | undefined, attributes: JobAttributesRecord): Text {
    const entries = inherited?.split(',').map((entry) => must(parseText(entry))) ?? [];
    const kept = entries.filter((entry) => entry.length > 0 && keyOf(entry) !== TAG_KEY);
    return must(parseText([...kept, serializeJobAttributes(attributes)].join(',')));
}
