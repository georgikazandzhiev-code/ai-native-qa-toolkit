import tsParser from '@typescript-eslint/parser';
import qa from '../lib/index.js';
export default [{
  files: ['**/*.ts'],
  languageOptions: { parser: tsParser, ecmaVersion: 2022, sourceType: 'module' },
  plugins: { 'qa-constitution': qa },
  rules: Object.fromEntries(Object.keys(qa.rules).map(r => [`qa-constitution/${r}`, 'error'])),
}];
