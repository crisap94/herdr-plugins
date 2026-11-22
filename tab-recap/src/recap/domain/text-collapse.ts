import { textOf, type Text } from './text.ts';

export type ControlPolicy = 'remove' | 'space';

const CONTROL = /\p{Cc}/gu;

const controlAs = (policy: ControlPolicy, char: Text): Text => {
    if (policy === 'space') return textOf(' ');
    return /\s/u.test(char) ? textOf(' ') : textOf('');
};

export function collapsedText(text: Text, controls: ControlPolicy): Text {
    return textOf(text.replaceAll(CONTROL, (char) => controlAs(controls, textOf(char))).replaceAll(/\s+/gu, ' ').trim());
}
