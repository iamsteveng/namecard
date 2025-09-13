const path = require('path');
const nodeExternals = require('webpack-node-externals');
const CopyWebpackPlugin = require('copy-webpack-plugin');

module.exports = {
  mode: 'development',
  target: 'node',
  externals: [
    nodeExternals({
      // Bundle all dependencies except AWS SDK and built-in Node.js modules
      allowlist: /.*/,  // Allow everything to be bundled
      externals: [
        // Keep these as external (available in Lambda runtime)
        'aws-sdk',
        /^@aws-sdk\//,
        /^@smithy\//,
        'aws-lambda',
        'aws-xray-sdk-core'
      ]
    })
  ],
  entry: {
    'handlers/health': './handlers/health.js',
    'handlers/register': './handlers/register.js', 
    'handlers/login': './handlers/login.js',
    'handlers/refresh': './handlers/refresh.js',
    'handlers/logout': './handlers/logout.js',
    'handlers/profile': './handlers/profile.js',
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
          to: '.prisma/client',
          globOptions: {
            ignore: ['**/*.d.ts'],
          },
        },
        {
          from: path.resolve(__dirname, '../shared/node_modules/.prisma/client'),
          to: '.prisma/client',
          noErrorOnMissing: true,
          globOptions: {
            ignore: ['**/*.d.ts'],
          },
        },
      ],
    }),
  ],
};