import { textOf, type Text } from '../text.ts';
import { brand, type Brand } from '../brand.ts';
import { said } from './item-gate.ts';
import type { Gate, Outcome } from './item-gate.ts';

export type Referenced = Brand<boolean, 'Referenced'>;

const REFERENCE = [
    /^[!#]\d+$/u,
    /^[0-9a-f]{7,40}$/iu,
    /^https?:\/\/\S+$/iu,
    /^(?:main|master|develop|trunk|HEAD)$/u,
    /^[\p{L}\p{N}_.@~-]*\/[\p{L}\p{N}_./@~-]+$/u,
    /^[\p{L}\p{N}_-]+(?:\.[\p{L}\p{N}_-]+)*\.[A-Za-z][A-Za-z0-9]{0,7}$/u,
];

const bare = (token: Text): Text => textOf(token.replaceAll('`', '').replace(/^[("'[]+|[)"'\],;:]+$/gu, '').replace(/(?<=[^.])\.$/u, ''));

export const hasReference = (text: Text): Referenced => brand<boolean, 'Referenced'>(text.split(/\s+/u).map((token) => bare(textOf(token))).some((token) => REFERENCE.some((form) => form.test(token))));

export const unresolved: Gate = {
    id: 'G4',
    check: (item, context): Outcome | null => (item.section !== 'links' || hasReference(item.text) ? null : {
        kind: 'flag', gate: 'G4',
        reason: said(context.language, textOf('not a reference (!n, #n, a commit SHA, name/with-slash, a path, a file name or a URL): kept, drawn without a hyperlink'), textOf('no es una referencia (!n, #n, un SHA, nombre/con/barra, una ruta, un archivo o una URL): se conserva, sin hipervínculo')),
    }),
};
