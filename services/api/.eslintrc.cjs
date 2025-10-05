module.exports = {
  extends: ['../../.eslintrc.js'],
  env: {
    node: true,
    es2022: true,
  },
  globals: {
    Express: 'readonly',
  },
  rules: {
    'no-console': 'off',
    '@typescript-eslint/no-explicit-any': 'off', // Turn off for CI
    '@typescript-eslint/no-non-null-assertion': 'off', // Turn off for CI
    'no-undef': 'off', // Turn off for Express types
  },
  overrides: [
    {
      files: ['src/scripts/**/*.ts', 'prisma/**/*.ts'],
      rules: {
        'no-console': 'off',
      },
    },
  ],
};