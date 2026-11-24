import type { Count } from '@stateforge-labs/session-ledger';
import type { Text } from '@stateforge-labs/session-ledger';

export interface ModelWindows {
    windowOf(model: Text): Count | null;
}
