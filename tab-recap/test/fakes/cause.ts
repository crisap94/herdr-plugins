import { must } from '@stateforge-labs/session-ledger';
import { causeOf as domainCauseOf } from '@stateforge-labs/session-ledger';
import type { FailureCause } from '@stateforge-labs/session-ledger';
import { parseText } from '@stateforge-labs/session-ledger';

export const causeOf = (text: string): FailureCause => domainCauseOf(must(parseText(text)));
