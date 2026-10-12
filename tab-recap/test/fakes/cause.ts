import type { FailureCause } from '#src/recap/domain/failure-cause.ts';

export const causeOf = (text: string): FailureCause => text as FailureCause;
