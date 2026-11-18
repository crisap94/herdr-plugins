import type { Text } from '#src/recap/domain/text.ts';
import type { Unknown } from '@stateforge-labs/session-ledger/unstable/ports/unknowable.ts';

export type { Notified, Notifier } from './legacy.ts';

export interface Shown {
    readonly kind: 'shown';
}

export type Notice = Shown | Unknown;

export interface NotifierPort {
    notify(title: Text, body: Text): Promise<Notice>;
}
