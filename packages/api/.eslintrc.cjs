module.exports = {
  extends: ['../../.eslintrc.js'],
  env: {
    node: true,
    es2022: true,
  },
  rules: {
    'no-console': 'off',
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