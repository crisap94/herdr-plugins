import { must } from '#src/protocol/result.ts';
import { textOf as asText } from '#src/recap/domain/text.ts';
import { fits, type ByteBudget } from '#src/recap/domain/byte-budget.ts';
import { brand, type Brand } from '#src/recap/domain/brand.ts';
import { parseCount, type Count } from '#src/recap/domain/count.ts';
import { cleanHandoffText } from '#src/recap/domain/handoff-sanitize.ts';
import { parseText, textOf, type Text } from '#src/recap/domain/text.ts';
import type { WorksiteFacts, WorksiteSnapshot } from '#src/recap/domain/worksite.ts';

export type WorksiteBlock = Brand<string, 'WorksiteBlock'>;

type Fit = 'fits' | 'over';

const parseWorksiteBlock = (composed: Text): WorksiteBlock => brand<string, 'WorksiteBlock'>(composed);

export const WORKSITE_UNAVAILABLE: WorksiteBlock = parseWorksiteBlock(must(parseText('worksite unavailable')));

const encoder = new TextEncoder();

const bytesOf = (text: WorksiteBlock): Count => must(parseCount(encoder.encode(text).byteLength));

const fitting = (budget: ByteBudget, text: WorksiteBlock): Fit => (fits(budget, bytesOf(text)) ? 'fits' : 'over');

function linesOf(facts: WorksiteFacts): WorksiteBlock {
    const lines = ['## Worksite', `- directory: ${cleanHandoffText(asText(facts.directory))}`];
    if (facts.repository !== null) {
        const branch = facts.repository.branch === null ? '' : ` (branch ${cleanHandoffText(asText(facts.repository.branch))})`;
        lines.push(`- repository: ${cleanHandoffText(asText(facts.repository.root))}${branch}`);
    }
    if (facts.lastCommit !== null) {
        lines.push(`- last commit: ${cleanHandoffText(asText(facts.lastCommit.hash))} ${cleanHandoffText(asText(facts.lastCommit.subject))}`);
    }
    if (facts.uncommitted !== null) {
        lines.push(`- ${facts.uncommitted.count} uncommitted paths`);
        lines.push(...facts.uncommitted.paths.map((path) => `  - ${cleanHandoffText(asText(path))}`));
    }
    if (facts.edited.length > 0) {
        lines.push('- most edited files:');
        lines.push(...facts.edited.map((file) => `  - ${cleanHandoffText(asText(file.path))} (${file.edits} edits)`));
    }
    if (facts.tokens.length > 0) {
        lines.push(`- tokens: ${facts.tokens.map((token) => cleanHandoffText(asText(token))).join(', ')}`);
    }
    return parseWorksiteBlock(must(parseText(lines.join('\n'))));
}

function* shrinking(facts: WorksiteFacts): Generator<WorksiteFacts, void, undefined> {
    yield facts;
    const untokened = { ...facts, tokens: [] };
    yield untokened;
    const bare = { ...untokened, edited: [] };
    yield bare;
    if (bare.uncommitted !== null) {
        const { count, paths } = bare.uncommitted;
        for (let shown = paths.length - 1; shown >= 0; shown -= 1) {
            yield { ...bare, uncommitted: { count, paths: paths.slice(0, shown) } };
        }
    }
}

function largestFitting(max: Count, fitsAt: (kept: Count) => Fit): Count {
    let low = 0;
    let high: number = max;
    while (low < high) {
        const mid = must(parseCount(Math.ceil((low + high) / 2)));
        if (fitsAt(mid) === 'fits') {
            low = mid;
        } else {
            high = mid - 1;
        }
    }
    return must(parseCount(low));
}

function cutToBytes(text: WorksiteBlock, budget: ByteBudget): WorksiteBlock {
    const points = Array.from(text);
    const kept = largestFitting(must(parseCount(points.length)), (count) => fitting(budget, parseWorksiteBlock(must(parseText(points.slice(0, count).join(''))))));
    return parseWorksiteBlock(must(parseText(points.slice(0, kept).join(''))));
}

function withSubjectCut(bare: WorksiteFacts, budget: ByteBudget): WorksiteBlock {
    if (bare.lastCommit === null) {
        return linesOf(bare);
    }
    const { hash, subject } = bare.lastCommit;
    const points = Array.from(subject);
    const cutAt = (count: Count): WorksiteFacts => ({ ...bare, lastCommit: { hash, subject: textOf(points.slice(0, count).join('')) } });
    const kept = largestFitting(must(parseCount(points.length)), (count) => fitting(budget, linesOf(cutAt(count))));
    return linesOf(cutAt(kept));
}

export function worksiteTextOf(snapshot: WorksiteSnapshot, budget: ByteBudget): WorksiteBlock {
    if (snapshot.kind === 'unavailable') {
        return WORKSITE_UNAVAILABLE;
    }
    for (const candidate of shrinking(snapshot)) {
        const text = linesOf(candidate);
        if (fitting(budget, text) === 'fits') {
            return text;
        }
    }
    const bare = { ...snapshot, tokens: [], edited: [], uncommitted: snapshot.uncommitted === null ? null : { count: snapshot.uncommitted.count, paths: [] } };
    const subjectCut = withSubjectCut(bare, budget);
    return fitting(budget, subjectCut) === 'fits' ? subjectCut : cutToBytes(subjectCut, budget);
}
