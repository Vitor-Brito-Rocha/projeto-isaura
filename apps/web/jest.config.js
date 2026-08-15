/**
 * Cobre `src/lib` — a lógica pura que decide o que o aparelho entrega e como
 * avisar a professora — e os componentes cuja quebra é de MONTAGEM, não de
 * aparência.
 *
 * A regra era "componentes ficam de fora, o que quebra aqui não é renderização".
 * Um `Button asChild` provou o contrário derrubando a home inteira, sem que
 * `tsc` nem `next build` reclamassem. Teste de layout continua fora de escopo;
 * teste de "a árvore monta" não.
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
