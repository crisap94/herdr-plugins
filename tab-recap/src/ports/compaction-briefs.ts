import type { Text } from '#src/recap/domain/text.ts';
import type { Unknown } from '@stateforge-labs/session-ledger/unstable/ports/unknowable.ts';

export type { Briefed, CompactionBriefs } from './twins/legacy.ts';

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
