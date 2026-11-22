import type { Messages } from '#src/i18n/messages.ts';
import { must } from '#src/protocol/result.ts';
import type { Count } from '#src/recap/domain/count.ts';
import { parseText, type Text } from '#src/recap/domain/text.ts';
import type { NoteState } from '#src/recap/application/compact-keys.ts';
import { coloured, visibleLength, wrap } from '@stateforge-labs/recap-view/unstable/wrap.ts';
import type { Style } from '@stateforge-labs/recap-view/unstable/wrap.ts';

export function compactViewText(state: NoteState, m: Messages, agent: Text, width: Count, style: Style = coloured): readonly Text[] {
    return [
        must(parseText(style.bold(style.cyan(m.compaction.title(agent))))),
        must(parseText('')),
        must(parseText(style.dim(m.compaction.noteLabel))),
        ...wrap(`${state.note}█`, width).map((line) => must(parseText(style.bold(line)))),
    ];
}

export function compactFooterText(m: Messages, width: Count, style: Style = coloured): Text {
    return must(parseText(style.gray(m.compaction.keys.find((hint) => visibleLength(hint) <= width) ?? '')));
}
