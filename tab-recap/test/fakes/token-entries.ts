import { must } from '@stateforge-labs/session-ledger';
import { parseText } from '@stateforge-labs/session-ledger';
import type { Text } from '@stateforge-labs/session-ledger';

export const tokenEntries = (record: Readonly<Record<string, string>>): ReadonlyMap<Text, Text> =>
    new Map(Object.entries(record).map(([name, raw]): [Text, Text] => [must(parseText(name)), must(parseText(raw))]));
