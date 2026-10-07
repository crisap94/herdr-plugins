// The words of the host refusal (a Node too old, with the steps for the OS). The English ones live next to the policy
// (src/host/policy.mjs), because a Node that cannot load this catalog still has to say them.
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
