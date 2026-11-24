import { err, ok, type Result } from '@stateforge-labs/session-ledger';
import { parseCount, type Count } from '@stateforge-labs/session-ledger';
import type { ScopeId } from '#src/recap/domain/ids.ts';
import type { Origin } from '#src/recap/domain/origin.ts';
import type { Text } from '@stateforge-labs/session-ledger';
import type { Instant } from '@stateforge-labs/session-ledger';
import type { ParseFailure } from '@stateforge-labs/session-ledger';

export interface CompactionTokensRecord {
    readonly tokensBefore: Count | null;
    readonly tokensAfter: Count | null;
    readonly origin: Origin;
}

export interface SessionSourcePort {
    firstSeen(tab: ScopeId): Instant | null;
    runsByCause(tab: ScopeId): Readonly<Record<Text, Count>>;
    compactions(tab: ScopeId): readonly CompactionTokensRecord[];
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
