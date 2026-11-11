import { defineConfig } from 'eslint/config';
import stylistic from '@stylistic/eslint-plugin';
import tsParser from '@typescript-eslint/parser';

export default defineConfig([
  {
    files: ['scripts/**/*.ts'],
    languageOptions: { parser: tsParser },
  },
  {
    files: ['scripts/**/*.ts', '*.mjs'],
    plugins: { '@stylistic': stylistic },
    rules: {
      curly: ['error', 'all'],
      '@stylistic/no-trailing-spaces': 'error',
      '@stylistic/brace-style': ['error', '1tbs'],
      '@stylistic/indent': ['error', 2],
      '@stylistic/object-property-newline': 'error',
      '@stylistic/object-curly-newline': [
        'error',
        {
          ObjectExpression: {
            multiline: true,
            minProperties: 2,
            consistent: true,
          },
          ObjectPattern: {
            multiline: true,
            minProperties: 3,
            consistent: true,
          },
          TSTypeLiteral: {
            multiline: true,
            minProperties: 2,
            consistent: true,
          },
          TSInterfaceBody: {
            multiline: true,
            minProperties: 2,
            consistent: true,
          },
        },
      ],
      // Keep short lists compact; expand arrays with 3+ or multiline elements.
      '@stylistic/array-bracket-newline': [
        'error',
        {
          multiline: true,
          minItems: 3,
        },
      ],
      '@stylistic/array-element-newline': [
        'error',
        {
          multiline: true,
          minItems: 3,
        },
      ],
      '@stylistic/member-delimiter-style': [
        'error',
        {
          multiline: {
            delimiter: 'semi',
            requireLast: true,
          },
        },
      ],
      '@stylistic/comma-dangle': ['error', 'always-multiline'],
    },
  },
]);
