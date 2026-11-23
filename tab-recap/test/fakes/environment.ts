import type { EnvironmentReader } from '#src/recap/domain/backend.ts';
import { textOf } from '#src/recap/domain/text.ts';

export const readerOf = (record: Readonly<Record<string, string | undefined>>): EnvironmentReader => (key) => {
    const raw = record[key];
    return raw === undefined ? undefined : textOf(raw);
};
