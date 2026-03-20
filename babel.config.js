module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      ['@babel/plugin-proposal-decorators', { legacy: true }],
      [
        'module-resolver',
        {
          root: ['./src'],
          extensions: ['.ios.js', '.android.js', '.js', '.ts', '.tsx', '.json'],
          alias: {
            '@db': './src/db',
            '@models': './src/db/models',
            '@types': './src/types',
            '@screens': './src/screens',
            '@hooks': './src/hooks',
            '@services': './src/services',
            '@context': './src/context',
            '@navigation': './src/navigation',
            '@config': './src/config',
          },
        },
      ],
    ],
  };
};
