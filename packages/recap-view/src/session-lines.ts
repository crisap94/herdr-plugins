import { sizeOf } from '@stateforge-labs/session-ledger';
import type { SessionRecap } from './model.ts';
import { assertCount } from './wording.ts';
import type { TextWording } from './wording.ts';
import { clockOf, dayOf } from './timeline.ts';
import { countOf } from '@stateforge-labs/session-ledger';

const MINUTE = 60_000;

export function spanOf(ms: number): string {
    const minutes = Math.floor(ms / MINUTE);
    const [days, hours, rest] = [Math.floor(minutes / 1440), Math.floor((minutes % 1440) / 60), minutes % 60];
    if (days > 0) {
        return hours > 0 ? `${days} d ${hours} h` : `${days} d`;
    }
    if (hours > 0) {
        return rest > 0 ? `${hours} h ${rest} min` : `${hours} h`;
    }
    return `${rest} min`;
}

export interface SessionContext {
    readonly now: number;
    readonly zone: string;
    readonly wording: TextWording;
}

const joined = (parts: readonly string[]): string => parts.join(' · ');

function chapterLines(facts: SessionRecap, context: SessionContext): readonly { readonly label: string; readonly text: string }[] {
    const { compactions, chapters } = facts;
    const count: string[] = [];
    if (chapters !== null) {
        assertCount(chapters);
        count.push(context.wording.chapters.count(chapters));
    }
    if (compactions === null) {
        return chapters === null ? [] : [{ label: context.wording.chapters.label, text: String(chapters) }];
    }
    const { byOrigin } = compactions;
    const origin = context.wording.expanded.compactionOrigin;
    const { operator, auto } = byOrigin;
    assertCount(operator);
    assertCount(auto);
    const origins = joined([...(operator > 0 ? [origin.operator(operator)] : []), ...(auto > 0 ? [origin.auto(auto)] : [])]);
    const counted = origins === '' ? String(compactions.count) : `${compactions.count} (${origins})`;
    const pairs = joined(compactions.measured.map((pair) => `${sizeOf(countOf(pair.before))} → ${sizeOf(countOf(pair.after))}`));
    return [{ label: context.wording.expanded.compactions, text: joined([pairs === '' ? counted : `${counted} (${pairs})`, ...count]) }];
}

export function sessionLines(facts: SessionRecap, context: SessionContext): readonly { readonly label: string; readonly text: string }[] {
    const m = context.wording.expanded;
    const lines: { label: string; text: string }[] = [];
    const { started, runs, repo } = facts;
    if (started !== null) {
        const day = dayOf(started.at, context.zone) === dayOf(context.now, context.zone) ? '' : `${dayOf(started.at, context.zone)} `;
        lines.push({ label: m.started, text: joined([`${day}${clockOf(started.at, context.zone)}`, spanOf(started.forMs)]) });
    }
    if (runs !== null) {
        lines.push({ label: m.turns, text: `${runs.total} (${joined(runs.byCause.map((entry) => `${m.causes[entry.cause]} ${entry.count}`))})` });
    }
    lines.push(...chapterLines(facts, context));
    lines.push(...facts.agents.map((agent) => ({ label: agent.label, text: `${agent.share} % ${m.of} ${sizeOf(countOf(agent.window))}` })));
    if (repo !== null) {
        lines.push({ label: m.repo, text: joined([repo.name, ...(repo.branch === null ? [] : [`${m.branch} ${repo.branch}`])]) });
    }
    if (facts.files.length > 0) {
        lines.push({ label: m.files, text: facts.files.map((file) => `${file.path} (${file.count})`).join(', ') });
    }
    if (facts.autocompact !== null) {
        const { decisions, compacted, waited } = facts.autocompact;
        assertCount(decisions);
        assertCount(compacted);
        assertCount(waited);
        lines.push({ label: m.autocompact.label, text: m.autocompact.text(decisions, compacted, waited) });
    }
    return lines;
}
