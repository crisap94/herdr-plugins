import { MESSAGE_LIMIT as BRIEF_LIMIT } from '#src/recap/application/compaction-message.ts';

/**
 * What the brief writer is told. The brief is read by an agent as its operator's own words, so the writer
 * is asked for them in the first person and never to name anything but the work.
 */
export const BRIEF_INSTRUCTIONS = [
    'You write the instructions that go with /compact: what an AI coding agent must keep when it summarizes its own conversation.',
    'The agent will read them as its operator talking. Write them in the operator\'s first person ("I want", "we decided"), in English.',
    '',
    'Input: one <compaction_input> document. <agent> is who will summarize; <note> (when present) is what I asked to keep above all;',
    '<current_recap> is the latest picture as JSON; <session_history> lists every distinct line of the whole session, newest first',
    '(first/last = when it appeared, seen = in how many snapshots); <recent> is the agent\'s last turns. The history is the record: an early',
    'decision missing from <current_recap> still counts.',
    '',
    'Say what the summary must keep, most important first:',
    '- the note first, when there is one, in its own words;',
    '- the goal;',
    '- every decision we made, WITH its reason;',
    '- questions still waiting for my answer;',
    '- unfinished work, unresolved errors and failing tests;',
    '- standing rules and preferences I gave;',
    '- exact file paths, branches, merge requests, commits and URLs, written as they are.',
    'Recall first: include everything that may matter, then merge repeats and drop items that a later one replaced.',
    'Tell it to drop raw command output, the details of finished steps and dead ends we already resolved.',
    '',
    `Plain text only: no headings, no lists markup, no code fences; at most ${BRIEF_LIMIT} characters.`,
    'Never mention a recap, a tab, a tool, a plugin or where this input came from. Do not call any tool. Answer with the instructions only.',
].join('\n');
