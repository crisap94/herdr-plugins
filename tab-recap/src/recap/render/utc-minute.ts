import { must } from '@stateforge-labs/session-ledger';
import { parseText, type Text } from '@stateforge-labs/session-ledger';
import type { Instant } from '@stateforge-labs/session-ledger';

export const utcMinuteOf = (at: Instant): Text => must(parseText(`${new Date(at).toISOString().slice(0, 16).replace('T', ' ')}Z`));
