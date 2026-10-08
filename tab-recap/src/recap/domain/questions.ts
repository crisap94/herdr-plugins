// The six questions a recap must let a stranger answer, and the sections whose facts answer each. Pure.
import type { Section } from './fact.ts';

export interface ReadbackQuestion {
    readonly text: string;
    readonly sections: readonly Section[];
}

/** In the order they are graded as `readback-1` … `readback-6`. */
export const READBACK: readonly ReadbackQuestion[] = [
    { text: 'What is the goal?', sections: ['goal'] },
    { text: 'What has finished?', sections: ['done'] },
    { text: 'What is waiting on the operator?', sections: ['needs'] },
    { text: 'What must not be done?', sections: ['rules'] },
    { text: 'Why was the most important decision taken?', sections: ['decisions'] },
    { text: 'What is the next action?', sections: ['next'] },
];
