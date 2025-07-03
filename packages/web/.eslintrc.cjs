module.exports = {
  extends: ['../../.eslintrc.js'],
  env: {
    browser: true,
    es2022: true,
  },
  plugins: ['react-hooks', 'react-refresh'],
  settings: {
    react: {
      version: 'detect',
    },
  },
  rules: {
    'react-hooks/rules-of-hooks': 'error',
    'react-hooks/exhaustive-deps': 'warn',
    'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    'react/prop-types': 'off',
    'react/react-in-jsx-scope': 'off',
  },
  overrides: [
    {
      files: ['vite.config.ts', 'tailwind.config.js', 'postcss.config.js'],
      rules: {
        'import/no-default-export': 'off',
      },
    },
  ],
};