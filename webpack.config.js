const path = require('path');
const nodeExternals = require('webpack-node-externals');

module.exports = {
  mode: 'development',
  target: 'node',
  externals: [nodeExternals()],
  entry: {
    'local/auth-proxy': './local/auth-proxy.ts',
    'local/cards-proxy': './local/cards-proxy.ts', 
    'local/upload-proxy': './local/upload-proxy.ts',
    'local/scan-proxy': './local/scan-proxy.ts',
    'local/enrichment-proxy': './local/enrichment-proxy.ts',
    'local/health': './local/health.ts',
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: {
          loader: 'ts-loader',
          options: {
            configFile: 'tsconfig.serverless.json',
            transpileOnly: true,
          },
        },
        exclude: /node_modules/,
      },
    ],
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.js'],
    alias: {
      '@shared': path.resolve(__dirname, 'services/shared'),
      '@services': path.resolve(__dirname, 'services'),
    },
  },
  output: {
    libraryTarget: 'commonjs2',
    path: path.resolve(__dirname, '.webpack/service'),
    filename: '[name].js',
  },
};