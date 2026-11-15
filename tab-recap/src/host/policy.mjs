export const MIN_BUN = '1.4.4';

const versionParts = (text) => (/^v?(\d+)\.(\d+)\.(\d+)/.exec(text.trim()) ?? []).slice(1).map(Number);

export function bunAtLeast(version, minimum = MIN_BUN) {
    const [have, need] = [versionParts(version), versionParts(minimum)];
    if (have.length !== 3) {
        return false;
    }
    const at = need.findIndex((part, index) => part !== have[index]);
    return at === -1 || (have[at] ?? 0) > (need[at] ?? 0);
}

const STEPS = {
    macos: ['brew', 'mise', 'curl', 'herdr-stop', 'new-terminal', 'launchctl-path'],
    linux: ['curl', 'mise', 'herdr-stop', 'new-terminal'],
};

const INSTALLERS = new Set(['brew', 'mise', 'curl']);

export function supportOf(host) {
    if (bunAtLeast(host.bunVersion)) {
        return { ok: true };
    }
    const platform = host.platform in STEPS ? host.platform : 'linux';
    return { ok: false, found: host.bunVersion, needed: MIN_BUN, platform, steps: STEPS[platform] };
}

export const ENGLISH = {
    headline: (found, needed, path) => `tab-recap needs Bun >= ${needed}, but this is ${found} (${path}).`,
    fix: 'To fix it:',
    install: (needed, options) => `Install Bun >= ${needed} (${options.join(' · ')}).`,
    steps: {
        brew: () => 'brew install oven-sh/bun/bun',
        mise: () => 'mise use -g bun@latest',
        curl: () => 'curl -fsSL https://bun.sh/install | bash',
        'herdr-stop': () => 'Run: herdr server stop',
        'new-terminal': (needed) => `Open a new terminal, check that \`bun --version\` prints ${needed} or newer, and start herdr from it.`,
        'launchctl-path': () => 'If herdr is started from a launcher, run: launchctl setenv PATH "/opt/homebrew/bin:$PATH" and restart it.',
    },
};

export function renderRefusal(refusal, path, words = ENGLISH) {
    const { found, needed, steps } = refusal;
    const options = steps.filter((id) => INSTALLERS.has(id)).map((id) => words.steps[id](needed));
    const others = steps.filter((id) => !INSTALLERS.has(id)).map((id) => words.steps[id](needed));
    const numbered = [words.install(needed, options), ...others].map((line, index) => `  ${index + 1}. ${line}`);
    return [words.headline(found, needed, path), words.fix, ...numbered].join('\n');
}
