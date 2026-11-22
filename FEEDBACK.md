# Feedback on XO

Two write-ups, one per bounty. Both come from building TokenVault on XO during BLAZE: porting FoldingCash's CashScript token vault (halving release schedule, NFT state, CLTV) into a single XO template and running its whole lifecycle through invitations. Every issue below has a reproduction in this repo (FINDINGS.md, scripts/).

## Build with XO

What worked well. The template schema is more expressive than I expected going in. I could describe a covenant in CashASM, give it roles, mark one action as a funder action and chain the next as a follow-up, and the engine sized inputs and change without me writing any coin selection. Being able to import the template into blaze.xo.cash, join an invitation and inspect the final transaction input by input was the single most useful thing in the stack. It turned "why does this fail" from guesswork into reading a trace.

The part I was most worried about was the vault computing its own next state. The release action has to write a new NFT commitment (released amount, next unlock height, halving step). That works, but only after learning how expressions are evaluated. Token field expressions are decoded as UTF-8 and then read as hex, so a binary commitment throws NFTCommitmentInvalidError. One $() has a fixed budget of 32,800 operations, so an unrolled 24-byte hex encoder fails while 8 bytes fit; nesting one $() per byte gets around it. None of this is documented, and each cost me an hour.

Smaller things that tripped me up:
- A bytes variable given as hex is hex-decoded inside scripts but UTF-8 encoded inside token field expressions. Passing numbers instead avoids it.
- <0x> parses as a variable named x. OP_0 works.
- An intent without generate fails with LockingScriptSecretsNotFoundError, and the message talks about the invitation, not the missing generate: ["fundKey"].
- The template id seeds key derivation, so any edit to the template moves the fund address. That is reasonable, but it should be said loudly, because I funded an address that a later edit abandoned.
- Output count cannot vary at runtime, so release and finalRelease had to be two actions.

Suggestions: a page on expression evaluation (encodings, the op budget, how hex and bytes are treated in each context); an error for a missing generate that names the field; a worked example of follow-up actions declared on outputs, because I only understood them by reading the engine.

## Migrate to XO

The original project is github.com/foldingcash/smart-contracts, a CashScript TokenVault with a mint contract and a release contract. The migration kept the behaviour and gave up the original UX, which the bounty allows.

What helped: the template could express the same locking bytecode, and I checked that the template addresses equal the CashScript SDK addresses for two argument sets, with a negative control. That parity check is what gave me confidence the port was faithful, and I would like XO to ship a helper for it, because anyone migrating will want the same proof.

What made it hard:
- The original CashScript source no longer compiles with cashc 0.14.0 (a bytes8 cast), and cashc 0.10.0-next.5 does not load on Node 24, so parity is against the project's committed artifact. Not an XO bug, but migrations will hit it.
- A mutable NFT's category reads as 33 bytes, and TokenVault_Mint compares 32, which forced an immutable state NFT. Each release now mints a fresh genesis from a fee coin that has to be output 0 of its transaction. It works, and it is the ugliest part of the port.
- After a good broadcast, executeAction can throw UnspentOutputNotFoundInStoreError while clearing reservations, because Electrum already dropped the spent coin. Intermittent. I read the invitation back to confirm.
- On chipnet, coins that confirm while headers verify are dropped and never retried, verification restarts from the checkpoint each start (12 to 15 seconds), and a second Engine.create in one process throws "Cannot configure storage for cache".
- Chipnet nodes rejected height locktimes closer than about 30,000 blocks to the tip with bad-txns-nonfinal. scripts/locktime-probe.mjs reproduces it.
- For a browser build, @xo-cash/state needs aliases for better-sqlite3, indexeddbshim and node:path, and StorageType.SQLITE creates only a templates table.
- The fee preview assumes 160 bytes per input and 120 per output; the real release transaction is 1,220 bytes, so covenant spends are underpriced.

If I were prioritising: retry for coins dropped during header sync, a fee estimate that measures the actual unlocking bytecode, and the parity helper. Those three would have saved most of my time on this port.
