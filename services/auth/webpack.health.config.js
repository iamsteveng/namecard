const path = require('path');
const slsw = require('serverless-webpack');

module.exports = {
  mode: 'production',
  target: 'node',
  entry: slsw.lib.entries,
  externals: {
    // Provided by Lambda runtime
    'aws-sdk': 'commonjs aws-sdk',
  },
  module: {
    rules: [
      {
        test: /\.m?js$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: [[require.resolve('@babel/preset-env'), { targets: { node: '18' } }]],
          },
        },
      },
    ],
  },
  resolve: {
    extensions: ['.js'],
  },
  output: {
    libraryTarget: 'commonjs',
    filename: 'handlers/[name].js',
    path: path.resolve(__dirname, '.webpack'),
    clean: true,
  },
  optimization: {
    minimize: false,
  },
};
