import { must } from '#src/protocol/result.ts';
import { parseText } from '#src/recap/domain/text.ts';
import type { Text } from '#src/recap/domain/text.ts';

export const tokenEntries = (record: Readonly<Record<string, string>>): ReadonlyMap<Text, Text> =>
    new Map(Object.entries(record).map(([name, raw]): [Text, Text] => [must(parseText(name)), must(parseText(raw))]));
