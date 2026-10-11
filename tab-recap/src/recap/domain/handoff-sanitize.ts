import type { Brand } from './brand.ts';

export type HandoffText = Brand<string, 'HandoffText'>;

const FORMAT_OR_TAG = /[\p{Cf}\u{E0000}-\u{E007F}]/gu;
const LINE_BREAK_OR_SPACE = /[\s\u0085]+/gu;
const CONTROL = /\p{Cc}/gu;
const WHITESPACE_RUN = /\s+/gu;

export function sanitizeHandoffText(raw: string): HandoffText {
    return raw
        .replaceAll(FORMAT_OR_TAG, '')
        .replaceAll(LINE_BREAK_OR_SPACE, ' ')
        .replaceAll(CONTROL, '')
        .replaceAll(WHITESPACE_RUN, ' ')
        .trim() as HandoffText;
}
