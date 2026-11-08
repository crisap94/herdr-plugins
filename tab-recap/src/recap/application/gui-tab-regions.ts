import type { Break } from '#src/ports/boundaries.ts';
import type { LaneWeb } from '#src/ports/tab-views.ts';
import { must } from '#src/protocol/result.ts';
import { breakText } from '#src/recap/render/timeline-breaks.ts';
import { clockOf, dateLines, timelineOf, type Entry } from '#src/recap/render/timeline.ts';
import type { Messages } from '#src/i18n/index.ts';
import { parseCount } from '#src/recap/domain/count.ts';
import { orElse } from '#src/recap/domain/gui-tab.ts';
import { isOpen, type Fact } from '#src/recap/domain/fact.ts';
import type { GuiBreak, GuiFact, GuiRegions, GuiStory, GuiTimelineRow } from '#src/recap/domain/gui-tab-parts.ts';
import { parseNonEmptyText, parseText, type Text } from '#src/recap/domain/text.ts';
import { duration, instant, type Duration, type Instant } from '#src/recap/domain/time.ts';
import type { Story } from '#src/ports/stories.ts';
import { spansOf } from './gui-tab-spans.ts';

type Webs = readonly (LaneWeb | null | undefined)[];

const NOT_RECORDED = '(not recorded)';

const open = (facts: readonly Fact[], section: Fact['section']): readonly Fact[] => facts.filter((fact) => fact.section === section && isOpen(fact));
const newest = (facts: readonly Fact[]): readonly Fact[] => facts.toSorted((a, b): Duration => duration(b.lastAt - a.lastAt));
const idOf = (fact: Fact): GuiFact['id'] => must(parseNonEmptyText(fact.id));
const ids = (facts: readonly Fact[]): readonly GuiFact['id'][] => facts.map(idOf);

export function regionsOf(facts: readonly Fact[]): GuiRegions {
    return {
        goal: ids(newest(open(facts, 'goal')).slice(0, 1)),
        now: ids(newest(open(facts, 'now'))),
        needs: ids(open(facts, 'needs').toSorted((a, b): Duration => duration(a.firstAt - b.firstAt))),
        decisions: ids(facts.filter((fact) => fact.section === 'decisions' && fact.closedWhy !== 'rewritten').toSorted((a, b): Duration => duration(b.firstAt - a.firstAt))),
        next: ids(newest(open(facts, 'next'))),
        rules: ids(newest(open(facts, 'rules'))),
        links: ids(newest(open(facts, 'links'))),
    };
}

export function factOf(fact: Fact, webs: Webs): GuiFact {
    return {
        id: idOf(fact), section: fact.section, text: must(parseText(fact.text)), spans: spansOf(fact, webs),
        why: fact.why === NOT_RECORDED ? null : orElse(parseText(fact.why), null),
        ref: orElse(parseText(fact.ref), null), agent: orElse(parseText(fact.agent), null),
        firstAt: instant(fact.firstAt), lastAt: instant(fact.lastAt), state: fact.state, closedWhy: fact.closedWhy,
        closedAt: fact.closedAt === null ? null : instant(fact.closedAt),
    };
}

export function breakOf(found: Break, messages: Messages): GuiBreak {
    return {
        kind: found.kind, at: instant(found.at), trigger: found.trigger, tokensBefore: orElse(parseCount(found.tokensBefore), null), tokensAfter: orElse(parseCount(found.tokensAfter), null),
        tookMs: orElse(parseCount(found.tookMs === null ? null : Math.round(found.tookMs)), null), text: must(parseText(breakText(found, messages.chapters))),
    };
}

interface Clock {
    readonly now: Instant;
    readonly zone: Text;
}

interface Row {
    readonly at: Instant;
    readonly entry: Entry | null;
    readonly broke: GuiBreak | null;
}

const rowsOf = (facts: readonly Fact[], breaks: readonly GuiBreak[]): readonly Row[] =>
    [...timelineOf(facts).map((entry): Row => ({ at: instant(entry.drawnAt), entry, broke: null })), ...breaks.map((broke): Row => ({ at: broke.at, entry: null, broke }))]
        .toSorted((a, b): Duration => duration(b.at - a.at || (a.broke === null ? 1 : -1) - (b.broke === null ? 1 : -1)));

export function timelineRowsOf(facts: readonly Fact[], breaks: readonly GuiBreak[], clock: Clock): readonly GuiTimelineRow[] {
    const rows = rowsOf(facts, breaks);
    const days = dateLines(rows.map((row) => row.at), clock.now, clock.zone);
    return rows.flatMap((row, at): readonly GuiTimelineRow[] => {
        const day = days[at];
        const shown = day === null || day === undefined ? null : must(parseText(day));
        const stamp = must(parseText(clockOf(row.at, clock.zone)));
        if (row.broke !== null) { return [{ kind: 'break', at: row.at, clock: stamp, day: shown, break: row.broke }]; }
        return row.entry === null ? [] : [{ kind: 'fact', fact: idOf(row.entry.fact), at: row.at, clock: stamp, day: shown, closed: row.entry.closed }];
    });
}

export function storyOf(story: Story | null, webs: Webs): GuiStory | null {
    return story === null ? null : { text: must(parseText(story.text)), spans: spansOf(story, webs), at: instant(story.at) };
}
