const path = require('path');
const slsw = require('serverless-webpack');

module.exports = {
  mode: 'production',
  target: 'node',
  entry: slsw.lib.entries,
  externals: {
    'aws-sdk': 'commonjs aws-sdk',
  },
  module: {
    rules: [
      {
        test: /\.m?js$/,
        exclude: /node_modules/,
      },
    ],
  },
  resolve: {
    extensions: ['.js'],
  },
  output: {
    libraryTarget: 'commonjs',
    filename: '[name].js',
    path: path.resolve(__dirname, '.webpack'),
    clean: true,
  },
  optimization: {
    minimize: false,
  },
};
