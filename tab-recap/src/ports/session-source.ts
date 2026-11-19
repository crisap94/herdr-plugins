import type { Count } from '#src/recap/domain/count.ts';
import type { TabId } from '#src/recap/domain/ids.ts';
import type { Origin } from '#src/recap/domain/origin.ts';
import type { Text } from '#src/recap/domain/text.ts';
import type { Instant } from '#src/recap/domain/time.ts';

export type { CompactionTokens, SessionSource } from './twins/legacy.ts';

export interface CompactionTokensRecord {
    readonly tokensBefore: Count | null;
    readonly tokensAfter: Count | null;
    readonly origin: Origin;
}

export interface SessionSourcePort {
    firstSeen(tab: TabId): Instant | null;
    runsByCause(tab: TabId): Readonly<Record<Text, Count>>;
    compactions(tab: TabId): readonly CompactionTokensRecord[];
}
