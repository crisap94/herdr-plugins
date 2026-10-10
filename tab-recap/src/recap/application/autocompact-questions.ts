import type { Noul } from '#src/ports/decider.ts';

export const QUESTIONS: Readonly<Record<string, Noul>> = {
    closes_request: {
        instructions: 'Does `last_reply` deliver what `last_prompt` asked for (done, answered, merged, reported), rather than an intermediate step? A reply that delivers it and ends by offering the operator an optional next step, or asking whether to go on, closes the request.',
        criteria: { true: 'The reply states the outcome the prompt asked for: work finished, a question answered, something published or reported; it may end with an offer of a next step or a question whether to go on.', false: 'The reply is a progress note, a plan, a partial result or an apology, and the prompt is not yet satisfied.' },
    },
    announces_continuation: {
        instructions: 'Does `last_reply` say the agent is in the middle of something or will carry on by itself (a next command, a job it waits for)? A next step that waits for the operator\'s answer does not count.',
        criteria: { true: 'The reply names a next step the agent will take by itself, or a job it is waiting for.', false: 'The reply stops: nothing is promised next, or the only next step is an offer that waits for the operator\'s answer.' },
    },
    asks_detailed_choice: {
        instructions: 'Does `last_reply` end by asking the operator to choose between options whose details exist only in `last_reply`?',
        criteria: { true: 'The reply ends with a question offering options that are described only there.', false: 'The reply asks no choice, or the options are already in the operator\'s own words.' },
    },
    needs_verbatim: {
        instructions: 'Would continuing toward `goal` with the items in `open_work` need exact material found only in `recent_turns` (error output, a diff, command output, figures)?',
        criteria: { true: 'The next steps depend on exact text that appears only in `recent_turns`.', false: 'Everything the next steps need is in `goal`, `open_work` or can be looked up again.' },
    },
    changes_subject: {
        instructions: 'Does `last_prompt` start work unrelated to `goal`?',
        criteria: { true: 'The prompt asks for something with no connection to the goal.', false: 'The prompt continues the goal, or there is no goal to compare with.' },
    },
    stuck: {
        instructions: 'Does `recent_turns` show the same step failing more than once without progress?',
        criteria: { true: 'The same command or change fails again and again with the same kind of error.', false: 'The turns show progress, or at most one failure.' },
    },
};
