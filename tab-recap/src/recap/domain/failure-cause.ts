import type { Brand } from './brand.ts';

export type FailureCause = Brand<string, 'FailureCause'>;

export function failureCauseOf(error: unknown): FailureCause {
    if (!(error instanceof Error)) {
        return 'NonError' as FailureCause;
    }
    const code = 'code' in error && typeof error.code === 'string' ? error.code : null;
    return (code === null ? error.name : `${error.name}: ${code}`) as FailureCause;
}
