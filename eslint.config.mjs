import globals from 'globals';

export default [
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
      'no-console': 'warn',
      'no-unused-vars': 'warn',
      'prefer-const': 'error',
      'no-var': 'error',
    },
  },
];
