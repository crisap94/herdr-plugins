import { brand, type Brand } from '@stateforge-labs/session-ledger/unstable/recap/domain/brand.ts';
import type { ParseFailure } from '@stateforge-labs/session-ledger/unstable/recap/domain/parse-failure.ts';
import { parseText, type Text } from '@stateforge-labs/session-ledger/unstable/recap/domain/text.ts';
import { must, ok, type Result } from '#src/protocol/result.ts';

export type HandoffText = Brand<string, 'HandoffText'>;

const LONE_SURROGATE = /\p{Cs}/gu;
const FORMAT_OR_DEFAULT_IGNORABLE = /[\p{Cf}\p{Default_Ignorable_Code_Point}]/gu;
const LINE_BREAK_OR_SPACE = /[\s\u0085]+/gu;
const CONTROL = /\p{Cc}/gu;
const WHITESPACE_RUN = /\s+/gu;

export function parseHandoffText(input: unknown): Result<HandoffText, ParseFailure> {
    const text = parseText(input);
    return text.kind === 'ok' ? ok(brand<string, 'HandoffText'>(text.value)) : text;
}

export function cleanHandoffText(raw: Text): HandoffText {
    const cleaned = raw
        .replaceAll(LONE_SURROGATE, '\u{FFFD}')
        .replaceAll(FORMAT_OR_DEFAULT_IGNORABLE, '')
        .replaceAll(LINE_BREAK_OR_SPACE, ' ')
        .replaceAll(CONTROL, '')
        .replaceAll(WHITESPACE_RUN, ' ')
        .trim();
    return must(parseHandoffText(cleaned));
}
