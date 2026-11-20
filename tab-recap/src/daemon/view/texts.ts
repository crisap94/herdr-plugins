import type { Locale } from '#src/i18n/messages.ts';
import { DEFAULT_TEXTS, type StatusTexts } from '#src/wire/view/protocol.ts';

const SPANISH: StatusTexts = {
    connecting: 'Conectando con el daemon de recap…',
    down: 'El daemon de recap no está en marcha.',
    downHint: 'Ejecuta tab-recap status para ver el motivo.',
    mismatch: 'Este panel y el daemon de recap usan protocolos distintos.',
};

export function viewTexts(locale: Locale): StatusTexts {
    return locale === 'es' ? SPANISH : DEFAULT_TEXTS;
}
