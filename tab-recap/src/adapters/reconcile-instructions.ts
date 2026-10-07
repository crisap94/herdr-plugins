/** What the writer is told more when the document holds <candidates>: its reconcile step. Lines to put among the writer's instructions. */
export const RECONCILE_LINES: readonly string[] = [
    '<candidates> lists what an earlier pass read in the new turns: each <candidate> has a section, a text and the anchor it came from (a piece',
    'of the input, copied), and often a why, a reference, a time and an agent. flagged="yes" means a commit, an edit, an error or a question',
    'that the pass left unfilled: add it when it is a fact worth keeping, worded as one.',
    'Reconcile the candidates with the ledger:',
    '- a new fact is added ONLY from a candidate: copy its anchor into "anchor" (never a paraphrase), its time into "at" and its agent into "agent".',
    '  You may reword the text and fix the section. Never add a fact that has no candidate.',
    '- a candidate that says what an open fact already says: leave it, or update that fact when it adds a detail. Never add it again.',
    '- look at EVERY open fact against the new turns: finished -> close "done", turned out wrong -> "wrong", replaced -> "superseded",',
    '  a question the operator answered -> "answered" (only a "needs" fact is ever answered); changed -> update it.',
    '- <transcript> is only context here, clipped to its newest turns.',
];
