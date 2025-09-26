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
      files: ['serverless.ts', 'serverless.yml'],
      rules: {
        'import/no-default-export': 'off',
      },
    },
  ],
};