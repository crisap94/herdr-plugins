import type { EnvironmentReader } from '#src/recap/application/setup-state.ts';
import { textOf } from '@stateforge-labs/session-ledger';

export const readerOf = (record: Readonly<Record<string, string | undefined>>): EnvironmentReader => (key) => {
    const raw = record[key];
    return raw === undefined ? undefined : textOf(raw);
};
