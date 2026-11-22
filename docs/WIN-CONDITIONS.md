# Win conditions

Entry: TokenVault on XO. Bounties: Migrate to XO and Build with XO.

## Rival to beat

Standing Order (entry 51213), https://github.com/swiftbotlabs/standing-order . Its XO templates run on chipnet; its mainnet proof comes from its own SolidCash scripts, and its pinned engine is 0.1.1-next.18029697917.

## What a judge gets in the first minute

| Judge question | Standing Order | TokenVault on XO |
|---|---|---|
| Engine version | 0.1.1-next.18029697917 | 0.1.1-next.18230317763 (npm dist-tag next, read 21 Nov 2026) |
| Does the template compute token state? | fixed satoshi amounts | the template evaluates the halving schedule and the next state NFT commitment itself (scripts nextState, nextStateHex, releaseAmount) |
| Follow-up actions | chained by app code | release and finalRelease are declared on the four vault outputs and on the vault locking script; prepareFeeCoin, fundMint and sweep on the wallet script |
| Migrated contract | address parity for two argument sets | the original compiled bodies are embedded; template addresses equal the CashScript SDK for two argument sets, with a negative control |
| Does a failing guard turn a test red? | not shown | MUTANT=commitment, signer, payout or locktime with npm test switches one covenant guard off and the targeted tests fail |
| Inspectable in blaze.xo.cash | chipnet invitations | invitations/chipnet/ and invitations/mainnet/, template id 833cf84d9673303502e916f0a305753c4ada691d0e2c106ec4afec717aa4dd29 |

## Host asset

BCH plus CashTokens: a fungible token category minted by the Mint covenant (genesis on its coin) and a state NFT, both held by the TokenVault_Release covenant.

## Where to look

- Template: template/tokenvault.template.mjs, importable file template/tokenvault.template.json.
- Original contracts and their compiled artifacts: contracts/ (foldingcash/smart-contracts, MIT).
- Invitations: invitations/chipnet/, invitations/mainnet/, invitations/chipnet-recover/.
- Tests: test/vault.test.mjs (npm test), TESTS.md.
- Readback of every transaction from Electrum: scripts/verify.mjs.
- Web demo: web/ (npm run build:web).
