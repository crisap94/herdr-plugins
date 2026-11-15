import { join } from 'node:path';
import type { Item, JudgeCriterion, JudgeView } from '../lib/types.ts';
import { JUDGE_CRITERIA as BRIEF_CRITERIA } from '../compaction-brief/judge-criteria.ts';
import { loadItems as loadBrief, type BriefItem } from '../compaction-brief/prompt.ts';
import { grade as briefGrade, view as briefView } from '../compaction-brief/scoring.ts';
import { JUDGE_CRITERIA as STORY_CRITERIA, judgeView as storyView } from '../curator-story/judge-criteria.ts';
import { loadItems as loadStory, type StoryItem } from '../curator-story/prompt.ts';
import { grade as storyGrade } from '../curator-story/scoring.ts';
import { JUDGE_CRITERIA as RECONCILE_CRITERIA } from '../curator-reconcile/judge-criteria.ts';
import { loadItems as loadReconcile, type ReconcileItem } from '../curator-reconcile/prompt.ts';
import { grade as reconcileGrade, judgeView as reconcileView } from '../curator-reconcile/scoring.ts';
import { JUDGE_CRITERIA as WRITER_CRITERIA } from '../writer/judge-criteria.ts';
import { loadItems as loadWriter, type WriterItem } from '../writer/prompt.ts';
import { grade as writerGrade, judgeApplies as writerApplies, view as writerView } from '../writer/scoring.ts';

export type Expect = 'fail' | 'pass' | 'open';

export interface Row {
    readonly id: string;
    readonly eval: string;
    readonly source: string;
    readonly answer: string;
    readonly breach: string | null;
    readonly expected: Readonly<Record<string, Expect>>;
    readonly evidence: string;
}

export type Judgeable = { readonly ok: true; readonly view: JudgeView } | { readonly ok: false; readonly reason: string };

export interface Sibling {
    readonly eval: string;
    readonly criteria: readonly JudgeCriterion[];
    readonly items: ReadonlyMap<string, Item<unknown, unknown>>;
    readonly judge: (item: Item<unknown, unknown>, text: string) => Judgeable;
    readonly applies: (item: Item<unknown, unknown>, text: string) => ReadonlySet<string>;
}

const NOT_PARSED = 'the answer does not parse';

const indexed = (items: readonly Item<unknown, unknown>[]): Map<string, Item<unknown, unknown>> => new Map(items.map((item) => [item.id, item]));

function writerJudge(item: Item<unknown, unknown>, text: string): Judgeable {
    const writer = item as WriterItem;
    if (!writerGrade(writer, text).parsed) return { ok: false, reason: NOT_PARSED };
    const on = writerApplies(writer, text);
    if (on === null || !Object.values(on).some(Boolean)) return { ok: false, reason: 'no judge criterion applies to this answer' };
    return { ok: true, view: writerView(writer, text) };
}

function storyJudge(item: Item<unknown, unknown>, text: string): Judgeable {
    const story = item as StoryItem;
    if (!storyGrade(story, text).parsed) return { ok: false, reason: NOT_PARSED };
    return { ok: true, view: storyView(story, text) };
}

function reconcileJudge(item: Item<unknown, unknown>, text: string): Judgeable {
    const reconcile = item as ReconcileItem;
    if (!reconcileGrade(reconcile, text).parsed) return { ok: false, reason: NOT_PARSED };
    return { ok: true, view: reconcileView(reconcile, text) };
}

function briefJudge(item: Item<unknown, unknown>, text: string): Judgeable {
    const brief = item as BriefItem;
    if (!briefGrade(brief, text).parsed) return { ok: false, reason: NOT_PARSED };
    return { ok: true, view: briefView(brief, text) };
}

function writerApplicable(item: Item<unknown, unknown>, text: string): ReadonlySet<string> {
    const on = writerApplies(item as WriterItem, text) ?? {};
    return new Set(Object.keys(on).filter((id) => on[id] === true));
}

const allOf = (criteria: readonly JudgeCriterion[]) => (): ReadonlySet<string> => new Set(criteria.map((criterion) => criterion.id));

export function loadSiblings(root: string): Map<string, Sibling> {
    const siblings: Sibling[] = [
        { eval: 'writer', criteria: WRITER_CRITERIA, items: indexed(loadWriter(join(root, 'writer', 'dataset.jsonl'))), judge: writerJudge, applies: writerApplicable },
        { eval: 'curator-story', criteria: STORY_CRITERIA, items: indexed(loadStory()), judge: storyJudge, applies: allOf(STORY_CRITERIA) },
        { eval: 'curator-reconcile', criteria: RECONCILE_CRITERIA, items: indexed(loadReconcile(join(root, 'curator-reconcile', 'dataset.jsonl'))), judge: reconcileJudge, applies: allOf(RECONCILE_CRITERIA) },
        { eval: 'compaction-brief', criteria: BRIEF_CRITERIA, items: indexed(loadBrief(join(root, 'compaction-brief', 'dataset.jsonl'))), judge: briefJudge, applies: allOf(BRIEF_CRITERIA) },
    ];
    return new Map(siblings.map((sibling) => [sibling.eval, sibling]));
}

export function criteriaIds(siblings: ReadonlyMap<string, Sibling>): { readonly id: string; readonly eval: string }[] {
    return [...siblings.values()].flatMap((sibling) => sibling.criteria.map((criterion) => ({ id: criterion.id, eval: sibling.eval })));
}
