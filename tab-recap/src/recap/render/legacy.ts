import { instant } from '#src/recap/domain/time.ts';
import { utcMinuteOf } from './utc-minute.ts';

export const utcMinuteText = (ms: number): string => utcMinuteOf(instant(ms));
