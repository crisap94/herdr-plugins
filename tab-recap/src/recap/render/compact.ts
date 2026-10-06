// The compaction popup as lines of text. Pure; every word comes from Messages.
import type { Messages } from '#src/i18n/messages.ts';
import type { NoteState } from '#src/recap/application/compact-keys.ts';
import { coloured, visibleLength, wrap } from './wrap.ts';
import type { Style } from './wrap.ts';

/** The popup: its title, the question, the note being typed (with a cursor), then a blank line. */
export function compactView(state: NoteState, m: Messages, agent: string, width: number, style: Style = coloured): string[] {
    return [
        style.bold(style.cyan(m.compaction.title(agent))),
        '',
        style.dim(m.compaction.noteLabel),
        ...wrap(`${state.note}█`, width).map(style.bold),
    ];
}

/** The longest hint that fits: a cut-off hint reads as a bug. */
export function compactFooter(m: Messages, width: number, style: Style = coloured): string {
    return style.gray(m.compaction.keys.find((hint) => visibleLength(hint) <= width) ?? '');
}
