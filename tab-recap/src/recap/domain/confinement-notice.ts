import type { BackendId } from './backend.ts';
import { brand, type Brand } from './brand.ts';

export type ConfinementNoticeLine = Brand<string, 'ConfinementNoticeLine'>;

export type CostBasis = 'billed' | 'list' | 'unreported' | 'unavailable';

export type ConfinementState = 'supported' | 'emulated' | 'unsupported' | 'unmeasured';

export interface ConfinementCell {
    readonly axis: 'builtins' | 'mcp' | 'settings';
    readonly state: ConfinementState;
}

const NOTICE = {
    weakStates: ['emulated', 'unmeasured'],
    unmeasuredCosts: ['unreported', 'unavailable'],
    prefix: 'harness ',
    cellSeparator: ', ',
    partSeparator: '; ',
} as const;

const weakCells = (cells: readonly ConfinementCell[]): readonly ConfinementCell[] => cells.filter((cell) => NOTICE.weakStates.some((state) => state === cell.state));

const unmeasuredCosts = (basis: CostBasis | undefined): readonly CostBasis[] => NOTICE.unmeasuredCosts.filter((weak) => weak === basis);

export function parseConfinementNoticeLine(input: unknown): ConfinementNoticeLine | null {
    return typeof input === 'string' && input.startsWith(NOTICE.prefix) ? brand<string, 'ConfinementNoticeLine'>(input) : null;
}

export function confinementNotice(id: BackendId, cells: readonly ConfinementCell[], basis: CostBasis | undefined): ConfinementNoticeLine | null {
    const weak = weakCells(cells).map((cell) => `${cell.axis} ${cell.state}`).join(NOTICE.cellSeparator);
    const parts = [weak, ...unmeasuredCosts(basis).map((cost) => `cost ${cost}`)].filter((part) => part !== '');
    return parts.length === 0 ? null : parseConfinementNoticeLine(`${NOTICE.prefix}${id}: ${parts.join(NOTICE.partSeparator)}`);
}
