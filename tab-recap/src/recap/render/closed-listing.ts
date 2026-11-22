import { must } from '#src/protocol/result.ts';
import { textOf as asText } from '#src/recap/domain/text.ts';
import type { ClosedLaneRecord } from '#src/ports/closed-lanes.ts';
import { cleanHandoffText } from '#src/recap/domain/handoff-sanitize.ts';
import { parseText } from '#src/recap/domain/text.ts';
import type { Text } from '#src/recap/domain/text.ts';

const lineOf = (record: ClosedLaneRecord): Text =>
    must(parseText([String(record.pane), String(record.agent), String(record.closedAt), cleanHandoffText(asText(record.association?.name ?? ''))].join('\t')));

export function serializeClosedListing(records: readonly ClosedLaneRecord[]): Text {
    return must(parseText(records.map(lineOf).join('\n')));
}
