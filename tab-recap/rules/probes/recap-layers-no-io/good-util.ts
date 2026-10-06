import { stripVTControlCharacters, styleText } from 'node:util';

export const plain = (text: string): string => stripVTControlCharacters(styleText('bold', text, { validateStream: false }));
