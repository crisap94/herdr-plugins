import type { Brand } from './brand.ts';
import { collapsedText } from './text-collapse.ts';

export type FailureCause = Brand<string, 'FailureCause'>;

const MESSAGE_CODE_POINTS = 200;

export function failureCauseOf(error: unknown): FailureCause {
    if (!(error instanceof Error)) {
        return 'NonError' as FailureCause;
    }
    const message = Array.from(collapsedText(error.message, 'space')).slice(0, MESSAGE_CODE_POINTS).join('');
    return (message === '' ? error.name : `${error.name}: ${message}`) as FailureCause;
}
