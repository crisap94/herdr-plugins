import { openCliStore } from '#src/daemon/cli-store.ts';
import { HerdrFleet } from '#src/adapters/herdr/fleet.ts';
import { styleFor } from '#src/adapters/os/terminal-style.ts';
import { loadConfig, stateDir } from '#src/daemon/config.ts';
import { messagesFor } from '#src/i18n/index.ts';
import { EMPTY_NOTE, step } from '#src/recap/application/compact-keys.ts';
import type { NoteEffect, NoteState } from '#src/recap/application/compact-keys.ts';
import { compactFooter, compactView } from '#src/recap/render/compact.ts';
import { coloured } from '#src/recap/render/wrap.ts';
import { BEL, FRAME_END, FRAME_HOME, LINE_END, RESET_SGR, SCREEN_OFF, SCREEN_ON, TITLE_OSC } from '#src/adapters/os/tui.ts';
import { isUnknown } from '#src/ports/unknowable.ts';

const style = styleFor(process.stdout);
const RESET = style === coloured ? RESET_SGR : '';
const GUTTER = 2;
const TITLE = 'tab-recap:compact';

const tab = process.env['TAB_RECAP_TAB'] ?? '';
const pane = process.env['TAB_RECAP_PANE'] ?? '';
const messages = messagesFor(loadConfig().locale);
let state: NoteState = EMPTY_NOTE;
let agent = 'agent';

function draw(): void {
    const width = Math.max(10, (process.stdout.columns || 40) - GUTTER);
    const lines = [...compactView(state, messages, agent, width, style), '', compactFooter(messages, width, style)];
    process.stdout.write(`${FRAME_HOME}${lines.map((line) => ` ${line}${RESET}${LINE_END}`).join('\r\n')}${FRAME_END}`);
}

function perform(effect: NoteEffect): never {
    if (effect.kind === 'send') {
        const store = openCliStore();
        if (store.kind === 'ready') {
            store.requests.requestCompact({ tab, pane: pane === '' ? null : pane, note: effect.note });
            store.close();
        }
    }
    return process.exit(0);
}

process.stdout.write(`${SCREEN_ON}${TITLE_OSC}${TITLE}${BEL}`);
process.on('exit', () => { process.stdout.write(SCREEN_OFF); });
process.on('SIGTERM', () => { process.exit(0); });
process.on('SIGINT', () => { process.exit(0); });
if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (key: string) => {
        const stepped = step(state, key);
        state = stepped.state;
        if (stepped.effect !== null) {
            perform(stepped.effect);
        }
        draw();
    });
}
draw();

async function name(): Promise<void> {
    const found = await new HerdrFleet(stateDir()).agents().status(pane);
    agent = isUnknown(found) ? agent : found.agent;
    draw();
}

if (pane !== '') {
    void name();
}
