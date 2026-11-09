import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Directory } from '#src/recap/domain/directory.ts';
import { NO, YES, type Flag } from '#src/recap/domain/gui-tab-parts.ts';
import type { TabId } from '#src/recap/domain/ids.ts';
import { INDEX_FILE } from './desktop-constants.ts';

interface Listing {
    readonly tabs: readonly unknown[];
}

interface Row {
    readonly tab: unknown;
}

const isListing = (value: unknown): value is Listing => typeof value === 'object' && value !== null && 'tabs' in value && Array.isArray(value.tabs);

const isRow = (value: unknown): value is Row => typeof value === 'object' && value !== null && 'tab' in value;

export function listed(dir: Directory, tab: TabId): Flag {
    try {
        const parsed: unknown = JSON.parse(readFileSync(join(dir, INDEX_FILE), 'utf8'));
        return isListing(parsed) && parsed.tabs.some((row) => isRow(row) && row.tab === tab) ? YES : NO;
    } catch {
        return NO;
    }
}
