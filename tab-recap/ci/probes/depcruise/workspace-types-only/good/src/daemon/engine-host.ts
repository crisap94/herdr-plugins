import type { Clock } from '@stateforge-labs/session-ledger';
import { HerdrError } from '@stateforge-labs/herdr-sdk';

export type EngineClock = Clock;
export const failure = HerdrError;
