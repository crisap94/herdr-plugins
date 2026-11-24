import type { Text } from '@stateforge-labs/session-ledger';
import type { Unknown } from '@stateforge-labs/session-ledger';

export interface Shown {
    readonly kind: 'shown';
}

export type Notice = Shown | Unknown;

export interface NotifierPort {
    notify(title: Text, body: Text): Promise<Notice>;
}
