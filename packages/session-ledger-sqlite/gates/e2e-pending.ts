import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface Uncovered {
    readonly key: string;
    readonly name: string;
    readonly file: string;
}

export const PENDING = 'gates/e2e-pending.json';

const E2E = 'test/e2e/';

const pendingKey = (item: Uncovered): string => `${item.key} ${item.name}`;

export const uncoveredLine = (item: Uncovered): string => `uncovered: ${item.key} ${item.name} (${item.file}) is used by no test under ${E2E}`;

export interface Pending {
    readonly listed: readonly string[];
    readonly findings: readonly string[];
}

export const pendingOf = (root: string): Pending => {
    const path = join(root, PENDING);
    if (!existsSync(path)) {
        return { listed: [], findings: [] };
    }
    const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
    if (!Array.isArray(parsed) || !parsed.every((item): item is string => typeof item === 'string')) {
        return { listed: [], findings: [`bad pending list: ${PENDING} must be a JSON array of "<entry> <export>" strings`] };
    }
    const twice = parsed.filter((item, at) => parsed.indexOf(item) !== at).map((item) => `pending listed twice: ${item} in ${PENDING}`);
    return { listed: parsed, findings: twice };
};

export const pendingFindings = (uncovered: readonly Uncovered[], listed: readonly string[]): readonly string[] => {
    const open = new Set(uncovered.map(pendingKey));
    const allowed = new Set(listed);
    return [
        ...uncovered.filter((item) => !allowed.has(pendingKey(item))).map(uncoveredLine),
        ...listed.filter((item) => !open.has(item)).map((item) => `pending no longer uncovered: ${item} is covered or gone; remove it from ${PENDING} (the list only shrinks)`),
    ];
};

export const pendingReport = (root: string, uncovered: readonly Uncovered[], notes: string[]): readonly string[] => {
    const pending = pendingOf(root);
    if (pending.listed.length > 0) {
        notes.push(`pending: ${pending.listed.length} uncovered export(s) listed in ${PENDING}; ${uncovered.length} uncovered now`);
    }
    return [...pendingFindings(uncovered, pending.listed), ...pending.findings];
};
