const path = require('path');
const slsw = require('serverless-webpack');
const CopyWebpackPlugin = require('copy-webpack-plugin');

module.exports = {
  mode: 'development',
  target: 'node',
  externals: {
    'aws-sdk': 'commonjs aws-sdk',
  },
  entry: slsw.lib.entries,
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
        { from: 'node_modules/.prisma/client', to: '.prisma/client', noErrorOnMissing: true },
      ],
    }),
  ],
};
