/**
 * Bonding curve account for Pump.fun.
 * Based on sol-trade-sdk Rust implementation.
 */

import { PublicKey } from '@solana/web3.js';
import {
  getBuyTokenAmountFromSolAmount,
  getSellSolAmountFromTokenAmount,
  INITIAL_VIRTUAL_TOKEN_RESERVES,
  INITIAL_VIRTUAL_SOL_RESERVES,
  INITIAL_REAL_TOKEN_RESERVES,
  TOKEN_TOTAL_SUPPLY,
} from '../calc/pumpfun';

/**
 * Represents the bonding curve account for token pricing
 */
export class BondingCurveAccount {
  discriminator: number = 0;
  account: PublicKey = PublicKey.default;
  virtualTokenReserves: number = 0;
  virtualSolReserves: number = 0;
  realTokenReserves: number = 0;
  realSolReserves: number = 0;
  tokenTotalSupply: number = TOKEN_TOTAL_SUPPLY;
  complete: boolean = false;
  creator: PublicKey = PublicKey.default;
  isMayhemMode: boolean = false;
  isCashbackCoin: boolean = false;

  constructor(fields?: Partial<BondingCurveAccount>) {
    if (fields) {
      Object.assign(this, fields);
    }
  }

  /**
   * Create from dev trade data
   */
  static fromDevTrade(
    bondingCurve: PublicKey,
    mint: PublicKey,
    devTokenAmount: number,
    devSolAmount: number,
    creator: PublicKey,
    isMayhemMode: boolean = false,
    isCashbackCoin: boolean = false,
  ): BondingCurveAccount {
    return new BondingCurveAccount({
      discriminator: 0,
      account: bondingCurve,
      virtualTokenReserves: INITIAL_VIRTUAL_TOKEN_RESERVES - devTokenAmount,
      virtualSolReserves: INITIAL_VIRTUAL_SOL_RESERVES + devSolAmount,
      realTokenReserves: INITIAL_REAL_TOKEN_RESERVES - devTokenAmount,
      realSolReserves: devSolAmount,
      tokenTotalSupply: TOKEN_TOTAL_SUPPLY,
      complete: false,
      creator,
      isMayhemMode,
      isCashbackCoin,
    });
  }

  /**
   * Create from trade data
   */
  static fromTrade(
    bondingCurve: PublicKey,
    mint: PublicKey,
    creator: PublicKey,
    virtualTokenReserves: number,
    virtualSolReserves: number,
    realTokenReserves: number,
    realSolReserves: number,
    isMayhemMode: boolean = false,
    isCashbackCoin: boolean = false,
  ): BondingCurveAccount {
    return new BondingCurveAccount({
      discriminator: 0,
      account: bondingCurve,
      virtualTokenReserves,
      virtualSolReserves,
      realTokenReserves,
      realSolReserves,
      tokenTotalSupply: TOKEN_TOTAL_SUPPLY,
      complete: false,
      creator,
      isMayhemMode,
      isCashbackCoin,
    });
  }

  /**
   * Calculate tokens received for given SOL amount
   */
  getBuyPrice(amount: number): number {
    if (this.complete) {
      throw new Error('Curve is complete');
    }

    return getBuyTokenAmountFromSolAmount(
      this.virtualTokenReserves,
      this.virtualSolReserves,
      this.realTokenReserves,
      this.creator.toBytes(),
      amount,
    );
  }

  /**
   * Calculate SOL received for given token amount
   */
  getSellPrice(amount: number): number {
    if (this.complete) {
      throw new Error('Curve is complete');
    }

    return getSellSolAmountFromTokenAmount(
      this.virtualTokenReserves,
      this.virtualSolReserves,
      this.creator.toBytes(),
      amount,
    );
  }

  /**
   * Calculate current market cap in SOL
   */
  getMarketCapSol(): number {
    if (this.virtualTokenReserves === 0) {
      return 0;
    }

    const pricePerToken = this.virtualSolReserves / this.virtualTokenReserves;
    return (pricePerToken * this.tokenTotalSupply) / 1e9;
  }

  /**
   * Calculate price to buy out all remaining tokens
   */
  getBuyOutPrice(amount: number): number {
    if (this.complete) {
      throw new Error('Curve is complete');
    }

    // Rough estimate: current price * amount
    if (this.virtualTokenReserves === 0) {
      return 0;
    }

    const priceRatio = this.virtualSolReserves / this.virtualTokenReserves;
    return Math.floor(priceRatio * amount);
  }

  /**
   * Calculate the current token price in SOL.
   * 100% from Rust: src/common/bonding_curve.rs get_token_price
   */
  getTokenPrice(): number {
    const vSol = this.virtualSolReserves / 100_000_000.0;
    const vTokens = this.virtualTokenReserves / 100_000.0;
    if (vTokens === 0) {
      return 0.0;
    }
    return vSol / vTokens;
  }

  /**
   * Calculate the final market cap in SOL after all tokens are sold.
   * 100% from Rust: src/common/bonding_curve.rs get_final_market_cap_sol
   */
  getFinalMarketCapSol(feeBasisPoints: number = 95): bigint {
    const totalSellValue = this.getBuyOutPriceInternal(this.realTokenReserves, feeBasisPoints);
    const totalVirtualValue = BigInt(this.virtualSolReserves) + BigInt(totalSellValue);
    const totalVirtualTokens = BigInt(this.virtualTokenReserves) - BigInt(this.realTokenReserves);

    if (totalVirtualTokens === 0n) {
      return 0n;
    }

    return (BigInt(this.tokenTotalSupply) * totalVirtualValue) / totalVirtualTokens;
  }

  private getBuyOutPriceInternal(amount: number, feeBasisPoints: number): number {
    const solTokens = Math.max(amount, this.realSolReserves);

    if (this.virtualTokenReserves <= solTokens) {
      return 0;
    }

    const totalSellValue = Number((BigInt(solTokens) * BigInt(this.virtualSolReserves)) / (BigInt(this.virtualTokenReserves) - BigInt(solTokens))) + 1;
    const fee = Math.floor((totalSellValue * feeBasisPoints) / 10000);

    return totalSellValue + fee;
  }
}

// ===== Decoding Functions - from Rust: src/instruction/utils/pumpfun.rs =====

export const BONDING_CURVE_ACCOUNT_SIZE = 8 + 8 + 8 + 8 + 8 + 8 + 1 + 32 + 1 + 1; // 77 bytes after discriminator

/**
 * Decode a BondingCurveAccount from on-chain account data.
 * 100% from Rust: src/common/bonding_curve.rs
 */
export function decodeBondingCurveAccount(data: Buffer, account?: PublicKey): BondingCurveAccount | null {
  if (data.length < BONDING_CURVE_ACCOUNT_SIZE) {
    return null;
  }

  try {
    let offset = 0;

    // Check if data starts with discriminator (8 bytes)
    if (data.length >= 8 + BONDING_CURVE_ACCOUNT_SIZE) {
      // Skip discriminator
      offset = 8;
    }

    // virtual_token_reserves: u64
    const virtualTokenReserves = Number(data.readBigUInt64LE(offset));
    offset += 8;

    // virtual_sol_reserves: u64
    const virtualSolReserves = Number(data.readBigUInt64LE(offset));
    offset += 8;

    // real_token_reserves: u64
    const realTokenReserves = Number(data.readBigUInt64LE(offset));
    offset += 8;

    // real_sol_reserves: u64
    const realSolReserves = Number(data.readBigUInt64LE(offset));
    offset += 8;

    // token_total_supply: u64
    const tokenTotalSupply = Number(data.readBigUInt64LE(offset));
    offset += 8;

    // complete: bool
    const complete = data.readUInt8(offset) === 1;
    offset += 1;

    // creator: Pubkey (32 bytes)
    const creator = new PublicKey(data.subarray(offset, offset + 32));
    offset += 32;

    // is_mayhem_mode: bool
    const isMayhemMode = data.readUInt8(offset) === 1;
    offset += 1;

    // is_cashback_coin: bool
    const isCashbackCoin = data.readUInt8(offset) === 1;

    return new BondingCurveAccount({
      discriminator: 0,
      account: account ?? PublicKey.default,
      virtualTokenReserves,
      virtualSolReserves,
      realTokenReserves,
      realSolReserves,
      tokenTotalSupply,
      complete,
      creator,
      isMayhemMode,
      isCashbackCoin,
    });
  } catch {
    return null;
  }
}
