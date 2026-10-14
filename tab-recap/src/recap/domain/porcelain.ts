import { ok, type Result } from '#src/protocol/result.ts';
import { parseCount } from './count.ts';
import type { Count } from './count.ts';
import type { ParseFailure } from './parse-failure.ts';
import { parseText } from './text.ts';
import type { Text } from './text.ts';

export type BranchName = Text;
export type AheadCount = Count | null;
export type TrackedCount = Count;
export type UntrackedCount = Count;

export interface PorcelainReading {
    readonly branch: BranchName;
    readonly ahead: AheadCount;
    readonly tracked: TrackedCount;
    readonly untracked: UntrackedCount;
}

const DETACHED = '(detached)';
const SHORT_OID = 7;
const HEAD = /^# branch\.head (.+)$/m;
const OID = /^# branch\.oid (.+)$/m;
const AHEAD = /^# branch\.ab \+(\d+)/m;
const TRACKED_LINES = /^[12u] /gm;
const UNTRACKED_LINES = /^\? /gm;

export function parseBranchName(input: unknown): Result<BranchName, ParseFailure> {
    const raw = parseText(input);
    if (raw.kind === 'err') {
        return raw;
    }
    const head = HEAD.exec(raw.value)?.[1]?.trim() ?? '';
    const oid = OID.exec(raw.value)?.[1]?.trim() ?? '';
    return parseText(head === DETACHED ? oid.slice(0, SHORT_OID) : head);
}

export function parseAheadCount(input: unknown): Result<AheadCount, ParseFailure> {
    const raw = parseText(input);
    if (raw.kind === 'err') {
        return raw;
    }
    const found = AHEAD.exec(raw.value)?.[1];
    return found === undefined ? ok(null) : parseCount(Number(found));
}

export function parseTrackedCount(input: unknown): Result<TrackedCount, ParseFailure> {
    const raw = parseText(input);
    return raw.kind === 'err' ? raw : parseCount((raw.value.match(TRACKED_LINES) ?? []).length);
}

export function parseUntrackedCount(input: unknown): Result<UntrackedCount, ParseFailure> {
    const raw = parseText(input);
    return raw.kind === 'err' ? raw : parseCount((raw.value.match(UNTRACKED_LINES) ?? []).length);
}

export function parsePorcelainReading(input: unknown): Result<PorcelainReading, ParseFailure> {
    const branch = parseBranchName(input);
    if (branch.kind === 'err') {
        return branch;
    }
    const ahead = parseAheadCount(input);
    if (ahead.kind === 'err') {
        return ahead;
    }
    const tracked = parseTrackedCount(input);
    if (tracked.kind === 'err') {
        return tracked;
    }
    const untracked = parseUntrackedCount(input);
    if (untracked.kind === 'err') {
        return untracked;
    }
    return ok({ branch: branch.value, ahead: ahead.value, tracked: tracked.value, untracked: untracked.value });
}
