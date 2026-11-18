import { said } from './item-gate.ts';
import type { Gate } from './item-gate.ts';
import { hasReference } from './legacy.ts';
import type { Outcome } from './legacy.ts';

export const unresolved: Gate = {
    id: 'G4',
    check: (item, context): Outcome | null => (item.section !== 'links' || hasReference(item.text) ? null : {
        kind: 'flag', gate: 'G4',
        reason: said(context.language, 'not a reference (!n, #n, a commit SHA, name/with-slash, a path, a file name or a URL): kept, drawn without a hyperlink', 'no es una referencia (!n, #n, un SHA, nombre/con/barra, una ruta, un archivo o una URL): se conserva, sin hipervínculo'),
    }),
};

export { hasReference } from './legacy.ts';
