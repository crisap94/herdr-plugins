import type { Brand } from './brand.js';

export type PaneId = Brand<string, 'PaneId'>;
export type Count = Brand<number, 'Count'>;

export interface RowFields {
    id: PaneId;
    count: Count;
}

export type Row = Readonly<RowFields>;

export function rowId(row: Row): PaneId {
    return row.id;
}
