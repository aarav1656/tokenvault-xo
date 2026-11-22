# TokenVault on XO

A scheduled token vault as an XO template. Fungible CashTokens sit in a covenant next to a state NFT. The fund releases tokens up to the current block height, the reward halves every period, and the vault ends when the last token is out. The template computes the halving schedule and the next state NFT commitment, and every transaction is an XO invitation that blaze.xo.cash inspects.

Migrated from [foldingcash/smart-contracts TokenVault](https://github.com/foldingcash/smart-contracts) (CashScript). The two original contracts, TokenVault_Mint and TokenVault_Release, are embedded unchanged: the template's redeem scripts are the constructor arguments plus the compiled bodies of the project's own artifacts, so every vault address equals the CashScript build for the same arguments.

Engine: `@xo-cash/engine@0.1.1-next.18230317763` (npm dist-tag next). Template id: `833cf84d9673303502e916f0a305753c4ada691d0e2c106ec4afec717aa4dd29`.

## Original and XO side by side

| | foldingcash/smart-contracts | TokenVault on XO |
|---|---|---|
| Contracts | contracts/TokenVault_Mint.cash, TokenVault_Release.cash | the same bodies in template/tokenvault.template.mjs (scripts mintBody, releaseBody) |
| Address | CashScript SDK, P2SH32 | identical for the same arguments (test: template addresses equal the SDK for two argument sets) |
| Mint | mintToken.js | actions fundMint and mint |
| Release | releaseToken.js computes the next state in JavaScript | actions release and finalRelease; the template evaluates releaseAmount and the next state commitment (scripts nextState, nextStateHex) |
| Fee coin | any wallet coin that is output 0 of its transaction | action prepareFeeCoin makes it |
| Recovery | spend() branch | actions reclaim and sweep |

## Actions and follow-ups

| Action | Role | What it builds |
|---|---|---|
| fundMint | fund | satoshis into the Mint covenant, output 0 becomes the token genesis |
| mint | fund | token category created, supply and first state NFT locked in the vault |
| prepareFeeCoin | fund | one plain coin at output 0 for the next release |
| release | fund | token coin + state NFT + fee coin in, payout / remaining tokens / next state NFT out, locktime = release height |
| finalRelease | fund | end of life: every remaining token paid out, vault ends |
| reclaim | fund | spends an unused mint coin back to the wallet |
| sweep | fund | satoshis to any locking script |

release and finalRelease are declared as follow-ups on the four vault outputs and on the vault locking script; fundMint, prepareFeeCoin and sweep on the wallet script. The next action is read from the output the previous action created.

## Inspect it in blaze.xo.cash

1. Open https://blaze.xo.cash, create a disposable account on the network of the invitation (chipnet or mainnet).
2. Import Template, paste `template/tokenvault.template.json`. The tool shows id 833cf84d....
3. Join Invitation, paste any file from `invitations/<network>/` to read its commits and results, or Inspect Transaction with a transaction id to step the covenant's scripts per input.

## Reproduce

```bash
npm install                      # engine pinned exact; native sqlite is never built
node scripts/keygen.mjs          # writes .env (gitignored), prints key names only
node --import ./lib/no-native.mjs --env-file=.env scripts/address.mjs chipnet   # fund wallet address
node --import ./lib/no-native.mjs --env-file=.env scripts/lifecycle.mjs chipnet # faucet funded, writes invitations/chipnet/
node scripts/verify.mjs chipnet  # reads every transaction back from Electrum and checks locked = released
npm test                         # 54 tests on the BCH 2026 VM
npm run build:web                # static demo in web/dist
```

The same lifecycle runs on mainnet with `scripts/lifecycle.mjs mainnet` once the fund wallet holds about 50,000 satoshis (FUNDING.md).

## Evidence

Chipnet lifecycle, template 833cf84d, vault of 60 tokens, halving length 4, reward 8: one plain release, two releases that cross a halving, and a final release at end of life. The 10 transactions below are read back from Electrum by scripts/verify.mjs: locked 60, released 60 in 4 releases.

| Step | Transaction id |
|---|---|
| 01-fundMint | `c682993d77ae3f6db5407b982b2c47e21e82ac3a26b0c6b4a5ea8746eb0cf923` |
| 02-mint | `20320be70b0183c8b44f2d87dfdaff4b5c05d0d2cce698f37b62afb1f0c4ba09` |
| 03-prepareFeeCoin | `0fa0b54a0ce8b67dd3527b53eb2d159123ec5d814f3ee202db8a236ffc606f54` |
| 04-release | `f33b40dac8b000b3559202fb2f938e61d92c5883990c17d2767728c5c0679bfa` |
| 05-prepareFeeCoin | `97baa7eac9a49e0230c86f631ae2273e0698f53d5683b2f58bc91df8af6cb16f` |
| 06-release | `6e1ab13be926379df2ef341d332bebbe9519426bab8567ecf588d0417387c240` |
| 07-prepareFeeCoin | `8b6ea3c0a543858b7c763e6ef23c7a496f196a3a1de7102eadc4f67e05ca8286` |
| 08-release | `d714226848aeb54122ab12a5c94ab096baf877b5647dd5e9a8eaf07a0f9607f0` |
| 09-prepareFeeCoin | `2cc2e46ffff3fb516d1dcac9b777d0906a5b0399bce4c3286383b3035d4f37f8` |
| 10-finalRelease | `8030cc9a1cb270d0516f6b0ad1074697b16f42408dc754edb6eb1b8eabda9eca` |

Recovery path (fundMint, reclaim, sweep): invitations/chipnet-recover/.

Tests: TESTS.md. Each covenant guard has a negative test that names the contract line that rejected the transaction, and MUTANT=commitment, signer, payout or locktime with `npm test` switches one guard off to turn those tests red.

## Layout

- `template/` XO template (source and importable JSON)
- `contracts/` original CashScript sources and artifacts (MIT, foldingcash)
- `scripts/` lifecycle, recovery, readback, keys
- `lib/` engine bootstrap, invitation runner, Electrum client
- `test/` VM suite
- `web/` static demo (proof table, live chain readback, template calculator)
- `invitations/` every invitation behind a transaction above
