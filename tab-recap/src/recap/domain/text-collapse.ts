export type ControlPolicy = 'remove' | 'space';

const CONTROL = /\p{Cc}/gu;

const controlAs = (policy: ControlPolicy, char: string): string => {
    if (policy === 'space') return ' ';
    return /\s/u.test(char) ? ' ' : '';
};

export function collapsedText(text: string, controls: ControlPolicy): string {
    return text.replaceAll(CONTROL, (char) => controlAs(controls, char)).replaceAll(/\s+/gu, ' ').trim();
}
