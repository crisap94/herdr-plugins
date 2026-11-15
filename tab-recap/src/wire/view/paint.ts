import type { Role } from './protocol.ts';

const ESC = '\u001B';
const BEL = '\u0007';
const RESET_SGR = `${ESC}[0m`;
const TITLE_OSC = `${ESC}]2;`;
const SCREEN_ON = `${ESC}[?1049h${ESC}[?25l`;
const SCREEN_OFF = `${ESC}[?25h${ESC}[?1049l`;
const MOUSE_ON = `${ESC}[?1000h${ESC}[?1006h`;
const MOUSE_OFF = `${ESC}[?1000l${ESC}[?1006l`;
const FRAME_HOME = `${ESC}[H`;
const LINE_END = `${ESC}[K`;
const FRAME_END = `${ESC}[J`;

export const ENTER = (role: Role, title: string): string =>
    `${SCREEN_ON}${role === 'modal' ? '' : MOUSE_ON}${TITLE_OSC}${title}${BEL}`;

export const LEAVE: string = `${MOUSE_OFF}${SCREEN_OFF}`;

export function paintOf(title: string, lines: readonly string[], colour: boolean): string {
    const reset = colour ? RESET_SGR : '';
    const frame = lines.map((line) => ` ${line}${reset}${LINE_END}`).join('\r\n');
    return `${TITLE_OSC}${title}${BEL}${FRAME_HOME}${frame}${FRAME_END}`;
}
