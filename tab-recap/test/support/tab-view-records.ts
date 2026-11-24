import { must } from '@stateforge-labs/session-ledger';
import { parseTabLaneRecord, parseTabViewRecord, type TabLaneRecord, type TabViewRecord } from '#src/ports/tab-views.ts';

export const viewRecord = (bare: unknown): TabViewRecord => must(parseTabViewRecord(bare));

export const laneRecord = (bare: unknown): TabLaneRecord => must(parseTabLaneRecord(bare));
