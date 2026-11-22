// TokenVault as an XO template: a migration of foldingcash/smart-contracts TokenVault (CashScript).
// The two original contracts are embedded unchanged (compiled bodies from the project's own artifacts, contracts/bodies.mjs).
// Redeem script = constructor arguments + body, so every vault address equals the CashScript build for the same arguments.
// The template, not the app, computes the halving schedule and the next state NFT commitment.
import { mint, release } from '../contracts/bodies.mjs';

const view = (name, description, icon) => ({ name, description, ...(icon ? { icon } : {}) });
const variable = (name, description, type) => ({ name, description, type });
const FUND = { role: 'fund' };
const DUST = 1000n; // satoshis on every vault token output, as in the original (util/constants.js DustValue)
const TOKEN = '$(<tokenCategory>)';
// TokenVault_Mint and TokenVault_Release read the state NFT category as a plain 32 byte hash, so the state NFT has no capability
// byte: it is immutable, and every release mints the next one (a genesis on the fee coin, which must be output 0 of its transaction).
const IMMUTABLE = 'none';

const fundRole = (variables = []) => ({ fund: { requirements: { variables, secrets: ['fundKey'] } } });
const oneFund = { participants: [{ role: 'fund', slots: { min: 1, max: 1 } }] };

// The engine decodes a token field expression as UTF-8 text and then reads it as hex, so a commitment computed in script is
// hex encoded in script too. One evaluation has a fixed operation budget (32800), so every byte is its own nested $( ) evaluation
// and the 24 results are concatenated.
const hexNibble = '<"0123456789abcdef"> OP_SWAP OP_SPLIT OP_NIP OP_1 OP_SPLIT OP_DROP';
const hexByte = 'OP_DUP <16> OP_DIV ' + hexNibble + ' OP_SWAP <16> OP_MOD ' + hexNibble + ' OP_CAT';
const hexOf = (state) => Array.from({ length: 24 }, (_, i) => '<$(' + state + ' <' + i + '> OP_SPLIT OP_NIP OP_1 OP_SPLIT OP_DROP <0x00> OP_CAT OP_BIN2NUM hexByte)>').reduce((a, b) => a + ' ' + b + ' OP_CAT'.replace(/^ OP_CAT$/, ' OP_CAT'));

export const tokenVaultTemplate = {
  $schema: 'https://libauth.org/schemas/wallet-template-v0.schema.json',
  name: 'TokenVault',
  description: 'Scheduled token release with halving. Fungible CashTokens sit in a covenant next to a state NFT; the fund releases up to the current block height, the reward halves every period, and the template computes the next state NFT.',
  icon: 'vault',
  version: '1',
  supported: ['BCH_2026_05'],
  resources: [
    { name: 'Original project', description: 'foldingcash/smart-contracts TokenVault (CashScript), migrated unchanged.', url: 'https://github.com/foldingcash/smart-contracts' },
  ],
  defaults: {
    address: { lockingScript: 'fundWallet', role: 'fund', generate: ['fundKey'] },
    receive: { output: 'walletReceive', role: 'fund', generate: ['fundKey'] },
    change: { output: 'walletChange', role: 'fund', generate: ['fundKey'] },
  },
  roles: {
    fund: view('Fund', 'Holds the fund key. Signs every mint and release; the released tokens are paid to this key.', 'fund'),
  },
  start: [
    { action: 'fundMint', role: 'fund', generate: ['fundKey'] },
  ],
  actions: {
    fundMint: {
      ...view('Fund the mint', 'Send satoshis to the TokenVault_Mint covenant. Output 0 of this transaction becomes the token genesis.', 'vault'),
      roles: fundRole(['mintSatoshis']),
      requirements: oneFund,
      transaction: 'fundMintTransaction',
    },
    mint: {
      ...view('Mint and lock', 'Create the token category and lock the supply in the vault with its first state NFT.', 'vault'),
      roles: fundRole(['tokenCategory', 'lockAmount', 'startHeight', 'reward', 'halvingLength', 'mintCoinSatoshis']),
      requirements: oneFund,
      transaction: 'mintTransaction',
    },
    release: {
      ...view('Release tokens', 'Release tokens up to a block height. Spends the token coin, the state NFT and one wallet coin; pays the fund, returns the rest with the next state NFT.', 'release'),
      roles: fundRole(['tokenCategory', 'stateCategory', 'nextStateCategory', 'releaseHeight', 'halvingHeight', 'currentReward', 'blockHeight', 'halvingLength', 'vaultTokens', 'walletSatoshis']),
      requirements: oneFund,
      transaction: 'releaseTransaction',
    },
    finalRelease: {
      ...view('Release the remainder', 'End of life: the schedule releases everything that is left. The vault and its state NFT end.', 'release'),
      roles: fundRole(['tokenCategory', 'stateCategory', 'releaseHeight', 'halvingHeight', 'currentReward', 'blockHeight', 'halvingLength', 'vaultTokens', 'walletSatoshis']),
      requirements: oneFund,
      transaction: 'finalReleaseTransaction',
    },
    prepareFeeCoin: {
      ...view('Prepare a fee coin', 'Make one plain coin at output 0 of its transaction. A release spends it as its fee coin: the contract names the next state NFT after it.', 'fund'),
      roles: fundRole(['coinSatoshis']),
      requirements: oneFund,
      transaction: 'prepareFeeCoinTransaction',
    },
    reclaim: {
      ...view('Reclaim the mint coin', 'Spend an unused mint coin back to the fund wallet.', 'vault'),
      roles: fundRole(['mintCoinSatoshis']),
      requirements: oneFund,
      transaction: 'reclaimTransaction',
    },
    sweep: {
      ...view('Sweep', 'Send satoshis from the fund wallet to another address.', 'send'),
      roles: fundRole(['recipientLockingScript', 'transferredSatoshis']),
      requirements: oneFund,
      transaction: 'sweepTransaction',
    },
  },
  transactions: {
    fundMintTransaction: {
      ...view('Mint funded', 'Funded the mint covenant.', 'vault'),
      inputs: [],
      outputs: [{ output: 'mintFundingOutput', outputIndex: 0 }],
    },
    mintTransaction: {
      ...view('Minted and locked', 'Minted the supply and locked it in the vault.', 'vault'),
      inputs: [{ input: 'mintCoinInput', inputIndex: 0 }],
      outputs: [{ output: 'mintVaultTokens', outputIndex: 0 }, { output: 'mintVaultState', outputIndex: 1 }, { output: 'mintChange', outputIndex: 2 }],
    },
    releaseTransaction: {
      ...view('Tokens released', 'Released tokens from the vault to the fund.', 'release'),
      locktime: '$(<blockHeight>)',
      inputs: [{ input: 'vaultTokenInput', inputIndex: 0 }, { input: 'vaultStateInput', inputIndex: 1 }, { input: 'walletInput', inputIndex: 2 }],
      outputs: [{ output: 'releasePayout', outputIndex: 0 }, { output: 'releaseVaultTokens', outputIndex: 1 }, { output: 'releaseVaultState', outputIndex: 2 }],
    },
    finalReleaseTransaction: {
      ...view('Vault emptied', 'Released the remainder; the vault ended.', 'release'),
      locktime: '$(<blockHeight>)',
      inputs: [{ input: 'vaultTokenInput', inputIndex: 0 }, { input: 'vaultStateInput', inputIndex: 1 }, { input: 'walletInput', inputIndex: 2 }],
      outputs: [{ output: 'finalPayout', outputIndex: 0 }],
    },
    reclaimTransaction: {
      ...view('Mint coin reclaimed', 'Moved the mint coin back to the fund wallet.', 'vault'),
      inputs: [{ input: 'reclaimInput', inputIndex: 0 }],
      outputs: [{ output: 'reclaimOutput', outputIndex: 0 }],
    },
    prepareFeeCoinTransaction: {
      ...view('Fee coin prepared', 'Made a plain coin at output 0.', 'fund'),
      inputs: [],
      outputs: [{ output: 'walletCoin', outputIndex: 0 }],
    },
    sweepTransaction: {
      ...view('Swept', 'Sent satoshis to another address.', 'send'),
      inputs: [],
      outputs: [{ output: 'sweepOutput', outputIndex: 0 }],
    },
  },
  inputs: {
    mintCoinInput: { ...view('Mint coin', 'The funded TokenVault_Mint coin; its transaction hash becomes the token category.', 'vault'), valueSatoshis: '$(<mintCoinSatoshis>)', token: null, unlockingScript: 'mintUnlock' },
    reclaimInput: { ...view('Mint coin', 'The unused TokenVault_Mint coin.', 'vault'), valueSatoshis: '$(<mintCoinSatoshis>)', token: null, unlockingScript: 'reclaimUnlock' },
    vaultTokenInput: {
      ...view('Vault token coin', 'The fungible tokens locked in the vault.', 'vault'),
      valueSatoshis: String(DUST), token: { category: TOKEN, amount: '$(<vaultTokens>)', nft: null }, sequenceNumber: 4294967294, unlockingScript: 'releaseUnlock',
    },
    vaultStateInput: {
      ...view('Vault state NFT', 'The state NFT: release height, halving height and reward.', 'vault'),
      valueSatoshis: String(DUST), token: { category: '$(<stateCategory>)', amount: null, nft: { capability: IMMUTABLE, commitment: '$(stateHex)' } }, sequenceNumber: 4294967294, unlockingScript: 'releaseUnlock',
    },
    walletInput: { ...view('Fee coin', 'A plain coin of the fund wallet that pays the fee; the payout is built on it.', 'fund'), valueSatoshis: '$(<walletSatoshis>)', token: null, unlockingScript: 'fundUnlock' },
  },
  outputs: {
    mintFundingOutput: { ...view('Mint coin', 'Satoshis locked to the TokenVault_Mint covenant.', 'vault'), lockingScript: 'mintContract', valueSatoshis: '$(<mintSatoshis>)', token: null },
    mintVaultTokens: {
      ...view('Vault tokens', 'The supply locked in the vault.', 'vault'), lockingScript: 'vault', valueSatoshis: String(DUST),
      token: { category: TOKEN, amount: '$(<lockAmount>)', nft: null },
    },
    mintVaultState: {
      ...view('Vault state', 'The first state NFT.', 'vault'), lockingScript: 'vault', valueSatoshis: String(DUST),
      token: { category: TOKEN, amount: null, nft: { capability: IMMUTABLE, commitment: '$(mintStateHex)' } },
    },
    mintChange: { ...view('Change', 'The rest of the mint coin back to the fund wallet.', 'fund'), lockingScript: 'fundWallet', valueSatoshis: '$(<mintCoinSatoshis> <2000> OP_SUB <minerFee> OP_SUB)', token: null },
    releasePayout: {
      ...view('Released tokens', 'The released tokens, paid to the fund.', 'release'), lockingScript: 'fundWallet', valueSatoshis: '$(<walletSatoshis> <minerFee> OP_SUB)',
      token: { category: TOKEN, amount: '$(releaseAmount)', nft: null },
    },
    releaseVaultTokens: {
      ...view('Vault tokens', 'The tokens still locked.', 'vault'), lockingScript: 'vault', valueSatoshis: String(DUST),
      token: { category: TOKEN, amount: '$(<vaultTokens> releaseAmount OP_SUB)', nft: null },
    },
    releaseVaultState: {
      ...view('Vault state', 'The next state NFT, computed by the template.', 'vault'), lockingScript: 'vault', valueSatoshis: String(DUST),
      token: { category: '$(<nextStateCategory>)', amount: null, nft: { capability: IMMUTABLE, commitment: '$(nextStateHex)' } },
    },
    finalPayout: {
      ...view('Remaining tokens', 'Every token that is left, paid to the fund.', 'release'), lockingScript: 'fundWallet', valueSatoshis: '$(<walletSatoshis> <2000> OP_ADD <minerFee> OP_SUB)',
      token: { category: TOKEN, amount: '$(<vaultTokens>)', nft: null },
    },
    reclaimOutput: { ...view('Reclaimed', 'The mint coin returned to the fund wallet.', 'fund'), lockingScript: 'fundWallet', valueSatoshis: '$(<mintCoinSatoshis> <minerFee> OP_SUB)', token: null },
    sweepOutput: { ...view('Recipient', 'Satoshis sent out of the fund wallet.', 'send'), lockingScript: 'recipient', valueSatoshis: '$(<transferredSatoshis>)', token: null },
    walletCoin: { ...view('Fee coin', 'A plain coin of the fund wallet.', 'fund'), lockingScript: 'fundWallet', valueSatoshis: '$(<coinSatoshis>)', token: null },
    walletReceive: { ...view('Receive', 'Satoshis received into the fund wallet.', 'receive'), lockingScript: 'fundWallet', valueSatoshis: '$(<transferredSatoshis>)', token: null },
    walletChange: { ...view('Change', 'Change returned to the fund wallet.', 'receive'), lockingScript: 'fundWallet' },
  },
  lockingScripts: {
    fundWallet: {
      ...view('Fund wallet', 'Pay to public key hash of the fund key.', 'fund'), lockingType: 'p2pkh', lockingBytecode: 'fundLock', unlockingBytecode: 'fundUnlock',
      roles: { fund: { state: { secrets: ['fundKey'] }, balance: { satoshis: true, fungibleTokens: true, nonfungibleTokens: true }, selectable: true } },
    },
    mintContract: {
      ...view('TokenVault_Mint', 'The original mint covenant: one genesis input, three outputs, tokens locked as the fund chooses.', 'vault'), lockingType: 'p2sh', lockingBytecode: 'mintRedeem',
      roles: {
        fund: {
          state: { secrets: ['fundKey'] }, selectable: false, balance: { satoshis: 0n, fungibleTokens: 0n, nonfungibleTokens: 0 },
          actions: [{ action: 'mint', role: 'fund', secrets: [{ fundKey: null }] }, { action: 'reclaim', role: 'fund', secrets: [{ fundKey: null }] }],
        },
      },
    },
    vault: {
      ...view('TokenVault_Release', 'The original release covenant with this halving length. Holds the token coin and the state NFT.', 'vault'), lockingType: 'p2sh', lockingBytecode: 'vaultRedeem',
      state: { variables: ['halvingLength'] },
      roles: {
        fund: {
          state: { secrets: ['fundKey'] }, selectable: false, balance: { satoshis: 0n, fungibleTokens: 0n, nonfungibleTokens: 0 },
          actions: [{ action: 'release', role: 'fund', secrets: [{ fundKey: null }] }, { action: 'finalRelease', role: 'fund', secrets: [{ fundKey: null }] }],
        },
      },
    },
    recipient: { ...view('Recipient', 'Any locking script chosen by the sender.', 'send'), lockingType: 'p2s', lockingBytecode: 'recipientLock', selectable: false },
  },
  scripts: {
    fundLock: 'OP_DUP OP_HASH160 <$(<fundKey.public_key> OP_HASH160)> OP_EQUALVERIFY OP_CHECKSIG',
    fundUnlock: '<fundKey.schnorr_signature.all_outputs> <fundKey.public_key>',
    recipientLock: '$(<recipientLockingScript>)',
    // Compiled bodies of the original contracts, untouched.
    mintBody: '0x' + mint.bodyHex,
    releaseBody: '0x' + release.bodyHex,
    // Constructor arguments, last argument pushed first: TokenVault_Mint(fund), TokenVault_Release(fund, halvingLength).
    mintRedeem: '<fundKey.public_key> mintBody',
    vaultRedeem: '<halvingLength> <fundKey.public_key> releaseBody',
    // Function arguments, last argument pushed first. mint(sig, amount, lockAmount, blockHeight, reward) is function 1, spend(sig) is function 0.
    mintUnlock: '<reward> <startHeight> <lockAmount> <lockAmount> <fundKey.schnorr_signature.all_outputs> OP_1',
    reclaimUnlock: '<fundKey.schnorr_signature.all_outputs> OP_0',
    releaseUnlock: '<blockHeight> <fundKey.schnorr_signature.all_outputs>',
    // Whether the release crosses the next halving, exactly as TokenVault_Release.release() decides it.
    halvingNow: '<blockHeight> <halvingHeight> OP_SUB OP_1ADD <halvingLength> OP_GREATERTHANOREQUAL',
    nextReleaseHeight: 'halvingNow OP_IF <halvingHeight> <halvingLength> OP_ADD OP_ELSE <blockHeight> OP_ENDIF',
    nextHalvingHeight: 'halvingNow OP_IF <halvingHeight> <halvingLength> OP_ADD OP_ELSE <halvingHeight> OP_ENDIF',
    nextReward: 'halvingNow OP_IF <currentReward> OP_2 OP_DIV OP_1 OP_MAX OP_ELSE <currentReward> OP_ENDIF',
    releaseAmount: 'nextReleaseHeight <releaseHeight> OP_SUB halvingNow OP_NOT OP_IF OP_1ADD OP_ENDIF <currentReward> OP_MUL',
    hexByte,
    // The 24 byte commitment of the state coin being spent, rebuilt from its three numbers.
    stateNow: '<releaseHeight> <8> OP_NUM2BIN <halvingHeight> <8> OP_NUM2BIN OP_CAT <currentReward> <8> OP_NUM2BIN OP_CAT',
    stateHex: hexOf('stateNow'),
    nextStateHex: hexOf('nextState'),
    mintStateHex: hexOf('mintState'),
    nextState: 'nextReleaseHeight <8> OP_NUM2BIN nextHalvingHeight <8> OP_NUM2BIN OP_CAT nextReward <8> OP_NUM2BIN OP_CAT',
    mintState: '<startHeight> <8> OP_NUM2BIN <startHeight> <8> OP_NUM2BIN OP_CAT <reward> <8> OP_NUM2BIN OP_CAT',
  },
  constants: {
    minerFee: { ...view('Miner fee', 'Satoshis left to miners by a covenant transaction.'), type: 'satoshis', value: 2000n },
  },
  variables: {
    fundKey: variable('Fund key', 'The private key of the fund. Its public key is a constructor argument of both covenants.', 'private_key'),
    halvingLength: variable('Halving length', 'Blocks between reward halvings (constructor argument of the vault).', 'integer'),
    tokenCategory: variable('Token category', 'The category of the vault token and its state NFT.', 'token_category'),
    stateCategory: variable('State NFT category', 'The category of the state NFT being spent. Equal to the token category until the first release.', 'token_category'),
    nextStateCategory: variable('Next state NFT category', 'The transaction hash of the fee coin: the next state NFT is a genesis on it.', 'token_category'),
    releaseHeight: variable('Release height', 'First field of the state NFT being spent: the height releases continue from.', 'integer'),
    halvingHeight: variable('Halving height', 'Second field of the state NFT being spent: the height the current halving period started at.', 'integer'),
    currentReward: variable('Current reward', 'Third field of the state NFT being spent: tokens released per block now.', 'token_amount'),
    blockHeight: variable('Release up to', 'Release up to this block height. Must not exceed the chain height.', 'integer'),
    vaultTokens: variable('Vault tokens', 'Fungible token amount on the vault token coin being spent.', 'token_amount'),
    walletSatoshis: variable('Fee coin value', 'Satoshis on the wallet coin that pays the fee.', 'satoshis'),
    mintSatoshis: variable('Mint coin value', 'Satoshis sent to the mint covenant.', 'satoshis'),
    mintCoinSatoshis: variable('Mint coin value', 'Satoshis on the mint coin being spent.', 'satoshis'),
    lockAmount: variable('Locked supply', 'Fungible tokens minted and locked in the vault.', 'token_amount'),
    startHeight: variable('Start height', 'Block height the release schedule starts at.', 'integer'),
    reward: variable('Initial reward', 'Tokens released per block before the first halving.', 'token_amount'),
    recipientLockingScript: variable('Recipient', 'Where swept satoshis go.', 'locking_script'),
    transferredSatoshis: variable('Amount', 'Satoshis to send.', 'satoshis'),
    coinSatoshis: variable('Coin value', 'Satoshis in each prepared fee coin.', 'satoshis'),
  },
  icons: ['vault', 'fund', 'release', 'send', 'receive'].map((name) => ({ name, hash: '0000000000000000000000' })),
};
export default tokenVaultTemplate;
