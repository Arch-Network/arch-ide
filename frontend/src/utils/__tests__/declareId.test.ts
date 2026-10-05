import { builtProgramId, programBinaryDataUrl, setDeclaredId } from '../declareId';

// Note: this repo currently doesn't wire a test runner in `package.json`; like archUnits.test.ts,
// these checks throw on failure and run under any runner (or directly via esbuild + node).

function expectEqual<T>(actual: T, expected: T, what: string) {
  if (actual !== expected) {
    throw new Error(`${what}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

const KEY = '4111ac83562d08ded57dcbf8b10d0dbb8f54eca3d52f18340537c1638ac1246c';
const PLACEHOLDER = `declare_id!("${'1'.repeat(64)}");`;

// The template placeholder, and an id from another key, both become the deploy key.
expectEqual(setDeclaredId(`use x;\n${PLACEHOLDER}\n`, KEY), `use x;\ndeclare_id!("${KEY}");\n`, 'placeholder');
expectEqual(setDeclaredId(`declare_id!("0x${'AB'.repeat(32)}");`, KEY), `declare_id!("${KEY}");`, '0x-prefixed upper-case id');
expectEqual(setDeclaredId(`arch_satellite_lang::declare_id!("${'0'.repeat(64)}");`, KEY), `arch_satellite_lang::declare_id!("${KEY}");`, 'qualified path');

// An id that already matches is left byte-for-byte as it was.
const matching = `declare_id!("${KEY}");`;
expectEqual(setDeclaredId(matching, KEY), matching, 'already the deploy key');

// Nothing Satellite would not compile: base58 (arch_program's declare_id!), expressions, wrong lengths.
for (const untouched of [
  'declare_id!("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS");',
  'declare_id!(MY_ID);',
  `declare_id!("${'1'.repeat(63)}");`,
  'entrypoint!(process_instruction);',
]) {
  expectEqual(setDeclaredId(untouched, KEY), untouched, `untouched: ${untouched}`);
}

// The data URL records the program id, and readers splitting on ',' still get the payload.
const tagged = programBinaryDataUrl('f0VMRg==', KEY);
expectEqual(builtProgramId(tagged), KEY, 'tagged binary');
expectEqual(tagged.split(',')[1], 'f0VMRg==', 'payload of a tagged binary');
expectEqual(builtProgramId(programBinaryDataUrl('f0VMRg==')), null, 'native build');
expectEqual(builtProgramId('data:application/octet-stream;base64,f0VMRg=='), null, 'imported or pre-existing binary');
