// The session facts as the lines the expanded view draws, in the interface language. Pure.
import { sizeOf } from '#src/recap/domain/compaction.ts';
import type { SessionFacts } from '#src/recap/domain/session-facts.ts';
import type { Messages } from '#src/i18n/messages.ts';
import { clockOf, dayOf } from './timeline.ts';

const MINUTE = 60_000;

/** `6 h 12 min`, `2 d 3 h`, `5 min`; under a minute reads as `0 min`. */
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
    readonly messages: Messages;
}

const joined = (parts: readonly string[]): string => parts.join(' · ');

/** `compactions 2 (800k → 14k · 39k → 3k) · chapters 3`; the chapter count alone when the session broke without a compaction. */
function chapterLines(facts: SessionFacts, context: SessionContext): readonly { readonly label: string; readonly text: string }[] {
    const { compactions, chapters } = facts;
    const count = chapters === null ? [] : [context.messages.chapters.count(chapters)];
    if (compactions === null) {
        return chapters === null ? [] : [{ label: context.messages.chapters.label, text: String(chapters) }];
    }
    const pairs = joined(compactions.measured.map((pair) => `${sizeOf(pair.before)} → ${sizeOf(pair.after)}`));
    return [{ label: context.messages.expanded.compactions, text: joined([pairs === '' ? String(compactions.count) : `${compactions.count} (${pairs})`, ...count]) }];
}

/** One unwrapped line per known fact; `label` is the caller's to style. */
export function sessionLines(facts: SessionFacts, context: SessionContext): readonly { readonly label: string; readonly text: string }[] {
    const m = context.messages.expanded;
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
    lines.push(...facts.agents.map((agent) => ({ label: agent.label, text: `${agent.share} % ${m.of} ${sizeOf(agent.window)}` })));
    if (repo !== null) {
        lines.push({ label: m.repo, text: joined([repo.name, ...(repo.branch === null ? [] : [`${m.branch} ${repo.branch}`])]) });
    }
    if (facts.files.length > 0) {
        lines.push({ label: m.files, text: facts.files.map((file) => `${file.path} (${file.count})`).join(', ') });
    }
    if (facts.autocompact !== null) {
        lines.push({ label: m.autocompact.label, text: m.autocompact.text(facts.autocompact.decisions, facts.autocompact.compacted, facts.autocompact.waited) });
    }
    return lines;
}
