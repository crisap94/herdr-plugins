// `TAB_RECAP_HERDR_EVENTS`: whether tab-recap shares its lanes on herdr's event stream (lane tokens, compaction answers).
// Off by default: a fresh install writes no token and answers no request.
export type HerdrEvents = 'off' | 'on';

export const herdrEventsOf = (raw: string | undefined): HerdrEvents => (raw?.trim().toLowerCase() === 'on' ? 'on' : 'off');
