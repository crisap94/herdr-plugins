import type { Wording } from '@stateforge-labs/recap-view';
import type { Messages } from '#src/i18n/messages.ts';
import { wordingOf } from '#src/view-model/wording.ts';

export const check = (messages: Messages): Wording<string> => wordingOf(messages);
