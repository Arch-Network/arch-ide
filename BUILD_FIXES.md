# Build fixes for Arch programs (compile server)

This doc covers common build failures when building programs (e.g. Whirlpool-style or tetst) on the Arch IDE compile server.

---

## 0. Multiple SDK versions (Satellite vs native)

The compile server supports **two dependency sets** so that both Satellite-based programs and native/latest programs can build:

| Framework | Request field | arch_program / apl-* | Use case |
|-----------|----------------|----------------------|----------|
| **Satellite** | `framework: "satellite"` or omitted | 0.5.15 | Programs using satellite-lang (only supports ^0.5.15). |
| **Native** | `framework: "native"` | 0.6.0 | Programs using latest arch_program without satellite-lang. |

- The **frontend** sends `framework` from the project’s `framework` field (`'native' \| 'satellite'`). Default is `'satellite'` for backward compatibility.
- The **build API** accepts an optional `framework` in the JSON body: `"satellite"` or `"native"`. If missing, the server uses **Satellite** (0.5.15).

So: **Satellite projects** (including existing ones that don’t set framework) get 0.5.15; **native projects** get 0.6.0. No single template can satisfy both because satellite-lang is not yet compatible with 0.6.0.

---

## 1. Type mismatches: "two different versions of crate `arch_program`"

**Symptom:** Errors like `expected COption<Pubkey>, found COption<_>`, `expected arch_program::pubkey::Pubkey, found satellite_lang::prelude::Pubkey`, or `the trait From<arch_program::program_error::ProgramError> is not implemented for satellite_lang::error::Error`.

**Cause:** Your program uses **satellite-lang**, which depends on **arch_program ^0.5.15**, but the build was done with the **native** (0.6.0) template—or vice versa. That pulls in two versions of `arch_program`, so types don’t match.

**Fix:** Use the correct framework for the project:
- **Satellite / Whirlpool-style projects:** Ensure the project’s `framework` is `"satellite"` (or leave it unset so the server defaults to Satellite). The server will use arch_program 0.5.15.
- **Native / latest-only projects:** Set the project’s `framework` to `"native"` so the server uses arch_program 0.6.0.

If you still see duplicate-version errors, run `cargo tree -i arch_program` (or inspect the build log) and ensure only one version of `arch_program` appears for that build.

---

## 2. Borsh: missing `deserialize_reader` in manual impl

**Symptom:** `error[E0046]: not all trait items implemented, missing: deserialize_reader` in `src/math/bn.rs` for your manual `impl BorshDeserialize for U256` (e.g. inside `impl_borsh_deserialize_for_bn!(U256)`).

**Cause:** In **borsh 1.x**, the `BorshDeserialize` trait has one required method: `deserialize_reader<R: Read>(reader: &mut R) -> Result<Self, std::io::Error>`. Older code (or code written for borsh 0.9 / “borsh09”) only implemented `deserialize`; that’s no longer enough. There is **no crate named `borsh09`** on crates.io—use `borsh` in code. We can’t pin to borsh 0.9 in the build template because satellite-lang and other deps require borsh ^1.4.

**Fix (in your program):** In `src/math/bn.rs`, replace your `impl_borsh_deserialize_for_bn!` macro with one that implements **only** `deserialize_reader` (borsh 1.x uses that as the single required method). For **U256** (32 bytes), use:

```rust
macro_rules! impl_borsh_deserialize_for_bn {
    ($type:ident) => {
        impl BorshDeserialize for $type {
            fn deserialize_reader<R: std::io::Read>(reader: &mut R) -> std::io::Result<Self> {
                let mut bytes = [0u8; 32];
                reader.read_exact(&mut bytes)?;
                Ok($type::from_little_endian(&bytes))
            }
        }
    };
}
```

Then keep `impl_borsh_serialize_for_bn!(U256)` as-is, and call both:

```rust
impl_borsh_deserialize_for_bn!(U256);
impl_borsh_serialize_for_bn!(U256);
```

If your macro currently has `fn deserialize(_reader: &mut &[u8]) -> std::io::Result<Self>` (or similar) and no `deserialize_reader`, **replace** that impl block with the one above. In borsh 1.x the trait only requires `deserialize_reader`; the rest is provided by the trait. After this change, the E0046 error should go away.

---

## 3. Stack offset exceeded (bitcode / bitcoin)

**Symptom:** Build or link errors such as:

- `Function _ZN7bitcode9histogram9histogram17h... Stack offset of 7192 exceeded max offset of 4096`
- `Function _ZN7bitcoin4psbt3map5input5Input6decode17h... Stack offset of 4120 exceeded max offset of 4096`

**Cause:** The SBF target limits stack frame size (e.g. 4096 bytes). Some dependencies (**bitcode**, **bitcoin**, pulled in via **apl-token** or other crates) have functions that use more than that, so the SBF linker reports an error.

**Options:**

1. **Reduce or avoid heavy deps:** If you don’t need the code paths that use bitcode/bitcoin in the program, try turning them off via feature flags in the crates that depend on them (e.g. apl-token), or use a fork that disables those features for SBF.
2. **After fixing Rust and type errors:** Sometimes these stack messages appear in the log but the build still fails earlier on Rust errors. Fix all Rust errors (including the arch_program version and Borsh impl above) first; then if the **link** step still fails with stack errors, you need to address the dependency stack usage (or remove the dependency from the SBF build).
3. **Toolchain / target:** In the future, if the Solana/Arch SBF toolchain supports a larger stack or different codegen for these crates, upgrading may help. For now, the practical fix is to avoid or minimize use of the code that pulls in these large stack frames.

---

## Summary

| Issue | Fix |
|-------|-----|
| `arch_program` / Satellite type mismatches | Server template uses arch_program and apl-* at **0.5.15**. Redeploy rust-server. |
| Borsh `deserialize_reader` missing | In `src/math/bn.rs`, implement `deserialize_reader` in the manual `BorshDeserialize` impl for your big-int type. |
| Stack offset exceeded (bitcode/bitcoin) | Fix Rust errors first; then reduce or remove use of deps that exceed SBF stack limit, or disable their features. |
