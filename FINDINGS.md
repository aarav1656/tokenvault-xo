# XO findings (raw, reproducible)

Raw notes for the feedback essay. Each item has a repro in this repo.

1. After a good broadcast, executeAction can throw UnspentOutputNotFoundInStoreError from the reservation clear (Electrum already removed the spent coin). Intermittent. Workaround: read the invitation back.
2. Chipnet: coins confirmed while headers verify are dropped and never retried. Verification restarts from the checkpoint each start (12 to 15 s). A second Engine.create in one process throws "Cannot configure storage for cache". Funds sent after the engine is live appear.
3. Chipnet nodes reject height locktimes above about tip-30000 with bad-txns-nonfinal (tip-500 and tip-5000 fail, tip-30000 passes). Repro: scripts/locktime-probe.mjs <blocks back>.
4. Token-field expressions are decoded as UTF-8 then read as hex; a binary commitment throws NFTCommitmentInvalidError.
5. One $() has a fixed 32,800 op budget. An unrolled 24-byte hex encoder fails, 8 bytes fit, nested <$()> per byte works.
6. A bytes variable given as hex is hex-decoded in scripts but UTF-8 encoded in token-field expressions. Workaround: pass numbers.
7. <0x> parses as a variable named x. Use OP_0.
8. The template id seeds key derivation, so any template edit moves the fund address.
9. Output count cannot vary, so release and finalRelease are two actions.
10. An intent without generate gives LockingScriptSecretsNotFoundError that talks about the invitation. Fix: generate: ["fundKey"].
11. @xo-cash/state needs aliases for browser builds (better-sqlite3, indexeddbshim, node:path). StorageType.SQLITE creates only a templates table.
12. With ignore-scripts, Node needs a resolve hook plus fake-indexeddb, and state does not persist.
13. A mutable NFT category is 33 bytes; TokenVault_Mint's 32-byte compare forces an immutable state NFT, so each release mints a fresh genesis on a fee coin that is output 0.
14. The original CashScript source no longer compiles with cashc 0.14.0 (bytes8 cast); cashc 0.10.0-next.5 does not load on Node 24. Parity is against the project's artifact.
15. Fee preview says 160 per input and 120 per output; the release transaction is 1220 bytes.
