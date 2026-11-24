import type { Text } from '@stateforge-labs/session-ledger';
import type { Unknown } from '@stateforge-labs/session-ledger';

export interface BriefText {
    readonly kind: 'briefed';
    readonly text: Text;
}

export type BriefWritten = BriefText | Unknown;

export interface BriefWriter {
    readonly backend: Text;
    readonly job: Text;
    write(document: Text, correction?: Text): Promise<BriefWritten>;
}
