// @ts-check
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    rules: {
      // Relax rules for example app
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],
      // '@typescript-eslint/no-explicit-any': 'off',
      // '@typescript-eslint/no-unsafe-assignment': 'off',
      // '@typescript-eslint/no-unsafe-member-access': 'off',
      // '@typescript-eslint/no-unsafe-call': 'off',
      // '@typescript-eslint/no-unsafe-return': 'off',
      // '@typescript-eslint/no-unsafe-argument': 'off',
    },
  },
  {
    files: ['**/*.js', '**/*.mjs', 'vite.config.ts'],
    ...tseslint.configs.disableTypeChecked,
  },
  {
    ignores: ['dist/**', 'node_modules/**', 'convex/_generated/**'],
  },
);
