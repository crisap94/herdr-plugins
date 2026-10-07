// The expanded view: the whole ledger of a tab laid out for a wide terminal — two columns from 140 cells, one below. Pure.
import type { SessionFacts } from '#src/recap/domain/session-facts.ts';
import type { Messages } from '#src/i18n/messages.ts';
import type { Break } from '#src/ports/boundaries.ts';
import type { LaneWeb } from '#src/ports/tab-views.ts';
import { regionsOf, session } from './expanded-regions.ts';
import type { Draw, RegionId, TaskData } from './expanded-regions.ts';
import { coloured, visibleLength, wrap } from './wrap.ts';
import type { Style } from './wrap.ts';

/** From this many cells the view is two columns. */
export const EXPANDED_TWO_COLUMNS = 140;
/** the gutter: a space, a gray bar, a space */
const GUTTER = 3;

export interface ExpandedTask extends TaskData {
    /** blank when the tab has one task */
    readonly name: string;
}

export interface ExpandedView {
    readonly tasks: readonly ExpandedTask[];
    readonly session: SessionFacts;
    readonly width: number;
    readonly messages: Messages;
    readonly style?: Style;
    readonly now: number;
    /** the tab's time zone (IANA) */
    readonly zone: string;
    readonly webs: readonly (LaneWeb | null | undefined)[];
    /** where the session broke, drawn in every task's timeline */
    readonly breaks?: readonly Break[];
}

const ONE_COLUMN: readonly RegionId[] = ['head', 'goal', 'now', 'needs', 'decisions', 'timeline', 'next', 'rules', 'links'];
const LEFT: readonly RegionId[] = ['head', 'goal', 'now', 'needs', 'timeline'];
const RIGHT: readonly RegionId[] = ['decisions', 'next', 'rules', 'links'];

/** The columns' width: what is left of the view after the gutter, shared. */
export const columnWidth = (width: number): number => Math.floor((width - GUTTER) / 2);

/** The regions in `order` with a blank line between them. */
function stacked(regions: Readonly<Partial<Record<RegionId, readonly string[]>>>, order: readonly RegionId[]): readonly string[] {
    return order.map((id) => regions[id] ?? []).filter((lines) => lines.length > 0).reduce<string[]>((all, lines) => all.concat(all.length > 0 ? [''] : [], lines), []);
}

/** Left and right rows side by side, the left padded to its width: rows scroll together. */
function zipped(left: readonly string[], right: readonly string[], width: number, style: Style): readonly string[] {
    const rows = Math.max(left.length, right.length);
    return Array.from({ length: rows }, (_, at) => {
        const cell = left[at] ?? '';
        return `${cell}${' '.repeat(Math.max(0, width - visibleLength(cell)))} ${style.gray('│')} ${right[at] ?? ''}`.trimEnd();
    });
}

function taskLines(task: ExpandedTask, draw: Draw, wide: boolean, tail: readonly string[]): readonly string[] {
    const regions = regionsOf(task, draw);
    if (!wide) {
        return stacked({ ...regions }, ONE_COLUMN);
    }
    return zipped(stacked({ ...regions }, LEFT), stacked({ ...regions, session: tail }, [...RIGHT, 'session']), draw.width, draw.style);
}

/** The whole expanded view, as lines to scroll. The session facts close the last task; with none, they stand alone. */
export function expanded(view: ExpandedView): readonly string[] {
    const style = view.style ?? coloured;
    const wide = view.width >= EXPANDED_TWO_COLUMNS;
    const draw: Draw = { width: wide ? columnWidth(view.width) : view.width, style, messages: view.messages, now: view.now, zone: view.zone, webs: view.webs, breaks: view.breaks ?? [] };
    const facts = session(view.session, draw);
    const lastAt = view.tasks.length - 1;
    const blocks = view.tasks.map((task, at) => {
        const heading = view.tasks.length > 1 ? [style.bold(style.cyan(`▌ ${task.name === '' ? view.messages.taskNumber(at + 1) : task.name}`)), ''] : [];
        const lines = taskLines(task, draw, wide, at === lastAt ? facts : []);
        return heading.concat(wide || at < lastAt ? lines : lines.concat(lines.length > 0 && facts.length > 0 ? [''] : [], facts));
    });
    const body = blocks.reduce<string[]>((all, block) => all.concat(all.length > 0 ? [''] : [], block), []);
    if (view.tasks.length === 0) {
        return [...wrap(view.messages.noRecapYet, view.width).map(style.gray), ...(facts.length > 0 ? ['', ...facts] : [])];
    }
    return body;
}
