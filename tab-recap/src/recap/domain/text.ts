import { err, ok, type Result } from '#src/protocol/result.ts';
import { brand, type Brand } from './brand.ts';
import type { ParseFailure } from './parse-failure.ts';

export type Text = Brand<string, 'Text'>;
export type NonEmptyText = Brand<string, 'NonEmptyText'>;

export function parseText(input: unknown): Result<Text, ParseFailure> {
    if (typeof input !== 'string') {
        return err({ kind: 'not-a-string' });
    }
    return ok(brand<string, 'Text'>(input));
}

export function parseNonEmptyText(input: unknown): Result<NonEmptyText, ParseFailure> {
    const text = parseText(input);
    if (text.kind === 'err') {
        return text;
    }
    if (text.value.trim() === '') {
        return err({ kind: 'empty' });
    }
    return ok(brand<string, 'NonEmptyText'>(text.value));
}
