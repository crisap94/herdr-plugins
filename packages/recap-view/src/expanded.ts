import type { ExpandedTask, TextExpandedView } from './model.ts';
import { assertCount } from './wording.ts';
import { regionsOf, session } from './expanded-regions.ts';
import type { Draw, RegionId } from './expanded-regions.ts';
import { coloured, visibleLength, wrap } from './wrap.ts';
import type { Style } from './wrap.ts';

export const EXPANDED_TWO_COLUMNS = 140;
const GUTTER = 3;

const ONE_COLUMN: readonly RegionId[] = ['head', 'goal', 'now', 'needs', 'decisions', 'timeline', 'next', 'rules', 'links'];
const LEFT: readonly RegionId[] = ['head', 'goal', 'now', 'needs', 'timeline'];
const RIGHT: readonly RegionId[] = ['decisions', 'next', 'rules', 'links'];

export const columnWidth = (width: number): number => Math.floor((width - GUTTER) / 2);

function stacked(regions: Readonly<Partial<Record<RegionId, readonly string[]>>>, order: readonly RegionId[]): readonly string[] {
    return order.map((id) => regions[id] ?? []).filter((lines) => lines.length > 0).reduce<string[]>((all, lines) => all.concat(all.length > 0 ? [''] : [], lines), []);
}

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

export function expanded(view: TextExpandedView): readonly string[] {
    const style = view.style ?? coloured;
    const wide = view.width >= EXPANDED_TWO_COLUMNS;
    const draw: Draw = { width: wide ? columnWidth(view.width) : view.width, style, wording: view.wording, now: view.now, zone: view.zone, webs: view.webs, breaks: view.breaks ?? [] };
    const facts = session(view.session, draw);
    const lastAt = view.tasks.length - 1;
    const blocks = view.tasks.map((task, at) => {
        const number = at + 1;
        assertCount(number);
        const heading = view.tasks.length > 1 ? [style.bold(style.cyan(`▌ ${task.name === '' ? view.wording.taskNumber(number) : task.name}`)), ''] : [];
        const lines = taskLines(task, draw, wide, at === lastAt ? facts : []);
        return heading.concat(wide || at < lastAt ? lines : lines.concat(lines.length > 0 && facts.length > 0 ? [''] : [], facts));
    });
    const body = blocks.reduce<string[]>((all, block) => all.concat(all.length > 0 ? [''] : [], block), []);
    if (view.tasks.length === 0) {
        return [...wrap(view.wording.noRecapYet, view.width).map(style.gray), ...(facts.length > 0 ? ['', ...facts] : [])];
    }
    return body;
}
