/**
 * Swap test case generator — IDE-compatible (no Node fs/path, no npm imports).
 * Run this in the Arch IDE client panel. Output is logged and attached to window
 * for copy/download (see bottom).
 *
 * Uses inlined Decimal-like math and Orca-style tick/sqrtPrice X64 conversions.
 */

// --- Inlined "Decimal" (rational BigInt) for IDE (no decimal.js) ---
class Decimal {
  private _num: bigint;
  private _den: bigint;

  constructor(n: string | number | bigint | Decimal, den: bigint = 1n) {
    if (n instanceof Decimal) {
      this._num = n._num;
      this._den = n._den;
      return;
    }
    const v = typeof n === "string" || typeof n === "number" ? BigInt(String(n)) : n;
    this._num = v;
    this._den = den;
  }

  mul(o: string | number | bigint | Decimal): Decimal {
    const oDec = o instanceof Decimal ? o : new Decimal(o);
    return new Decimal(this._num * oDec._num, this._den * oDec._den);
  }

  div(o: string | number | bigint | Decimal): Decimal {
    const oDec = o instanceof Decimal ? o : new Decimal(o);
    if (oDec._num === 0n) throw new Error("DivideByZero");
    return new Decimal(this._num * oDec._den, this._den * oDec._num);
  }

  add(o: string | number | bigint | Decimal): Decimal {
    const oDec = o instanceof Decimal ? o : new Decimal(o);
    const d = this._den * oDec._den;
    return new Decimal(this._num * oDec._den + oDec._num * this._den, d);
  }

  sub(o: string | number | bigint | Decimal): Decimal {
    const oDec = o instanceof Decimal ? o : new Decimal(o);
    const d = this._den * oDec._den;
    return new Decimal(this._num * oDec._den - oDec._num * this._den, d);
  }

  floor(): Decimal {
    if (this._den === 0n) throw new Error("DivideByZero");
    const q = this._num / this._den;
    const r = this._num % this._den;
    if (r >= 0n) return new Decimal(q, 1n);
    return new Decimal(q - 1n, 1n);
  }

  ceil(): Decimal {
    if (this._den === 0n) throw new Error("DivideByZero");
    const q = this._num / this._den;
    const r = this._num % this._den;
    if (r <= 0n) return new Decimal(q, 1n);
    return new Decimal(q + 1n, 1n);
  }

  eq(o: string | number | bigint | Decimal): boolean {
    const oDec = o instanceof Decimal ? o : new Decimal(o);
    return this._num * oDec._den === oDec._num * this._den;
  }

  gt(o: string | number | bigint | Decimal): boolean {
    const oDec = o instanceof Decimal ? o : new Decimal(o);
    return this._num * oDec._den > oDec._num * this._den;
  }

  lt(o: string | number | bigint | Decimal): boolean {
    const oDec = o instanceof Decimal ? o : new Decimal(o);
    return this._num * oDec._den < oDec._num * this._den;
  }

  gte(o: string | number | bigint | Decimal): boolean {
    return this.eq(o) || this.gt(o);
  }

  lte(o: string | number | bigint | Decimal): boolean {
    return this.eq(o) || this.lt(o);
  }

  isNegative(): boolean {
    return this._num < 0n !== (this._den < 0n);
  }

  toFixed(fracDigits: number, _roundMode?: number): string {
    if (fracDigits !== 0) throw new Error("toFixed(fracDigits!=0) not implemented");
    const q = this._num / this._den;
    const r = this._num % this._den;
    if (r === 0n) return String(q);
    const sign = q < 0n ? "-" : "";
    return sign + (q < 0n ? -q : q).toString();
  }

  toString(): string {
    if (this._den === 1n) return String(this._num);
    return this._num + "/" + this._den;
  }

  static min(a: Decimal, b: Decimal): Decimal {
    return a.lt(b) ? a : b;
  }

  static max(a: Decimal, b: Decimal): Decimal {
    return a.gt(b) ? a : b;
  }

  static set(_opts: Record<string, number>): void {}
}

// --- Inlined BN (BigInt wrapper) for IDE (no bn.js) ---
class BN {
  private _n: bigint;
  constructor(n: string | number | bigint) {
    this._n = BigInt(n);
  }
  toString(radix?: number): string {
    return radix === 16 ? this._n.toString(16) : String(this._n);
  }
}

// --- Orca-style constants (X64 = 2^64 scale) ---
const LOG2_1_0001 = Math.log2(1.0001);
const MIN_TICK_INDEX = -443636;
const MAX_TICK_INDEX = 443636;
const TWO_64 = new Decimal("18446744073709551616");
const MIN_SQRT_PRICE = new Decimal(1).div(TWO_64);
const MAX_SQRT_PRICE = TWO_64;
const TICK_ARRAY_SIZE = 88;

function tickIndexToSqrtPriceX64(tickIndex: number): BN {
  const exp = 64 + (tickIndex * LOG2_1_0001) / 2;
  const expInt = Math.floor(exp);
  if (expInt >= 0) {
    return new BN(2n ** BigInt(expInt));
  }
  return new BN(2n ** 64n / (2n ** BigInt(-expInt)));
}

function sqrtPriceX64ToTickIndex(sqrtPriceX64: BN): number {
  const x = Number(sqrtPriceX64.toString());
  if (x <= 0) return MIN_TICK_INDEX;
  const sqrtPrice = x / 2 ** 64;
  const log2Sqrt = Math.log2(sqrtPrice);
  const tick = (2 * log2Sqrt) / LOG2_1_0001;
  return Math.floor(tick);
}

function toDecimal(bn: BN): Decimal {
  return new Decimal(bn.toString());
}

function toBN(d: Decimal): BN {
  return new BN(d.toFixed(0, 1));
}

// --- Test case types ---
type TestCaseJSON = {
  testId: number;
  description: string;
  tickSpacing: number;
  feeRate: number;
  protocolFeeRate: number;
  liquidity: string;
  currTickIndex: number;
  tradeAmount: string;
  amountIsInput: boolean;
  aToB: boolean;
  expectation: TestCaseExpectationJSON;
};

type TestCaseExpectationJSON = {
  exception: string;
  amountA: string;
  amountB: string;
  nextLiquidity: string;
  nextTickIndex: number;
  nextSqrtPrice: string;
  nextFeeGrowthGlobal: string;
  nextProtocolFee: string;
};

enum LiquiditySetup {
  MaxLiquidity,
  ThirdQuartile,
  FirstQuartile,
  Zero,
}

enum CurrTickSetup {
  NearMax = 443500,
  NearMin = -443500,
  At1 = 0,
  At10 = 223027,
  AtNeg10 = -223027,
}

const MAX_FEE_RATE = 10_000;
const FEE_RATE_MUL_VALUE = 1_000_000;
const MAX_PROTOCOL_FEE_RATE = 2500;
const PROTOCOL_FEE_RATE_MUL_VALUE = 10_000;
const U64_MAX = new Decimal("18446744073709551615");
const U128_MAX = new Decimal("340282366920938463463374607431768211455");
const U192_MAX = new Decimal("6277101735386680763835789423207666416102355444464034512895");
const U256_MAX = new Decimal("115792089237316195423570985008687907853269984665640564039457584007913129639935");

const feeRateVariants: number[][] = [
  [MAX_FEE_RATE, MAX_PROTOCOL_FEE_RATE],
  [65535, 600],
  [700, 300],
  [0, 0],
];
const tickSpacingVariantsForConcentratedPool = [1, 8, 128];
const tickSpacingVariantsForSplashPool = [32768 + 1, 32768 + 64, 32768 + 128];
const liquidityVariantsForConcentratedPool = [
  LiquiditySetup.MaxLiquidity,
  LiquiditySetup.ThirdQuartile,
  LiquiditySetup.FirstQuartile,
  LiquiditySetup.Zero,
];
const liquidityVariantsForSplashPool = [
  LiquiditySetup.ThirdQuartile,
  LiquiditySetup.FirstQuartile,
  LiquiditySetup.Zero,
];
const liquidityValues = [
  new Decimal("1298074214633706907132624082305024"), // 2^110
  new Decimal("18446744073709551616"),                 // 2^64
  new Decimal("4294967296"),                          // 2^32
  new Decimal("0"),
];
const currTickVariants = [
  CurrTickSetup.NearMax,
  CurrTickSetup.NearMin,
  CurrTickSetup.At1,
  CurrTickSetup.At10,
  CurrTickSetup.AtNeg10,
];
const tradeAmountVariants = [
  new Decimal("18446744073709551615"),
  new Decimal("1000000000000"),
  new Decimal("1000000000"),
  new Decimal("0"),
];
const exactInputVariants = [true, false];
const aToBVariants = [true, false];

const testCase = 0;
const TEST_CASE_ID_BASE_CONCENTRATED_POOL = 0;
const TEST_CASE_ID_BASE_SPLASH_POOL = 1_000_000;

// --- Helpers ---
function getLastTickInSequence(currTick: number, tickSpacing: number, aToB: boolean): number {
  const numTicksInArray = TICK_ARRAY_SIZE * tickSpacing;
  const startTick = getStartTick(currTick, tickSpacing);
  const potentialLast = aToB
    ? startTick - 2 * numTicksInArray
    : startTick + 3 * numTicksInArray - 1;
  return Math.max(Math.min(potentialLast, MAX_TICK_INDEX), MIN_TICK_INDEX);
}

function getStartTick(currTick: number, tickSpacing: number): number {
  const numTicksInArray = TICK_ARRAY_SIZE * tickSpacing;
  const currTickDecimal = new Decimal(currTick);
  return Number(
    currTickDecimal.div(numTicksInArray).floor().mul(numTicksInArray).toFixed(0, 1)
  );
}

function toX64(num: Decimal): Decimal {
  return num.mul(TWO_64);
}

function fromX64(num: Decimal): Decimal {
  return num.div(TWO_64);
}

type AmountDeltaU64 =
  | { type: "Valid"; value: Decimal }
  | { type: "ExceedsMax"; error: Error };

function tryGetAmountADelta(
  sqrtPrice1: Decimal,
  sqrtPrice2: Decimal,
  liquidity: Decimal,
  round: boolean
): AmountDeltaU64 {
  const sqrtPriceLower = Decimal.min(sqrtPrice1, sqrtPrice2);
  const sqrtPriceUpper = Decimal.max(sqrtPrice1, sqrtPrice2);
  const diff = sqrtPriceUpper.sub(sqrtPriceLower);
  const dem = sqrtPriceUpper.mul(sqrtPriceLower);
  const product = liquidity.mul(diff);
  const num = toX64(product);

  if (product.gt(U192_MAX)) {
    throw new Error("MultiplicationOverflow");
  }
  const result = round ? num.div(dem).ceil() : num.div(dem).floor();

  if (result.gt(U128_MAX)) {
    return { type: "ExceedsMax", error: new Error("NumberDownCastError") };
  }
  if (result.gt(U64_MAX)) {
    return { type: "ExceedsMax", error: new Error("TokenMaxExceeded") };
  }
  return { type: "Valid", value: result };
}

function getAmountADelta(
  sqrtPrice1: Decimal,
  sqrtPrice2: Decimal,
  liquidity: Decimal,
  round: boolean
): Decimal {
  const r = tryGetAmountADelta(sqrtPrice1, sqrtPrice2, liquidity, round);
  if (r.type === "ExceedsMax") throw r.error;
  return r.value;
}

function tryGetAmountBDelta(
  sqrtPrice1: Decimal,
  sqrtPrice2: Decimal,
  liquidity: Decimal,
  round: boolean
): AmountDeltaU64 {
  const sqrtPriceLower = Decimal.min(sqrtPrice1, sqrtPrice2);
  const sqrtPriceUpper = Decimal.max(sqrtPrice1, sqrtPrice2);
  const diff = sqrtPriceUpper.sub(sqrtPriceLower);
  const product = liquidity.mul(diff);
  if (product.gt(U128_MAX)) {
    return { type: "ExceedsMax", error: new Error("MultiplicationShiftRightOverflow") };
  }
  const result = fromX64(product);
  return { type: "Valid", value: round ? result.ceil() : result.floor() };
}

function getAmountBDelta(
  sqrtPrice1: Decimal,
  sqrtPrice2: Decimal,
  liquidity: Decimal,
  round: boolean
): Decimal {
  const r = tryGetAmountBDelta(sqrtPrice1, sqrtPrice2, liquidity, round);
  if (r.type === "ExceedsMax") throw r.error;
  return r.value;
}

function getNextSqrtPriceFromTokenARoundingUp(
  currSqrtPrice: Decimal,
  liquidity: Decimal,
  tradeAmount: Decimal,
  add: boolean
): Decimal {
  if (tradeAmount.eq(0) || liquidity.eq(0)) return currSqrtPrice;
  const liquidityX64 = toX64(liquidity);
  const product = tradeAmount.mul(currSqrtPrice);
  if (add) {
    const denominator = liquidityX64.add(product);
    const numerator = liquidityX64.mul(currSqrtPrice);
    if (numerator.gt(U256_MAX)) throw new Error("MultiplicationOverflow");
    return numerator.div(denominator).ceil();
  } else {
    const denominator = liquidityX64.sub(product);
    const numerator = liquidityX64.mul(currSqrtPrice);
    if (numerator.gt(U256_MAX)) throw new Error("MultiplicationOverflow");
    if (denominator.lte(new Decimal(0))) throw new Error("DivideByZero");
    return numerator.div(denominator).ceil();
  }
}

function getNextSqrtPriceFromTokenBRoundingDown(
  currSqrtPrice: Decimal,
  liquidity: Decimal,
  tradeAmount: Decimal,
  add: boolean
): Decimal {
  if (tradeAmount.eq(0) || liquidity.eq(0)) return currSqrtPrice;
  if (add) {
    const quotient = toX64(tradeAmount).div(liquidity).floor();
    const result = currSqrtPrice.add(quotient);
    if (result.gt(toDecimal(tickIndexToSqrtPriceX64(443636)))) {
      throw new Error("SqrtPriceOutOfBounds");
    }
    return result;
  } else {
    const quotient = toX64(tradeAmount).div(liquidity).ceil();
    const result = currSqrtPrice.sub(quotient);
    if (result.lt(toDecimal(tickIndexToSqrtPriceX64(-443636)))) {
      throw new Error("SqrtPriceOutOfBounds");
    }
    return result;
  }
}

function getNextSqrtPriceFromInput(
  currSqrtPrice: Decimal,
  liquidity: Decimal,
  tradeAmount: Decimal,
  _exactIn: boolean,
  aToB: boolean
): Decimal {
  return aToB
    ? getNextSqrtPriceFromTokenARoundingUp(currSqrtPrice, liquidity, tradeAmount, true)
    : getNextSqrtPriceFromTokenBRoundingDown(currSqrtPrice, liquidity, tradeAmount, true);
}

function getNextSqrtPriceFromOutput(
  currSqrtPrice: Decimal,
  liquidity: Decimal,
  tradeAmount: Decimal,
  _exactIn: boolean,
  aToB: boolean
): Decimal {
  return aToB
    ? getNextSqrtPriceFromTokenBRoundingDown(currSqrtPrice, liquidity, tradeAmount, false)
    : getNextSqrtPriceFromTokenARoundingUp(currSqrtPrice, liquidity, tradeAmount, false);
}

function getFeeIncrements(
  feeAmount: Decimal,
  protocolRate: number,
  currLiquidity: Decimal
): { nextFeeGrowthGlobal: string; nextProtocolFee: string } {
  let globalFee = feeAmount;
  let protocolFee = new Decimal(0);
  if (protocolRate > 0) {
    const delta = globalFee.mul(protocolRate).div(PROTOCOL_FEE_RATE_MUL_VALUE).floor();
    globalFee = globalFee.sub(delta);
    protocolFee = delta;
  }
  let feeGlobalForInputToken = new Decimal(0);
  if (currLiquidity.gt(0)) {
    feeGlobalForInputToken = toX64(globalFee).div(currLiquidity).floor();
  }
  return {
    nextFeeGrowthGlobal: feeGlobalForInputToken.toFixed(0, 1),
    nextProtocolFee: protocolFee.toFixed(0, 1),
  };
}

function getTradeInfo(
  currTick: number,
  tickSpacing: number,
  liquidity: Decimal,
  tradeAmount: Decimal,
  feeRate: number,
  exactInput: boolean,
  aToB: boolean
): {
  amountA: Decimal;
  amountB: Decimal;
  nextSqrtPrice: Decimal;
  nextTick: number;
  feeAmount: Decimal;
} {
  let feeAmount = new Decimal(0);
  const currSqrtPrice = toDecimal(tickIndexToSqrtPriceX64(currTick));
  const targetSqrtPrice = toDecimal(
    tickIndexToSqrtPriceX64(getLastTickInSequence(currTick, tickSpacing, aToB))
  );
  let nextSqrtPrice: Decimal;

  if (tradeAmount.eq(0)) {
    throw new Error("ZeroTradableAmount");
  }

  if (exactInput) {
    const postFeeTradeAmount = tradeAmount
      .mul(FEE_RATE_MUL_VALUE - feeRate)
      .div(FEE_RATE_MUL_VALUE)
      .floor();
    const tryAmountIn = aToB
      ? tryGetAmountADelta(targetSqrtPrice, currSqrtPrice, liquidity, true)
      : tryGetAmountBDelta(targetSqrtPrice, currSqrtPrice, liquidity, true);
    if (
      tryAmountIn.type === "ExceedsMax" ||
      (tryAmountIn.type === "Valid" && tryAmountIn.value.gt(postFeeTradeAmount))
    ) {
      nextSqrtPrice = getNextSqrtPriceFromInput(
        currSqrtPrice,
        liquidity,
        postFeeTradeAmount,
        exactInput,
        aToB
      );
    } else {
      nextSqrtPrice = targetSqrtPrice;
    }
  } else {
    const tryAmountOut = aToB
      ? tryGetAmountBDelta(targetSqrtPrice, currSqrtPrice, liquidity, false)
      : tryGetAmountADelta(targetSqrtPrice, currSqrtPrice, liquidity, false);
    if (
      tryAmountOut.type === "ExceedsMax" ||
      (tryAmountOut.type === "Valid" && tryAmountOut.value.gt(tradeAmount))
    ) {
      nextSqrtPrice = getNextSqrtPriceFromOutput(
        currSqrtPrice,
        liquidity,
        tradeAmount,
        exactInput,
        aToB
      );
    } else {
      nextSqrtPrice = targetSqrtPrice;
    }
  }

  nextSqrtPrice = Decimal.min(
    Decimal.max(nextSqrtPrice, MIN_SQRT_PRICE),
    MAX_SQRT_PRICE
  );
  const maxSwap = nextSqrtPrice.eq(targetSqrtPrice);

  let amountIn: Decimal;
  let amountOut: Decimal;
  if (aToB) {
    amountIn = getAmountADelta(nextSqrtPrice, currSqrtPrice, liquidity, true);
    amountOut = getAmountBDelta(nextSqrtPrice, currSqrtPrice, liquidity, false);
  } else {
    amountIn = getAmountBDelta(currSqrtPrice, nextSqrtPrice, liquidity, true);
    amountOut = getAmountADelta(currSqrtPrice, nextSqrtPrice, liquidity, false);
  }

  if (!exactInput && amountOut.gt(tradeAmount)) {
    amountOut = tradeAmount;
  }

  if (exactInput && !maxSwap) {
    feeAmount = tradeAmount.sub(amountIn);
  } else {
    feeAmount = amountIn
      .mul(feeRate)
      .div(FEE_RATE_MUL_VALUE - feeRate)
      .ceil();
  }

  let remaining = tradeAmount;
  let calculated: Decimal;
  if (exactInput) {
    remaining = remaining.sub(amountIn.add(feeAmount));
    calculated = amountOut;
  } else {
    remaining = remaining.sub(amountOut);
    calculated = amountIn.add(feeAmount);
  }

  if (remaining.isNegative()) {
    throw new Error("AmountRemainingOverflow");
  }
  if (calculated.gt(U64_MAX)) {
    throw new Error("AmountCalcOverflow");
  }

  let amountA: Decimal;
  let amountB: Decimal;
  if (aToB === exactInput) {
    amountA = tradeAmount.sub(remaining);
    amountB = calculated;
  } else {
    amountA = calculated;
    amountB = tradeAmount.sub(remaining);
  }

  if (amountA.gt(U64_MAX) || amountB.gt(U64_MAX)) {
    throw new Error("TokenMaxExceeded");
  }
  if (amountA.lt(new Decimal(0)) || amountB.lt(new Decimal(0))) {
    throw new Error("TokenMinSubceeded");
  }

  let nextTick = sqrtPriceX64ToTickIndex(toBN(nextSqrtPrice));
  if (nextSqrtPrice.eq(targetSqrtPrice) && aToB) {
    nextTick -= 1;
  }

  return { amountA, amountB, nextSqrtPrice, nextTick, feeAmount };
}

function generateExpectation(
  feeRate: number,
  protocolRate: number,
  liquidity: Decimal,
  currTick: number,
  tickSpacing: number,
  tradeAmount: Decimal,
  exactInput: boolean,
  aToB: boolean
): TestCaseExpectationJSON {
  try {
    const tradeInfo = getTradeInfo(
      currTick,
      tickSpacing,
      liquidity,
      tradeAmount,
      feeRate,
      exactInput,
      aToB
    );
    const nextFees = getFeeIncrements(tradeInfo.feeAmount, protocolRate, liquidity);
    return {
      exception: "",
      amountA: tradeInfo.amountA.toFixed(0, 1),
      amountB: tradeInfo.amountB.toFixed(0, 1),
      nextLiquidity: liquidity.toFixed(0, 1),
      nextTickIndex: tradeInfo.nextTick,
      nextSqrtPrice: tradeInfo.nextSqrtPrice.toFixed(0, 1),
      nextFeeGrowthGlobal: nextFees.nextFeeGrowthGlobal,
      nextProtocolFee: nextFees.nextProtocolFee,
    };
  } catch (e) {
    return {
      exception: (e as Error).message,
      amountA: "0",
      amountB: "0",
      nextLiquidity: "0",
      nextTickIndex: 0,
      nextSqrtPrice: "0",
      nextFeeGrowthGlobal: "0",
      nextProtocolFee: "0",
    };
  }
}

function getLiquidityValue(setup: LiquiditySetup): Decimal {
  switch (setup) {
    case LiquiditySetup.MaxLiquidity:
      return liquidityValues[0];
    case LiquiditySetup.ThirdQuartile:
      return liquidityValues[1];
    case LiquiditySetup.FirstQuartile:
      return liquidityValues[2];
    case LiquiditySetup.Zero:
      return liquidityValues[3];
    default:
      return new Decimal(-1);
  }
}

function getLiquiditySetupText(setup: LiquiditySetup): string {
  switch (setup) {
    case LiquiditySetup.MaxLiquidity:
      return "2^110";
    case LiquiditySetup.ThirdQuartile:
      return "2^64";
    case LiquiditySetup.FirstQuartile:
      return "2^32";
    case LiquiditySetup.Zero:
      return "0";
    default:
      return "unknown";
  }
}

function getCurrTickText(currTickSetup: CurrTickSetup): string {
  switch (currTickSetup) {
    case CurrTickSetup.NearMax:
      return " at near max tick";
    case CurrTickSetup.NearMin:
      return " at near min tick";
    case CurrTickSetup.At1:
      return " at tick 0 (p = 1)";
    case CurrTickSetup.At10:
      return " at tick 223027";
    case CurrTickSetup.AtNeg10:
      return " at tick -223027";
  }
}

function getFeeRateText(feeRate: number, protocolRate: number): string {
  const feeRatePercentage = new Decimal(feeRate).div(10000).toFixed(2);
  return ` with ${feeRatePercentage}%/${protocolRate} fee`;
}

function getTokenDirectionText(
  tradeAmount: Decimal,
  exactInput: boolean,
  aToB: boolean
): string {
  const tradeAmountString = tradeAmount.toString();
  if (exactInput && aToB) return `swap exactly ${tradeAmountString} tokenA to tokenB`;
  if (!exactInput && aToB) return `swap tokenA to exactly ${tradeAmountString} tokenB`;
  if (exactInput && !aToB) return `swap exactly ${tradeAmountString} tokenB to tokenA`;
  return `swap tokenB to exactly ${tradeAmountString} tokenA`;
}

function poolSetupText(liquiditySetup: LiquiditySetup, tickSpacing: number): string {
  return `In a ts_${tickSpacing} pool with ${getLiquiditySetupText(liquiditySetup)} liquidity, `;
}

function getDescription(
  feeRate: number,
  protocolRate: number,
  liquidity: LiquiditySetup,
  tickSpacing: number,
  currTick: CurrTickSetup,
  tradeAmount: Decimal,
  exactInput: boolean,
  aToB: boolean
): string {
  const feeRateText = getFeeRateText(feeRate, protocolRate);
  const tradeInfoText = getTokenDirectionText(tradeAmount, exactInput, aToB);
  const poolInfoText = poolSetupText(liquidity, tickSpacing);
  const curTickText = getCurrTickText(currTick);
  return `${poolInfoText}${tradeInfoText}${curTickText}${feeRateText}`;
}

function generateTests(
  testIdBase: number,
  label: string,
  feeRateVariants: number[][],
  tickSpacingVariants: number[],
  liquidityVariants: LiquiditySetup[],
  currTickVariantsList: CurrTickSetup[],
  tradeAmountVariantsList: Decimal[],
  exactInputVariantsList: boolean[],
  aToBVariantsList: boolean[]
): TestCaseJSON[] {
  let testId = testIdBase;
  const testCases: TestCaseJSON[] = [];

  feeRateVariants.forEach((feeRateVariant) => {
    tickSpacingVariants.forEach((tickSpacingVariant) => {
      liquidityVariants.forEach((liquiditySetup) => {
        currTickVariantsList.forEach((currTickVariant) => {
          tradeAmountVariantsList.forEach((tradeAmount) => {
            exactInputVariantsList.forEach((exactInputVariant) => {
              aToBVariantsList.forEach((aToB) => {
                testId++;
                if (testCase > 0 && testId !== testCase) return;
                const expectation = generateExpectation(
                  feeRateVariant[0],
                  feeRateVariant[1],
                  getLiquidityValue(liquiditySetup),
                  currTickVariant,
                  tickSpacingVariant,
                  tradeAmount,
                  exactInputVariant,
                  aToB
                );
                testCases.push({
                  testId,
                  description: getDescription(
                    feeRateVariant[0],
                    feeRateVariant[1],
                    liquiditySetup,
                    tickSpacingVariant,
                    currTickVariant,
                    tradeAmount,
                    exactInputVariant,
                    aToB
                  ),
                  tickSpacing: tickSpacingVariant,
                  feeRate: feeRateVariant[0],
                  protocolFeeRate: feeRateVariant[1],
                  liquidity: getLiquidityValue(liquiditySetup).toFixed(0, 1),
                  currTickIndex: currTickVariant,
                  tradeAmount: tradeAmount.toFixed(0, 1),
                  amountIsInput: exactInputVariant,
                  aToB,
                  expectation,
                });
              });
            });
          });
        });
      });
    });
  });

  console.log(`${label}: ${testCases.length} cases`);
  return testCases;
}

// --- Main: generate and output (IDE: no fs) ---
Decimal.set({ toExpPos: 8, toExpNeg: -8, precision: 128 });

const concentrated = generateTests(
  TEST_CASE_ID_BASE_CONCENTRATED_POOL,
  "ConcentratedPool",
  feeRateVariants,
  tickSpacingVariantsForConcentratedPool,
  liquidityVariantsForConcentratedPool,
  currTickVariants,
  tradeAmountVariants,
  exactInputVariants,
  aToBVariants
);

const splash = generateTests(
  TEST_CASE_ID_BASE_SPLASH_POOL,
  "SplashPool",
  feeRateVariants,
  tickSpacingVariantsForSplashPool,
  liquidityVariantsForSplashPool,
  currTickVariants,
  tradeAmountVariants,
  exactInputVariants,
  aToBVariants
);

const concentratedJson = JSON.stringify(concentrated, null, 2);
const splashJson = JSON.stringify(splash, null, 2);

console.log("--- swap_test_cases.json (ConcentratedPool) ---");
console.log(concentratedJson);
console.log("--- swap_test_cases_splash_pool.json (SplashPool) ---");
console.log(splashJson);

// Expose on window for copy/download in IDE (e.g. copy(JSON.stringify(window.__swapTestCasesConcentrated, null, 2)))
;(window as unknown as Record<string, unknown>).__swapTestCasesConcentrated = concentrated;
;(window as unknown as Record<string, unknown>).__swapTestCasesSplash = splash;
console.log("Done. Copy from output above, or use window.__swapTestCasesConcentrated / window.__swapTestCasesSplash in the console.");
