import type { ClosedLaneRecord } from '#src/ports/closed-lanes.ts';
import { sanitizeHandoffText } from '#src/recap/domain/handoff-sanitize.ts';

const lineOf = (record: ClosedLaneRecord): string =>
    [String(record.pane), String(record.agent), String(record.closedAt), sanitizeHandoffText(record.association?.name ?? '')].join('\t');

export function serializeClosedListing(records: readonly ClosedLaneRecord[]): string {
    return records.map(lineOf).join('\n');
}
