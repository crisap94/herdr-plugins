import { must } from '@stateforge-labs/session-ledger';
import { textOf as asText } from '@stateforge-labs/session-ledger';
import type { ClosedLaneRecord } from '#src/ports/closed-lanes.ts';
import { cleanHandoffText } from '#src/recap/domain/handoff-sanitize.ts';
import { parseText } from '@stateforge-labs/session-ledger';
import type { Text } from '@stateforge-labs/session-ledger';

const lineOf = (record: ClosedLaneRecord): Text =>
    must(parseText([String(record.pane), String(record.agent), String(record.closedAt), cleanHandoffText(asText(record.association?.name ?? ''))].join('\t')));

export function serializeClosedListing(records: readonly ClosedLaneRecord[]): Text {
    return must(parseText(records.map(lineOf).join('\n')));
}
