import { readPaneSession } from './herdr-fleet.ts';
import { desktopFrontend } from './desktop-frontend.ts';
import type { Fleet } from '#src/ports/fleet.ts';
import type { Frontend } from '#src/ports/frontend.ts';
import type { Store } from './db/database.ts';

export function frontendFor(tui: () => Fleet): Frontend {
    if (process.env['TAB_RECAP_FRONTEND'] === 'gui') {
        return desktopFrontend();
    }
    return { fleet: tui(), session: readPaneSession, wrap: (store): Store => store };
}
