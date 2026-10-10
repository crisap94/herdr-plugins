import { fact } from './fact-at.ts';

export const NOW = Date.parse('2026-10-07T16:30:00Z');
const MIN = 60_000;
export const facts = [
    fact('a', 'now', 'Running the migration tests', NOW - 90 * MIN),
    fact('b', 'now', 'Running tests of the migration', NOW - 60 * MIN),
    fact('c', 'done', 'Wrote migration 007 with story columns & a request kind', NOW - 50 * MIN, { agent: 'host' }),
    fact('d', 'decisions', 'Keep the guard out of sibling modules', NOW - 30 * MIN, { why: 'an import guard cannot stop <sibling> modules' }),
    fact('e', 'next', 'Remove the old file', NOW - 20 * MIN, { state: 'closed', closedWhy: 'wrong', closedAt: NOW - 15 * MIN }),
];
