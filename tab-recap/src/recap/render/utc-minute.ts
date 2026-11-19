import { must } from '#src/protocol/result.ts';
import { parseText, type Text } from '#src/recap/domain/text.ts';
import type { Instant } from '#src/recap/domain/time.ts';

export { utcMinuteText } from './legacy.ts';

export const utcMinuteOf = (at: Instant): Text => must(parseText(`${new Date(at).toISOString().slice(0, 16).replace('T', ' ')}Z`));
