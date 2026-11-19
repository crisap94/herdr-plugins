import { catalogFor } from '#src/i18n/index.ts';
import type { Messages } from '#src/i18n/index.ts';
import { must } from '#src/protocol/result.ts';
import { instant } from '#src/recap/domain/time.ts';
import { parseCount } from '#src/recap/domain/count.ts';
import { coloured } from '@stateforge-labs/recap-view/unstable/wrap.ts';
import type { Style } from '@stateforge-labs/recap-view/unstable/wrap.ts';
import type { Setup } from '#src/recap/application/setup-keys.ts';
import { setupFooterLine, setupLines } from './setup.ts';
import { utcMinuteOf } from './utc-minute.ts';

export const utcMinuteText = (ms: number): string => utcMinuteOf(instant(ms));

export function setupView(state: Setup, m: Messages, width: number, style: Style = coloured): string[] {
    return setupLines(state, catalogFor(m.locale), must(parseCount(width)), style);
}

export function setupFooter(state: Setup, m: Messages, width: number, style: Style = coloured): string {
    return setupFooterLine(state, catalogFor(m.locale), must(parseCount(width)), style);
}
