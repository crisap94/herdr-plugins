import type { RefusalWords } from '#src/host/policy.mjs';

export const SPANISH_REFUSAL: RefusalWords = {
    headline: (found, needed, path) => `tab-recap necesita Node >= ${needed}, pero este es ${found} (${path}).`,
    fix: 'Para arreglarlo:',
    install: (needed, options) => `Instala Node >= ${needed} (${options.join(' · ')}).`,
    steps: {
        brew: () => 'brew install node',
        mise: () => 'mise use -g node@24',
        nvm: () => 'nvm install 24',
        n: () => 'n 24',
        winget: () => 'winget install OpenJS.NodeJS',
        'nvm-windows': () => 'nvm install 24 (nvm-windows)',
        'herdr-stop': () => 'Ejecuta: herdr server stop',
        'new-terminal': (needed) => `Abre una terminal nueva, comprueba que \`node --version\` muestra ${needed} o superior y lanza herdr desde ella.`,
        'launchctl-path': () => 'Si herdr se lanza desde un lanzador, ejecuta: launchctl setenv PATH "/opt/homebrew/bin:$PATH" y reinícialo.',
        'restart-herdr': () => 'Cierra herdr, abre una terminal nueva donde `node --version` sea suficiente y lanza herdr otra vez.',
    },
};
