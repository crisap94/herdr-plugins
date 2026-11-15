import { must } from '#src/protocol/result.ts';
import { causeOf as domainCauseOf } from '#src/recap/domain/failure-cause.ts';
import type { FailureCause } from '#src/recap/domain/failure-cause.ts';
import { parseText } from '#src/recap/domain/text.ts';

export const causeOf = (text: string): FailureCause => domainCauseOf(must(parseText(text)));
