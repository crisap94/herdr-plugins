import { countOf } from '@stateforge-labs/session-ledger';
import type { ChaptersWording, Wording, Words, WordsOrNull } from '@stateforge-labs/recap-view';
import type { Catalog, ChaptersMessages } from '#src/i18n/messages.ts';
import { must } from '@stateforge-labs/session-ledger';
import { parseText, type Text, type TextOrNull } from '@stateforge-labs/session-ledger';

const text = (said: Words): Text => must(parseText(said));

const textOrNull = (said: WordsOrNull): TextOrNull => (said === null ? null : text(said));

const WORDINGS = new WeakMap<Catalog, Wording<Text>>();

const CHAPTERS = new WeakMap<ChaptersMessages, ChaptersWording<Text>>();

export function chaptersWordingOf(chapters: ChaptersMessages): ChaptersWording<Text> {
    const known = CHAPTERS.get(chapters);
    if (known !== undefined) {
        return known;
    }
    const made: ChaptersWording<Text> = {
        label: chapters.label,
        count: (found) => chapters.count(countOf(found)),
        compacted: chapters.compacted,
        newSession: chapters.newSession,
        seconds: (seconds) => chapters.seconds(countOf(seconds)),
        minutes: (minutes, seconds) => chapters.minutes(countOf(minutes), countOf(seconds)),
    };
    CHAPTERS.set(chapters, made);
    return made;
}

export function wordingOf(catalog: Catalog): Wording<Text> {
    const known = WORDINGS.get(catalog);
    if (known !== undefined) {
        return known;
    }
    const { compaction, expanded } = catalog;
    const stage = compaction.stage;
    const made: Wording<Text> = {
        locale: catalog.locale,
        badge: catalog.badge,
        waitingForAgent: catalog.waitingForAgent,
        fromScreen: catalog.fromScreen,
        recapTitle: catalog.recapTitle,
        taskNumber: (n) => catalog.taskNumber(countOf(n)),
        updating: catalog.updating,
        daemonStale: (daemon) => catalog.daemonStale(textOrNull(daemon)),
        claudeOwn: catalog.claudeOwn,
        noRecapYet: catalog.noRecapYet,
        noRecapShort: catalog.noRecapShort,
        allDoneShort: catalog.allDoneShort,
        recapError: (error) => catalog.recapError(text(error)),
        needsYou: (what) => catalog.needsYou(text(what)),
        ago: (amount, unit) => catalog.ago(countOf(amount), unit),
        hints: catalog.hints,
        compaction: {
            hint: (percent, window) => compaction.hint(countOf(percent), text(window)),
            stage: {
                queued: (agent, clock) => stage.queued(textOrNull(agent), text(clock)),
                briefing: (agent, writer, clock) => stage.briefing(textOrNull(agent), textOrNull(writer), text(clock)),
                compacting: (agent, clock) => stage.compacting(textOrNull(agent), text(clock)),
                restoring: (agent) => stage.restoring(textOrNull(agent)),
                compacted: (agent, figures) => stage.compacted(textOrNull(agent), text(figures)),
                template: stage.template,
                failed: (agent, why) => stage.failed(textOrNull(agent), textOrNull(why)),
                unconfirmed: (agent, why) => stage.unconfirmed(textOrNull(agent), textOrNull(why)),
                skipped: (agent, why) => stage.skipped(textOrNull(agent), textOrNull(why)),
                tokens: (before, after) => stage.tokens(text(before), text(after)),
                took: (seconds) => stage.took(countOf(seconds)),
            },
        },
        expanded: {
            ...expanded,
            waiting: (amount, unit) => expanded.waiting(countOf(amount), unit),
            compactionOrigin: {
                operator: (count) => expanded.compactionOrigin.operator(countOf(count)),
                auto: (count) => expanded.compactionOrigin.auto(countOf(count)),
            },
            autocompact: {
                label: expanded.autocompact.label,
                text: (decisions, compacted, waited) => expanded.autocompact.text(countOf(decisions), countOf(compacted), countOf(waited)),
            },
        },
        chapters: chaptersWordingOf(catalog.chapters),
    };
    WORDINGS.set(catalog, made);
    return made;
}
