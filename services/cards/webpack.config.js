const path = require('path');
const nodeExternals = require('webpack-node-externals');
const CopyWebpackPlugin = require('copy-webpack-plugin');

module.exports = {
  mode: 'development',
  target: 'node',
  externals: [
    nodeExternals({
      allowlist: [
        '@shared',
        '@namecard/shared',
        /^@namecard\/serverless-shared(\/.*)?$/,
      ]
    })
  ],
  entry: {
    'handlers/health': './handlers/health.js',
    'handlers/list': './handlers/list.js',
    'handlers/create': './handlers/create.js',
    'handlers/get': './handlers/get.js',
    'handlers/update': './handlers/update.js',
    'handlers/delete': './handlers/delete.js',
    'handlers/search': './handlers/search.js',
  },
  module: {
    rules: [
      {
        test: /\.m?js$/,
        resolve: {
          fullySpecified: false,
        },
      },
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
      '@namecard/serverless-shared': path.resolve(__dirname, '../shared/dist'),
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
        },
        {
          from: path.resolve(__dirname, 'node_modules/@prisma/client'),
          to: path.resolve(__dirname, '.webpack/node_modules/@prisma/client'),
          globOptions: {
            dot: true,
            ignore: ['**/*.d.ts'],
          },
        },
      ],
    }),
  ],
};
