import { err, ok, type Result } from '#src/protocol/result.ts';
import { parseCount, type Count } from '#src/recap/domain/count.ts';
import type { TabId } from '#src/recap/domain/ids.ts';
import type { Origin } from '#src/recap/domain/origin.ts';
import type { Text } from '#src/recap/domain/text.ts';
import type { Instant } from '#src/recap/domain/time.ts';
import type { ParseFailure } from '@stateforge-labs/session-ledger/unstable/recap/domain/parse-failure.ts';

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

type Row = Record<string, unknown>;

const isRow = (input: unknown): input is Row => typeof input === 'object' && input !== null;

const ORIGINS: readonly Origin[] = ['operator', 'auto', 'request'];

export function parseCompactionTokensRecord(input: unknown): Result<CompactionTokensRecord, ParseFailure> {
    if (!isRow(input)) return err({ kind: 'not-a-row' });
    const tokensBefore = input.tokensBefore === null ? ok(null) : parseCount(input.tokensBefore);
    if (tokensBefore.kind === 'err') return tokensBefore;
    const tokensAfter = input.tokensAfter === null ? ok(null) : parseCount(input.tokensAfter);
    if (tokensAfter.kind === 'err') return tokensAfter;
    const origin = ORIGINS.find((option) => option === input.origin);
    if (origin === undefined) return err({ kind: 'out-of-range' });
    return ok({ tokensBefore: tokensBefore.value, tokensAfter: tokensAfter.value, origin });
}
