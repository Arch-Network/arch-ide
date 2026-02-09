import { LAMPORTS_PER_ARCH, formatArchFromLamports, lamportsToArch } from '../archUnits';

// Note: this repo currently doesn't wire a test runner in `package.json`,
// but keeping this alongside other `__tests__` files helps prevent regressions
// once a runner is added (e.g. Vitest/Jest).

function expectClose(actual: number, expected: number, epsilon = 1e-12) {
  if (Math.abs(actual - expected) > epsilon) {
    throw new Error(`Expected ${actual} to be close to ${expected}`);
  }
}

// 5 ARCH should not render as 50 ARCH (10× denomination bug).
(() => {
  const fiveArchLamports = 5 * LAMPORTS_PER_ARCH;
  expectClose(lamportsToArch(fiveArchLamports), 5);

  const formatted = formatArchFromLamports(fiveArchLamports, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (formatted !== '5.00') {
    throw new Error(`Expected formatted balance to be "5.00", got "${formatted}"`);
  }
})();
