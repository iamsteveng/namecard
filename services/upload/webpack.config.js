const path = require('path');
const nodeExternals = require('webpack-node-externals');
const CopyWebpackPlugin = require('copy-webpack-plugin');

module.exports = {
  mode: 'development',
  target: 'node',
  externals: [
    nodeExternals({
      allowlist: [
        '@prisma/client',
        '.prisma/client',
        '@shared',
        '@namecard/shared'
      ]
    })
  ],
  entry: {
    'handlers/health': './handlers/health.js',
    'handlers/single': './handlers/single.js',
    'handlers/batch': './handlers/batch.js',
    'handlers/presigned-url': './handlers/presigned-url.js',
    'handlers/validate': './handlers/validate.js',
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: {
          loader: 'ts-loader',
          options: {
            configFile: path.resolve(__dirname, './tsconfig.json'),
            transpileOnly: true
          }
        },
        exclude: /node_modules/,
      },
    ],
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.js'],
    alias: {
      '@shared': path.resolve(__dirname, '../shared'),
    },
  },
  output: {
    libraryTarget: 'commonjs',
    filename: '[name].js',
    path: path.resolve(__dirname, '.webpack'),
  },
  optimization: {
    minimize: false,
  },
  plugins: [
    new CopyWebpackPlugin({
      patterns: [
        {
          from: path.resolve(__dirname, 'node_modules/.prisma/client'),
          to: path.resolve(__dirname, '.webpack/.prisma/client'),
          globOptions: {
            ignore: ['**/*.d.ts'],
          },
          noErrorOnMissing: true,
        },
      ],
    }),
  ],
};