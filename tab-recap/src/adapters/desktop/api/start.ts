import { must } from '#src/protocol/result.ts';
import { parseNonEmptyText, type NonEmptyText } from '#src/recap/domain/text.ts';
import { API_ENV, API_OFF } from '../constants.ts';
import { DesktopApi } from './server.ts';
import type { ApiContext } from './call.ts';

async function report(api: DesktopApi, log: (line: NonEmptyText) => void): Promise<void> {
    const started = await api.listen();
    if (started.kind === 'err') { log(must(parseNonEmptyText(`api: not started: ${started.error}`))); }
}

export function startDesktopApi(context: ApiContext, log: (line: NonEmptyText) => void): DesktopApi | null {
    if (process.env[API_ENV] === API_OFF) { return null; }
    const api = new DesktopApi(context, log);
    void report(api, log);
    return api;
}
