// G4 link: a "links" item must be a reference that resolves — `!n`, `#n`, a hex SHA of 7+ digits, name/with-slash, a path, a file name with an extension or a URL.
import { said } from './item-gate.ts';
import type { Gate } from './item-gate.ts';

const REFERENCE = [
    /^[!#]\d+$/u,
    /^[0-9a-f]{7,40}$/iu,
    /^https?:\/\/\S+$/iu,
    /^(?:main|master|develop|trunk|HEAD)$/u,
    /^[\p{L}\p{N}_.@~-]*\/[\p{L}\p{N}_./@~-]+$/u,
    /^[\p{L}\p{N}_-]+(?:\.[\p{L}\p{N}_-]+)*\.[A-Za-z][A-Za-z0-9]{0,7}$/u,
];

const bare = (token: string): string => token.replaceAll('`', '').replace(/^[("'[]+|[)"'\],;:]+$/gu, '').replace(/(?<=[^.])\.$/u, '');

/** Whether any whitespace-separated token of `text` is a reference. */
export const hasReference = (text: string): boolean => text.split(/\s+/u).map(bare).some((token) => REFERENCE.some((form) => form.test(token)));

export const unresolved: Gate = {
    id: 'G4',
    check: (item, context) => (item.section !== 'links' || hasReference(item.text) ? null : {
        kind: 'refuse', gate: 'G4',
        reason: said(context.language, 'a link is a reference: !n, #n, a commit SHA, name/with-slash, a path, a file name or a URL', 'un enlace es una referencia: !n, #n, un SHA, nombre/con/barra, una ruta, un archivo o una URL'),
    }),
};
