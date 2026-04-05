/**
 * Instruction builders for Sol Trade SDK
 */

import {
  PublicKey,
  TransactionInstruction,
  SYSVAR_RENT_PUBKEY,
  SystemProgram,
} from '@solana/web3.js';
import {
  TOKEN_PROGRAM,
  TOKEN_PROGRAM_2022,
  ASSOCIATED_TOKEN_PROGRAM,
  PUMPFUN_PROGRAM,
  PUMPSWAP_PROGRAM,
  PUMPFUN_DISCRIMINATORS,
  PUMPSWAP_DISCRIMINATORS,
  FEE_RECIPIENT,
  MAYHEM_FEE_RECIPIENTS,
} from '../constants';
import { randomBytes } from 'crypto';

/**
 * Find Program Address helper
 */
export function findProgramAddress(
  seeds: (Buffer | Uint8Array)[],
  programId: PublicKey
): [PublicKey, number] {
  const seedBuffers = seeds.map((s) => Buffer.from(s));
  return PublicKey.findProgramAddressSync(seedBuffers, programId);
}

/**
 * Get bonding curve PDA for PumpFun
 */
export function getBondingCurvePDA(mint: PublicKey): PublicKey {
  const [pda] = findProgramAddress(
    [Buffer.from('bonding-curve'), mint.toBuffer()],
    PUMPFUN_PROGRAM
  );
  return pda;
}

/**
 * Get bonding curve V2 PDA for PumpFun
 */
export function getBondingCurveV2PDA(mint: PublicKey): PublicKey {
  const [pda] = findProgramAddress(
    [Buffer.from('bonding-curve-v2'), mint.toBuffer()],
    PUMPFUN_PROGRAM
  );
  return pda;
}

/**
 * Get user volume accumulator PDA
 */
export function getUserVolumeAccumulatorPDA(user: PublicKey): PublicKey {
  const [pda] = findProgramAddress(
    [Buffer.from('user-volume-accumulator'), user.toBuffer()],
    PUMPFUN_PROGRAM
  );
  return pda;
}

/**
 * Get creator vault PDA
 */
export function getCreatorVaultPDA(creator: PublicKey): PublicKey {
  const [pda] = findProgramAddress(
    [Buffer.from('creator-vault'), creator.toBuffer()],
    PUMPFUN_PROGRAM
  );
  return pda;
}

/**
 * Get global account PDA
 */
export function getGlobalAccountPDA(): PublicKey {
  const [pda] = findProgramAddress(
    [Buffer.from('global')],
    PUMPFUN_PROGRAM
  );
  return pda;
}

/**
 * Get event authority PDA
 */
export function getEventAuthorityPDA(): PublicKey {
  const [pda] = findProgramAddress(
    [Buffer.from('__event_authority')],
    PUMPFUN_PROGRAM
  );
  return pda;
}

/**
 * Get associated token address
 */
export function getAssociatedTokenAddress(
  owner: PublicKey,
  mint: PublicKey,
  tokenProgram: PublicKey = TOKEN_PROGRAM
): PublicKey {
  const [ata] = findProgramAddress(
    [owner.toBuffer(), tokenProgram.toBuffer(), mint.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM
  );
  return ata;
}

/**
 * Get fee recipient based on mayhem mode
 * Uses cryptographically secure random selection
 */
export function getFeeRecipient(isMayhemMode: boolean): PublicKey {
  if (isMayhemMode) {
    // Use cryptographically secure randomness instead of Math.random()
    const randomIndex = randomBytes(1)[0] % MAYHEM_FEE_RECIPIENTS.length;
    return MAYHEM_FEE_RECIPIENTS[randomIndex];
  }
  return FEE_RECIPIENT;
}

/**
 * Create associated token account instruction
 */
export function createAssociatedTokenAccountInstruction(
  payer: PublicKey,
  owner: PublicKey,
  mint: PublicKey,
  tokenProgram: PublicKey = TOKEN_PROGRAM
): TransactionInstruction {
  const ata = getAssociatedTokenAddress(owner, mint, tokenProgram);

  const keys = [
    { pubkey: payer, isSigner: true, isWritable: true },
    { pubkey: ata, isSigner: false, isWritable: true },
    { pubkey: owner, isSigner: false, isWritable: false },
    { pubkey: mint, isSigner: false, isWritable: false },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    { pubkey: tokenProgram, isSigner: false, isWritable: false },
    { pubkey: ASSOCIATED_TOKEN_PROGRAM, isSigner: false, isWritable: false },
    { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
  ];

  return new TransactionInstruction({
    keys,
    programId: ASSOCIATED_TOKEN_PROGRAM,
    data: Buffer.alloc(0),
  });
}

/**
 * Build PumpFun buy instruction
 */
export function buildPumpFunBuyInstruction(params: {
  payer: PublicKey;
  mint: PublicKey;
  bondingCurve: PublicKey;
  associatedBondingCurve: PublicKey;
  userTokenAccount: PublicKey;
  creatorVault: PublicKey;
  tokenProgram: PublicKey;
  amountIn: number;
  minTokensOut: number;
  isMayhemMode: boolean;
  isCashbackCoin: boolean;
  useExactSolIn: boolean;
}): TransactionInstruction {
  const {
    payer,
    mint,
    bondingCurve,
    associatedBondingCurve,
    userTokenAccount,
    creatorVault,
    tokenProgram,
    amountIn,
    minTokensOut,
    isMayhemMode,
    isCashbackCoin,
    useExactSolIn,
  } = params;

  const globalAccount = getGlobalAccountPDA();
  const eventAuthority = getEventAuthorityPDA();
  const bondingCurveV2 = getBondingCurveV2PDA(mint);
  const userVolumeAccumulator = getUserVolumeAccumulatorPDA(payer);
  const feeRecipient = getFeeRecipient(isMayhemMode);

  // Build instruction data
  let data: Buffer;
  if (useExactSolIn) {
    // buy_exact_sol_in discriminator + spendable_sol_in (u64) + min_tokens_out (u64) + track_volume (2 bytes)
    data = Buffer.alloc(26);
    PUMPFUN_DISCRIMINATORS.BUY_EXACT_SOL_IN.copy(data, 0);
    data.writeBigUInt64LE(BigInt(amountIn), 8);
    data.writeBigUInt64LE(BigInt(minTokensOut), 16);
    // track_volume: Some(true) if cashback coin
    data[24] = 1; // Option: Some
    data[25] = isCashbackCoin ? 1 : 0;
  } else {
    // buy discriminator + token_amount (u64) + max_sol_cost (u64) + track_volume (2 bytes)
    data = Buffer.alloc(26);
    PUMPFUN_DISCRIMINATORS.BUY.copy(data, 0);
    // Token amount would be calculated from SOL input
    data.writeBigUInt64LE(BigInt(0), 8); // placeholder
    data.writeBigUInt64LE(BigInt(amountIn), 16);
    data[24] = 1;
    data[25] = isCashbackCoin ? 1 : 0;
  }

  const keys = [
    { pubkey: globalAccount, isSigner: false, isWritable: false },
    { pubkey: feeRecipient, isSigner: false, isWritable: true },
    { pubkey: mint, isSigner: false, isWritable: false },
    { pubkey: bondingCurve, isSigner: false, isWritable: true },
    { pubkey: associatedBondingCurve, isSigner: false, isWritable: true },
    { pubkey: userTokenAccount, isSigner: false, isWritable: true },
    { pubkey: payer, isSigner: true, isWritable: true },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    { pubkey: tokenProgram, isSigner: false, isWritable: false },
    { pubkey: creatorVault, isSigner: false, isWritable: true },
    { pubkey: eventAuthority, isSigner: false, isWritable: false },
    { pubkey: PUMPFUN_PROGRAM, isSigner: false, isWritable: false },
    { pubkey: getGlobalVolumeAccumulatorPDA(), isSigner: false, isWritable: true },
    { pubkey: userVolumeAccumulator, isSigner: false, isWritable: true },
    { pubkey: getFeeConfigPDA(), isSigner: false, isWritable: false },
    { pubkey: getFeeProgramPDA(), isSigner: false, isWritable: false },
    { pubkey: bondingCurveV2, isSigner: false, isWritable: false },
  ];

  return new TransactionInstruction({
    keys,
    programId: PUMPFUN_PROGRAM,
    data,
  });
}

/**
 * Build PumpFun sell instruction
 */
export function buildPumpFunSellInstruction(params: {
  payer: PublicKey;
  mint: PublicKey;
  bondingCurve: PublicKey;
  associatedBondingCurve: PublicKey;
  userTokenAccount: PublicKey;
  creatorVault: PublicKey;
  tokenProgram: PublicKey;
  tokenAmount: number;
  minSolOutput: number;
  isMayhemMode: boolean;
  isCashbackCoin: boolean;
}): TransactionInstruction {
  const {
    payer,
    mint,
    bondingCurve,
    associatedBondingCurve,
    userTokenAccount,
    creatorVault,
    tokenProgram,
    tokenAmount,
    minSolOutput,
    isMayhemMode,
    isCashbackCoin,
  } = params;

  const globalAccount = getGlobalAccountPDA();
  const eventAuthority = getEventAuthorityPDA();
  const bondingCurveV2 = getBondingCurveV2PDA(mint);
  const feeRecipient = getFeeRecipient(isMayhemMode);

  // Build instruction data
  const data = Buffer.alloc(24);
  PUMPFUN_DISCRIMINATORS.SELL.copy(data, 0);
  data.writeBigUInt64LE(BigInt(tokenAmount), 8);
  data.writeBigUInt64LE(BigInt(minSolOutput), 16);

  const keys = [
    { pubkey: globalAccount, isSigner: false, isWritable: false },
    { pubkey: feeRecipient, isSigner: false, isWritable: true },
    { pubkey: mint, isSigner: false, isWritable: false },
    { pubkey: bondingCurve, isSigner: false, isWritable: true },
    { pubkey: associatedBondingCurve, isSigner: false, isWritable: true },
    { pubkey: userTokenAccount, isSigner: false, isWritable: true },
    { pubkey: payer, isSigner: true, isWritable: true },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    { pubkey: creatorVault, isSigner: false, isWritable: true },
    { pubkey: tokenProgram, isSigner: false, isWritable: false },
    { pubkey: eventAuthority, isSigner: false, isWritable: false },
    { pubkey: PUMPFUN_PROGRAM, isSigner: false, isWritable: false },
    { pubkey: getFeeConfigPDA(), isSigner: false, isWritable: false },
    { pubkey: getFeeProgramPDA(), isSigner: false, isWritable: false },
  ];

  // Add user volume accumulator for cashback coins
  if (isCashbackCoin) {
    const userVolumeAccumulator = getUserVolumeAccumulatorPDA(payer);
    keys.push({ pubkey: userVolumeAccumulator, isSigner: false, isWritable: true });
  }

  // Add bonding curve v2
  keys.push({ pubkey: bondingCurveV2, isSigner: false, isWritable: false });

  return new TransactionInstruction({
    keys,
    programId: PUMPFUN_PROGRAM,
    data,
  });
}

// Helper PDAs
function getGlobalVolumeAccumulatorPDA(): PublicKey {
  const [pda] = findProgramAddress(
    [Buffer.from('global-volume-accumulator')],
    PUMPFUN_PROGRAM
  );
  return pda;
}

function getFeeConfigPDA(): PublicKey {
  const [pda] = findProgramAddress(
    [Buffer.from('fee-config')],
    PUMPFUN_PROGRAM
  );
  return pda;
}

function getFeeProgramPDA(): PublicKey {
  const [pda] = findProgramAddress(
    [Buffer.from('fee-program')],
    PUMPFUN_PROGRAM
  );
  return pda;
}

/**
 * Get pool PDA for PumpSwap
 */
export function getPoolPDA(baseMint: PublicKey, quoteMint: PublicKey): PublicKey {
  const [pda] = findProgramAddress(
    [Buffer.from('pool'), baseMint.toBuffer(), quoteMint.toBuffer()],
    PUMPSWAP_PROGRAM
  );
  return pda;
}

// ===== PumpSwap Instruction Builders =====

/**
 * Build PumpSwap swap instruction
 */
export function buildPumpSwapSwapInstruction(params: {
  payer: PublicKey;
  pool: PublicKey;
  baseMint: PublicKey;
  quoteMint: PublicKey;
  userBaseTokenAccount: PublicKey;
  userQuoteTokenAccount: PublicKey;
  baseVault: PublicKey;
  quoteVault: PublicKey;
  tokenProgram: PublicKey;
  amountIn: bigint;
  minimumAmountOut: bigint;
  isBuy: boolean;
}): TransactionInstruction {
  const {
    payer,
    pool,
    baseMint,
    quoteMint,
    userBaseTokenAccount,
    userQuoteTokenAccount,
    baseVault,
    quoteVault,
    tokenProgram,
    amountIn,
    minimumAmountOut,
    isBuy,
  } = params;

  // Build instruction data
  const data = Buffer.alloc(24);
  PUMPSWAP_DISCRIMINATORS.SWAP.copy(data, 0);
  data.writeBigUInt64LE(amountIn, 8);
  data.writeBigUInt64LE(minimumAmountOut, 16);

  const keys = [
    { pubkey: payer, isSigner: true, isWritable: true },
    { pubkey: pool, isSigner: false, isWritable: true },
    { pubkey: isBuy ? quoteMint : baseMint, isSigner: false, isWritable: false },
    { pubkey: isBuy ? baseMint : quoteMint, isSigner: false, isWritable: false },
    { pubkey: isBuy ? userQuoteTokenAccount : userBaseTokenAccount, isSigner: false, isWritable: true },
    { pubkey: isBuy ? userBaseTokenAccount : userQuoteTokenAccount, isSigner: false, isWritable: true },
    { pubkey: isBuy ? quoteVault : baseVault, isSigner: false, isWritable: true },
    { pubkey: isBuy ? baseVault : quoteVault, isSigner: false, isWritable: true },
    { pubkey: tokenProgram, isSigner: false, isWritable: false },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
  ];

  return new TransactionInstruction({
    keys,
    programId: PUMPSWAP_PROGRAM,
    data,
  });
}

/**
 * Build PumpSwap buy instruction
 */
export function buildPumpSwapBuyInstruction(params: {
  payer: PublicKey;
  pool: PublicKey;
  baseMint: PublicKey;
  quoteMint: PublicKey;
  userBaseTokenAccount: PublicKey;
  userQuoteTokenAccount: PublicKey;
  baseVault: PublicKey;
  quoteVault: PublicKey;
  tokenProgram: PublicKey;
  amountIn: bigint;
  minimumAmountOut: bigint;
}): TransactionInstruction {
  return buildPumpSwapSwapInstruction({ ...params, isBuy: true });
}

/**
 * Build PumpSwap sell instruction
 */
export function buildPumpSwapSellInstruction(params: {
  payer: PublicKey;
  pool: PublicKey;
  baseMint: PublicKey;
  quoteMint: PublicKey;
  userBaseTokenAccount: PublicKey;
  userQuoteTokenAccount: PublicKey;
  baseVault: PublicKey;
  quoteVault: PublicKey;
  tokenProgram: PublicKey;
  amountIn: bigint;
  minimumAmountOut: bigint;
}): TransactionInstruction {
  return buildPumpSwapSwapInstruction({ ...params, isBuy: false });
}

// ===== Bonk Instruction Builders =====

// Bonk Program and discriminators
const BONK_PROGRAM = new PublicKey('bonkQ4LHaM1G1hPpGeSpqAh3MCRtg1E3LiQtuYMLM4K');
const BONK_BUY_DISCRIMINATOR = Buffer.from([102, 6, 61, 18, 1, 218, 235, 234]);
const BONK_SELL_DISCRIMINATOR = Buffer.from([51, 230, 133, 164, 1, 127, 131, 173]);

/**
 * Build Bonk buy instruction
 */
export function buildBonkBuyInstruction(params: {
  payer: PublicKey;
  poolState: PublicKey;
  baseMint: PublicKey;
  quoteMint: PublicKey;
  baseVault: PublicKey;
  quoteVault: PublicKey;
  platformConfig: PublicKey;
  platformAssociatedAccount: PublicKey;
  creatorAssociatedAccount: PublicKey;
  globalConfig: PublicKey;
  userBaseTokenAccount: PublicKey;
  userQuoteTokenAccount: PublicKey;
  amountIn: bigint;
  minimumAmountOut: bigint;
}): TransactionInstruction {
  const {
    payer,
    poolState,
    baseMint,
    quoteMint,
    baseVault,
    quoteVault,
    platformConfig,
    platformAssociatedAccount,
    creatorAssociatedAccount,
    globalConfig,
    userBaseTokenAccount,
    userQuoteTokenAccount,
    amountIn,
    minimumAmountOut,
  } = params;

  const data = Buffer.alloc(24);
  BONK_BUY_DISCRIMINATOR.copy(data, 0);
  data.writeBigUInt64LE(amountIn, 8);
  data.writeBigUInt64LE(minimumAmountOut, 16);

  const keys = [
    { pubkey: poolState, isSigner: false, isWritable: true },
    { pubkey: baseMint, isSigner: false, isWritable: false },
    { pubkey: quoteMint, isSigner: false, isWritable: false },
    { pubkey: baseVault, isSigner: false, isWritable: true },
    { pubkey: quoteVault, isSigner: false, isWritable: true },
    { pubkey: platformConfig, isSigner: false, isWritable: false },
    { pubkey: platformAssociatedAccount, isSigner: false, isWritable: true },
    { pubkey: creatorAssociatedAccount, isSigner: false, isWritable: true },
    { pubkey: globalConfig, isSigner: false, isWritable: false },
    { pubkey: userBaseTokenAccount, isSigner: false, isWritable: true },
    { pubkey: userQuoteTokenAccount, isSigner: false, isWritable: true },
    { pubkey: payer, isSigner: true, isWritable: true },
    { pubkey: TOKEN_PROGRAM, isSigner: false, isWritable: false },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
  ];

  return new TransactionInstruction({
    keys,
    programId: BONK_PROGRAM,
    data,
  });
}

/**
 * Build Bonk sell instruction
 */
export function buildBonkSellInstruction(params: {
  payer: PublicKey;
  poolState: PublicKey;
  baseMint: PublicKey;
  quoteMint: PublicKey;
  baseVault: PublicKey;
  quoteVault: PublicKey;
  platformConfig: PublicKey;
  platformAssociatedAccount: PublicKey;
  creatorAssociatedAccount: PublicKey;
  globalConfig: PublicKey;
  userBaseTokenAccount: PublicKey;
  userQuoteTokenAccount: PublicKey;
  amountIn: bigint;
  minimumAmountOut: bigint;
}): TransactionInstruction {
  const data = Buffer.alloc(24);
  BONK_SELL_DISCRIMINATOR.copy(data, 0);
  data.writeBigUInt64LE(params.amountIn, 8);
  data.writeBigUInt64LE(params.minimumAmountOut, 16);

  const keys = [
    { pubkey: params.poolState, isSigner: false, isWritable: true },
    { pubkey: params.baseMint, isSigner: false, isWritable: false },
    { pubkey: params.quoteMint, isSigner: false, isWritable: false },
    { pubkey: params.baseVault, isSigner: false, isWritable: true },
    { pubkey: params.quoteVault, isSigner: false, isWritable: true },
    { pubkey: params.platformConfig, isSigner: false, isWritable: false },
    { pubkey: params.platformAssociatedAccount, isSigner: false, isWritable: true },
    { pubkey: params.creatorAssociatedAccount, isSigner: false, isWritable: true },
    { pubkey: params.globalConfig, isSigner: false, isWritable: false },
    { pubkey: params.userBaseTokenAccount, isSigner: false, isWritable: true },
    { pubkey: params.userQuoteTokenAccount, isSigner: false, isWritable: true },
    { pubkey: params.payer, isSigner: true, isWritable: true },
    { pubkey: TOKEN_PROGRAM, isSigner: false, isWritable: false },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
  ];

  return new TransactionInstruction({
    keys,
    programId: BONK_PROGRAM,
    data,
  });
}

// ===== Raydium CPMM Instruction Builders =====

const RAYDIUM_CPMM_PROGRAM = new PublicKey('CPMMoo8L3F4NbTuvAoiQ53Jx4JQk7e8mL8pF6WwQhUJi');
const RAYDIUM_CPMM_SWAP_DISCRIMINATOR = Buffer.from([248, 198, 158, 145, 225, 117, 135, 200]);

/**
 * Build Raydium CPMM swap instruction
 */
export function buildRaydiumCpmmSwapInstruction(params: {
  payer: PublicKey;
  ammConfig: PublicKey;
  poolState: PublicKey;
  inputTokenAccount: PublicKey;
  outputTokenAccount: PublicKey;
  inputVault: PublicKey;
  outputVault: PublicKey;
  inputTokenProgram: PublicKey;
  outputTokenProgram: PublicKey;
  inputMint: PublicKey;
  outputMint: PublicKey;
  observationState: PublicKey;
  amountIn: bigint;
  minimumAmountOut: bigint;
}): TransactionInstruction {
  const {
    payer,
    ammConfig,
    poolState,
    inputTokenAccount,
    outputTokenAccount,
    inputVault,
    outputVault,
    inputTokenProgram,
    outputTokenProgram,
    inputMint,
    outputMint,
    observationState,
    amountIn,
    minimumAmountOut,
  } = params;

  const data = Buffer.alloc(24);
  RAYDIUM_CPMM_SWAP_DISCRIMINATOR.copy(data, 0);
  data.writeBigUInt64LE(amountIn, 8);
  data.writeBigUInt64LE(minimumAmountOut, 16);

  const keys = [
    { pubkey: payer, isSigner: true, isWritable: true },
    { pubkey: new PublicKey('11111111111111111111111111111111'), isSigner: false, isWritable: false }, // authority
    { pubkey: ammConfig, isSigner: false, isWritable: false },
    { pubkey: poolState, isSigner: false, isWritable: true },
    { pubkey: inputTokenAccount, isSigner: false, isWritable: true },
    { pubkey: outputTokenAccount, isSigner: false, isWritable: true },
    { pubkey: inputVault, isSigner: false, isWritable: true },
    { pubkey: outputVault, isSigner: false, isWritable: true },
    { pubkey: inputTokenProgram, isSigner: false, isWritable: false },
    { pubkey: outputTokenProgram, isSigner: false, isWritable: false },
    { pubkey: inputMint, isSigner: false, isWritable: false },
    { pubkey: outputMint, isSigner: false, isWritable: false },
    { pubkey: observationState, isSigner: false, isWritable: true },
  ];

  return new TransactionInstruction({
    keys,
    programId: RAYDIUM_CPMM_PROGRAM,
    data,
  });
}

// ===== Raydium AMM V4 Instruction Builders =====

const RAYDIUM_AMM_V4_PROGRAM = new PublicKey('675kPX9MHTjS2zt1qfr1Nhd3wZwJhndG6fJqMkFLy5RU');
const RAYDIUM_AMM_V4_SWAP_DISCRIMINATOR = Buffer.from([248, 198, 158, 145, 225, 117, 135, 200]);

/**
 * Build Raydium AMM V4 swap instruction
 */
export function buildRaydiumAmmV4SwapInstruction(params: {
  payer: PublicKey;
  amm: PublicKey;
  ammAuthority: PublicKey;
  ammOpenOrders: PublicKey;
  ammTargetOrders: PublicKey;
  poolCoinTokenAccount: PublicKey;
  poolPcTokenAccount: PublicKey;
  serumProgram: PublicKey;
  serumMarket: PublicKey;
  serumBids: PublicKey;
  serumAsks: PublicKey;
  serumEventQueue: PublicKey;
  serumCoinVaultAccount: PublicKey;
  serumPcVaultAccount: PublicKey;
  serumVaultSigner: PublicKey;
  userSourceTokenAccount: PublicKey;
  userDestinationTokenAccount: PublicKey;
  amountIn: bigint;
  minimumAmountOut: bigint;
}): TransactionInstruction {
  const {
    payer,
    amm,
    ammAuthority,
    ammOpenOrders,
    ammTargetOrders,
    poolCoinTokenAccount,
    poolPcTokenAccount,
    serumProgram,
    serumMarket,
    serumBids,
    serumAsks,
    serumEventQueue,
    serumCoinVaultAccount,
    serumPcVaultAccount,
    serumVaultSigner,
    userSourceTokenAccount,
    userDestinationTokenAccount,
    amountIn,
    minimumAmountOut,
  } = params;

  const data = Buffer.alloc(24);
  RAYDIUM_AMM_V4_SWAP_DISCRIMINATOR.copy(data, 0);
  data.writeBigUInt64LE(amountIn, 8);
  data.writeBigUInt64LE(minimumAmountOut, 16);

  const keys = [
    { pubkey: amm, isSigner: false, isWritable: true },
    { pubkey: ammAuthority, isSigner: false, isWritable: false },
    { pubkey: ammOpenOrders, isSigner: false, isWritable: true },
    { pubkey: ammTargetOrders, isSigner: false, isWritable: true },
    { pubkey: poolCoinTokenAccount, isSigner: false, isWritable: true },
    { pubkey: poolPcTokenAccount, isSigner: false, isWritable: true },
    { pubkey: serumProgram, isSigner: false, isWritable: false },
    { pubkey: serumMarket, isSigner: false, isWritable: true },
    { pubkey: serumBids, isSigner: false, isWritable: true },
    { pubkey: serumAsks, isSigner: false, isWritable: true },
    { pubkey: serumEventQueue, isSigner: false, isWritable: true },
    { pubkey: serumCoinVaultAccount, isSigner: false, isWritable: true },
    { pubkey: serumPcVaultAccount, isSigner: false, isWritable: true },
    { pubkey: serumVaultSigner, isSigner: false, isWritable: false },
    { pubkey: userSourceTokenAccount, isSigner: false, isWritable: true },
    { pubkey: userDestinationTokenAccount, isSigner: false, isWritable: true },
    { pubkey: payer, isSigner: true, isWritable: false },
  ];

  return new TransactionInstruction({
    keys,
    programId: RAYDIUM_AMM_V4_PROGRAM,
    data,
  });
}

// ===== Meteora DAMM V2 Instruction Builders =====

const METEORA_DAMM_V2_PROGRAM = new PublicKey('Eo7WjKq67rjJQSZxSbjz3bH6qJiFv3z4hR5wT6y7U8v9');
const METEORA_DAMM_V2_SWAP_DISCRIMINATOR = Buffer.from([248, 198, 158, 145, 225, 117, 135, 200]);

/**
 * Build Meteora DAMM V2 swap instruction
 */
export function buildMeteoraDammV2SwapInstruction(params: {
  payer: PublicKey;
  pool: PublicKey;
  tokenAVault: PublicKey;
  tokenBVault: PublicKey;
  tokenAMint: PublicKey;
  tokenBMint: PublicKey;
  userSourceTokenAccount: PublicKey;
  userDestinationTokenAccount: PublicKey;
  tokenAProgram: PublicKey;
  tokenBProgram: PublicKey;
  amountIn: bigint;
  minimumAmountOut: bigint;
}): TransactionInstruction {
  const {
    payer,
    pool,
    tokenAVault,
    tokenBVault,
    tokenAMint,
    tokenBMint,
    userSourceTokenAccount,
    userDestinationTokenAccount,
    tokenAProgram,
    tokenBProgram,
    amountIn,
    minimumAmountOut,
  } = params;

  const data = Buffer.alloc(24);
  METEORA_DAMM_V2_SWAP_DISCRIMINATOR.copy(data, 0);
  data.writeBigUInt64LE(amountIn, 8);
  data.writeBigUInt64LE(minimumAmountOut, 16);

  const keys = [
    { pubkey: payer, isSigner: true, isWritable: true },
    { pubkey: pool, isSigner: false, isWritable: true },
    { pubkey: tokenAVault, isSigner: false, isWritable: true },
    { pubkey: tokenBVault, isSigner: false, isWritable: true },
    { pubkey: tokenAMint, isSigner: false, isWritable: false },
    { pubkey: tokenBMint, isSigner: false, isWritable: false },
    { pubkey: userSourceTokenAccount, isSigner: false, isWritable: true },
    { pubkey: userDestinationTokenAccount, isSigner: false, isWritable: true },
    { pubkey: tokenAProgram, isSigner: false, isWritable: false },
    { pubkey: tokenBProgram, isSigner: false, isWritable: false },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
  ];

  return new TransactionInstruction({
    keys,
    programId: METEORA_DAMM_V2_PROGRAM,
    data,
  });
}
