import type { Brand } from './brand.ts';

export type HandoffText = Brand<string, 'HandoffText'>;

const LONE_SURROGATE = /\p{Cs}/gu;
const FORMAT_OR_DEFAULT_IGNORABLE = /[\p{Cf}\p{Default_Ignorable_Code_Point}]/gu;
const LINE_BREAK_OR_SPACE = /[\s\u0085]+/gu;
const CONTROL = /\p{Cc}/gu;
const WHITESPACE_RUN = /\s+/gu;

export function sanitizeHandoffText(raw: string): HandoffText {
    return raw
        .replaceAll(LONE_SURROGATE, '\u{FFFD}')
        .replaceAll(FORMAT_OR_DEFAULT_IGNORABLE, '')
        .replaceAll(LINE_BREAK_OR_SPACE, ' ')
        .replaceAll(CONTROL, '')
        .replaceAll(WHITESPACE_RUN, ' ')
        .trim() as HandoffText;
}
