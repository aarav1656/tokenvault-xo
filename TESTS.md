# Tests

`npm test` runs 54 tests in test/vault.test.mjs on the BCH 2026 VM (libauth) against the two original covenants. The covenants are compiled from the template's own scripts, transactions are signed by libauth, and every verdict comes from the deployed (optimized) body. A failing transaction is then replayed against the unoptimized body to name the contract source line that rejected it, so each negative test asserts which require fired.

| Group | Tests | What it proves |
|---|---|---|
| Accepted flows | 6 | release plain branch, halving branch, later halving period, reward floor of 1, end of life, mint |
| Template math | 4 | template releaseAmount and next state commitment equal a reference model written from the CashScript source on 40 random states; a four release chain built from template-computed values is accepted by the covenant until the vault ends; the hex encoder fits the 32800 operation budget at the largest values; the unrolled encoder exceeds it |
| Release guards | 25 | each tampered transaction fails at the require it targets: signer, no signature, amount, change, commitment, halving, payout and change destinations, categories, output count, end of life shape, locktime, sequence, release height, fee coin tokens, token/NFT origin, state length, zero reward, halving length, input count |
| Mint guards | 13 | signer, no signature, amount, reward range, start height, genesis category, locked amount, state commitment, change destination, change tokens, output count, input count |
| Original contract | 3 | template addresses equal the CashScript SDK addresses for two argument sets, Release and Mint (with a negative control that differs when an argument differs); embedded bodies equal the project's artifacts |
| Template integrity | 3 | frozen template id (after a serialization round trip), every reference resolves, every spend path is reachable from an action |

## Checks that can fail: break the guard, see red, restore, see green

`MUTANT=<guard> npm test` replaces one enforcing opcode of the release covenant (OP_VERIFY becomes OP_DROP, or CHECKLOCKTIMEVERIFY becomes a NOP) before the suite runs. Measured on 21 Nov 2026:

| Run | Result | Red tests |
|---|---|---|
| npm test | 54 pass, 0 fail | none |
| MUTANT=commitment | 51 pass, 3 fail | release: next state commitment tampered; release: halving not applied to the reward; address parity (the mutated body is a different contract) |
| MUTANT=signer | 52 pass, 2 fail | release: no signature; address parity |
| MUTANT=payout | 52 pass, 2 fail | release: payout to a stranger; address parity |
| MUTANT=locktime | 51 pass, 3 fail | release: locktime below the release height; release: input sequence final disables the locktime; address parity |

Restoring (no MUTANT) returns to 54 pass. The signer mutant is not caught by the valid-signature-of-another-key test: a wrong but well formed Schnorr signature fails NULLFAIL inside OP_CHECKSIG before the VERIFY, so the test that carries the guard is the empty signature one.

## Chain readback

`node scripts/verify.mjs chipnet` reads each transaction of invitations/chipnet/ from an Electrum server (not through the XO engine), decodes it with libauth, and exits 1 when the supply released across releases differs from the supply locked. Run on the 10 transaction chipnet lifecycle: locked 60, released 60 in 4 releases. With 10-finalRelease removed from a copy of the set it prints "released total differs from the locked supply" (released 56 of 60).

## Lifecycle through XO invitations

scripts/lifecycle.mjs: fundMint, mint, then prepareFeeCoin and release three times (one plain branch, two crossing a halving) and a final release at end of life. Chipnet run of 21 Nov 2026 (template 833cf84d...):

01 fundMint c682993d77ae3f6d, 02 mint 20320be70b0183c8, 03 prepareFeeCoin 0fa0b54a0ce8b67d, 04 release f33b40dac8b000b3 (16 tokens), 05 prepareFeeCoin 97baa7eac9a49e02, 06 release 6e1ab13be926379d (24), 07 prepareFeeCoin 8b6ea3c0a543858b, 08 release d714226848aeb541 (16), 09 prepareFeeCoin 2cc2e46ffff3fb51, 10 finalRelease 8030cc9a1cb270d0 (remaining 4). Full ids are in invitations/chipnet/.

scripts/recover.mjs: fundMint, reclaim (spend branch of the Mint covenant) and sweep, invitations/chipnet-recover/.
