import { must } from '#src/protocol/result.ts';
import { parseText } from '#src/recap/domain/text.ts';
import { type JobAttributesRecord, mergeJobAttributes } from './attributes.ts';

export function mergeResourceAttributes(inherited: string | undefined, attributes: JobAttributesRecord): string {
    return mergeJobAttributes(inherited === undefined ? undefined : must(parseText(inherited)), attributes);
}
