import { brand } from './brand.ts';
import type { Brand } from './brand.ts';
import type { Text } from './text.ts';

export type FailureCause = Brand<string, 'FailureCause'>;

export function parseFailureCause(input: Text): FailureCause {
    return brand<string, 'FailureCause'>(input);
}

export function causeOf(text: Text): FailureCause {
    return parseFailureCause(text);
}

export { failureCauseOf } from './legacy.ts';
