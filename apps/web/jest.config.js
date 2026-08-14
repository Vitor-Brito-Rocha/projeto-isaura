/**
 * Cobre só `src/lib` — a lógica pura que decide o que o aparelho entrega e como
 * avisar a professora. Componentes React ficam de fora de propósito: o que
 * quebra neste app não é renderização, é prometer um alarme que não vai tocar.
 */
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts', 'tsx'],
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.(t|j)sx?$': [
      'ts-jest',
      { tsconfig: { jsx: 'react-jsx', esModuleInterop: true, module: 'commonjs' } },
    ],
  },
  moduleNameMapper: { '^@/(.*)$': '<rootDir>/$1' },
  testEnvironment: 'node',
};
