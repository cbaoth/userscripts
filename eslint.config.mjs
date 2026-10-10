import globals from 'globals';

// Frozen copies of renamed scripts (old paths, see docs/TODO.md): never edited, so not linted.
const FROZEN = [
    'amazon-links.user.js',
    'auto-show-forum-spoilers.user.js',
    'copy-url-on-hover.user.js',
    'search-hotkey.user.js',
    'universal-*.user.js',
];

export default [
    { ignores: FROZEN },
    {
        files: ['**/*.user.js', 'lib/**/*.js'],
        languageOptions: {
            ecmaVersion: 2022,
            globals: {
                ...globals.browser,
                ...globals.greasemonkey,
                GM_config: 'readonly',
                GM_addStyle: 'readonly',
                GM_setClipboard: 'readonly',
            },
        },
        rules: {
            // console.warn/error are legitimate for reporting caught errors; stray console.log still warns
            'no-console': ['warn', { allow: ['warn', 'error'] }],
            'no-unused-vars': 'warn',
            'prefer-const': 'error',
            'no-var': 'error',
        },
    },
];
