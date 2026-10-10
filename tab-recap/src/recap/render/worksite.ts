import { fits, type ByteBudget } from '#src/recap/domain/byte-budget.ts';
import { plainText } from '#src/recap/domain/coordination.ts';
import type { WorksiteFacts, WorksiteSnapshot } from '#src/recap/domain/worksite.ts';

export const WORKSITE_UNAVAILABLE = 'worksite unavailable';

const encoder = new TextEncoder();

const bytesOf = (text: string): number => encoder.encode(text).byteLength;

function linesOf(facts: WorksiteFacts): string {
    const lines = ['## Worksite', `- directory: ${plainText(facts.directory)}`];
    if (facts.repository !== null) {
        const branch = facts.repository.branch === null ? '' : ` (branch ${plainText(facts.repository.branch)})`;
        lines.push(`- repository: ${plainText(facts.repository.root)}${branch}`);
    }
    if (facts.lastCommit !== null) {
        lines.push(`- last commit: ${plainText(facts.lastCommit.hash)} ${plainText(facts.lastCommit.subject)}`);
    }
    if (facts.uncommitted !== null) {
        lines.push(`- ${facts.uncommitted.count} uncommitted paths`);
        lines.push(...facts.uncommitted.paths.map((path) => `  - ${plainText(path)}`));
    }
    if (facts.edited.length > 0) {
        lines.push('- most edited files:');
        lines.push(...facts.edited.map((file) => `  - ${plainText(file.path)} (${file.edits} edits)`));
    }
    if (facts.tokens.length > 0) {
        lines.push(`- tokens: ${facts.tokens.map(plainText).join(', ')}`);
    }
    return lines.join('\n');
}

function* shrinking(facts: WorksiteFacts): Generator<WorksiteFacts> {
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

function largestFitting(max: number, fitsAt: (kept: number) => boolean): number {
    let low = 0;
    let high = max;
    while (low < high) {
        const mid = Math.ceil((low + high) / 2);
        if (fitsAt(mid)) {
            low = mid;
        } else {
            high = mid - 1;
        }
    }
    return low;
}

function cutToBytes(text: string, budget: ByteBudget): string {
    const points = Array.from(text);
    const kept = largestFitting(points.length, (count) => fits(budget, bytesOf(points.slice(0, count).join(''))));
    return points.slice(0, kept).join('');
}

function withSubjectCut(bare: WorksiteFacts, budget: ByteBudget): string {
    if (bare.lastCommit === null) {
        return linesOf(bare);
    }
    const { hash, subject } = bare.lastCommit;
    const points = Array.from(subject);
    const cutAt = (count: number): WorksiteFacts => ({ ...bare, lastCommit: { hash, subject: points.slice(0, count).join('') } });
    const kept = largestFitting(points.length, (count) => fits(budget, bytesOf(linesOf(cutAt(count)))));
    return linesOf(cutAt(kept));
}

export function worksiteTextOf(snapshot: WorksiteSnapshot, budget: ByteBudget): string {
    if (snapshot.kind === 'unavailable') {
        return WORKSITE_UNAVAILABLE;
    }
    for (const candidate of shrinking(snapshot)) {
        const text = linesOf(candidate);
        if (fits(budget, bytesOf(text))) {
            return text;
        }
    }
    const bare = { ...snapshot, tokens: [], edited: [], uncommitted: snapshot.uncommitted === null ? null : { count: snapshot.uncommitted.count, paths: [] } };
    const subjectCut = withSubjectCut(bare, budget);
    return fits(budget, bytesOf(subjectCut)) ? subjectCut : cutToBytes(subjectCut, budget);
}
