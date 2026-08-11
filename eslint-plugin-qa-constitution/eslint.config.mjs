// Self-lint config for this package (plain CommonJS Node, no TS).
export default [
  { files: ['lib/**/*.js', 'tests/**/*.js'], languageOptions: { ecmaVersion: 2022, sourceType: 'commonjs' } },
];
