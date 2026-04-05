/**
 * SPL Token utilities for Sol Trade SDK
 * Provides token account management, mint operations, and instruction building.
 */

import {
  PublicKey,
  TransactionInstruction,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
} from '@solana/web3.js';

// ===== Token Program IDs =====

/**
 * SPL Token Program ID
 */
export const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');

/**
 * SPL Token 2022 Program ID
 */
export const TOKEN_2022_PROGRAM_ID = new PublicKey('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb');

/**
 * Associated Token Account Program ID
 */
export const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');

// ===== Token Account Types =====

/**
 * Token account state
 */
export enum AccountState {
  Uninitialized = 0,
  Initialized = 1,
  Frozen = 2,
}

/**
 * Token account information
 */
export interface TokenAccount {
  address: PublicKey;
  mint: PublicKey;
  owner: PublicKey;
  amount: bigint;
  delegate?: PublicKey;
  state: AccountState;
  isNative?: bigint;
  delegatedAmount: bigint;
  closeAuthority?: PublicKey;
  tokenProgram: PublicKey;
}

/**
 * Mint account information
 */
export interface Mint {
  address: PublicKey;
  mintAuthority?: PublicKey;
  supply: bigint;
  decimals: number;
  isInitialized: boolean;
  freezeAuthority?: PublicKey;
  tokenProgram: PublicKey;
}

/**
 * Token account layout sizes
 */
export const TOKEN_ACCOUNT_SIZE = 165;
export const MINT_SIZE = 82;
export const MULTISIG_SIZE = 355;

// ===== Token Instruction Builder =====

/**
 * Instruction types for SPL Token program
 */
export enum TokenInstruction {
  InitializeMint = 0,
  InitializeAccount = 1,
  InitializeMultisig = 2,
  Transfer = 3,
  Approve = 4,
  Revoke = 5,
  SetAuthority = 6,
  MintTo = 7,
  Burn = 8,
  CloseAccount = 9,
  FreezeAccount = 10,
  ThawAccount = 11,
  TransferChecked = 12,
  ApproveChecked = 13,
  MintToChecked = 14,
  BurnChecked = 15,
  InitializeAccount2 = 16,
  SyncNative = 17,
  InitializeAccount3 = 18,
  InitializeMultisig2 = 19,
  InitializeMint2 = 20,
  GetAccountDataSize = 21,
  InitializeImmutableOwner = 22,
  AmountToUiAmount = 23,
  UiAmountToAmount = 24,
  InitializeMintCloseAuthority = 25,
  CreateNativeMint = 29,
  InitializeNonTransferableMint = 27,
  InitializePermanentDelegate = 35,
}

/**
 * Authority types for SetAuthority instruction
 */
export enum AuthorityType {
  MintTokens = 0,
  FreezeAccount = 1,
  AccountOwner = 2,
  CloseAccount = 3,
}

/**
 * Builder for SPL Token instructions
 */
export class TokenInstructionBuilder {
  /**
   * Create InitializeMint instruction
   */
  static initializeMint(
    mint: PublicKey,
    decimals: number,
    mintAuthority: PublicKey,
    freezeAuthority: PublicKey | null,
    tokenProgram: PublicKey = TOKEN_PROGRAM_ID
  ): TransactionInstruction {
    const keys = [
      { pubkey: mint, isSigner: false, isWritable: true },
      { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
    ];

    const data = Buffer.alloc(67);
    data.writeUInt8(TokenInstruction.InitializeMint, 0);
    data.writeUInt8(decimals, 1);
    data.writeUInt8(1, 2); // Mint authority option
    data.set(mintAuthority.toBytes(), 3);
    data.writeUInt8(freezeAuthority ? 1 : 0, 35);
    if (freezeAuthority) {
      data.set(freezeAuthority.toBytes(), 36);
    }

    return new TransactionInstruction({
      keys,
      programId: tokenProgram,
      data,
    });
  }

  /**
   * Create InitializeAccount instruction
   */
  static initializeAccount(
    account: PublicKey,
    mint: PublicKey,
    owner: PublicKey,
    tokenProgram: PublicKey = TOKEN_PROGRAM_ID
  ): TransactionInstruction {
    const keys = [
      { pubkey: account, isSigner: false, isWritable: true },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: owner, isSigner: false, isWritable: false },
      { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
    ];

    const data = Buffer.from([TokenInstruction.InitializeAccount]);

    return new TransactionInstruction({
      keys,
      programId: tokenProgram,
      data,
    });
  }

  /**
   * Create Transfer instruction
   */
  static transfer(
    source: PublicKey,
    destination: PublicKey,
    owner: PublicKey,
    amount: bigint,
    multiSigners: PublicKey[] = [],
    tokenProgram: PublicKey = TOKEN_PROGRAM_ID
  ): TransactionInstruction {
    const keys = [
      { pubkey: source, isSigner: false, isWritable: true },
      { pubkey: destination, isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: multiSigners.length === 0, isWritable: false },
      ...multiSigners.map((signer) => ({
        pubkey: signer,
        isSigner: true,
        isWritable: false,
      })),
    ];

    const data = Buffer.alloc(9);
    data.writeUInt8(TokenInstruction.Transfer, 0);
    data.writeBigUInt64LE(amount, 1);

    return new TransactionInstruction({
      keys,
      programId: tokenProgram,
      data,
    });
  }

  /**
   * Create TransferChecked instruction
   */
  static transferChecked(
    source: PublicKey,
    mint: PublicKey,
    destination: PublicKey,
    owner: PublicKey,
    amount: bigint,
    decimals: number,
    multiSigners: PublicKey[] = [],
    tokenProgram: PublicKey = TOKEN_PROGRAM_ID
  ): TransactionInstruction {
    const keys = [
      { pubkey: source, isSigner: false, isWritable: true },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: destination, isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: multiSigners.length === 0, isWritable: false },
      ...multiSigners.map((signer) => ({
        pubkey: signer,
        isSigner: true,
        isWritable: false,
      })),
    ];

    const data = Buffer.alloc(10);
    data.writeUInt8(TokenInstruction.TransferChecked, 0);
    data.writeBigUInt64LE(amount, 1);
    data.writeUInt8(decimals, 9);

    return new TransactionInstruction({
      keys,
      programId: tokenProgram,
      data,
    });
  }

  /**
   * Create MintTo instruction
   */
  static mintTo(
    mint: PublicKey,
    destination: PublicKey,
    authority: PublicKey,
    amount: bigint,
    multiSigners: PublicKey[] = [],
    tokenProgram: PublicKey = TOKEN_PROGRAM_ID
  ): TransactionInstruction {
    const keys = [
      { pubkey: mint, isSigner: false, isWritable: true },
      { pubkey: destination, isSigner: false, isWritable: true },
      { pubkey: authority, isSigner: multiSigners.length === 0, isWritable: false },
      ...multiSigners.map((signer) => ({
        pubkey: signer,
        isSigner: true,
        isWritable: false,
      })),
    ];

    const data = Buffer.alloc(9);
    data.writeUInt8(TokenInstruction.MintTo, 0);
    data.writeBigUInt64LE(amount, 1);

    return new TransactionInstruction({
      keys,
      programId: tokenProgram,
      data,
    });
  }

  /**
   * Create Burn instruction
   */
  static burn(
    account: PublicKey,
    mint: PublicKey,
    owner: PublicKey,
    amount: bigint,
    multiSigners: PublicKey[] = [],
    tokenProgram: PublicKey = TOKEN_PROGRAM_ID
  ): TransactionInstruction {
    const keys = [
      { pubkey: account, isSigner: false, isWritable: true },
      { pubkey: mint, isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: multiSigners.length === 0, isWritable: false },
      ...multiSigners.map((signer) => ({
        pubkey: signer,
        isSigner: true,
        isWritable: false,
      })),
    ];

    const data = Buffer.alloc(9);
    data.writeUInt8(TokenInstruction.Burn, 0);
    data.writeBigUInt64LE(amount, 1);

    return new TransactionInstruction({
      keys,
      programId: tokenProgram,
      data,
    });
  }

  /**
   * Create Approve instruction
   */
  static approve(
    account: PublicKey,
    delegate: PublicKey,
    owner: PublicKey,
    amount: bigint,
    multiSigners: PublicKey[] = [],
    tokenProgram: PublicKey = TOKEN_PROGRAM_ID
  ): TransactionInstruction {
    const keys = [
      { pubkey: account, isSigner: false, isWritable: true },
      { pubkey: delegate, isSigner: false, isWritable: false },
      { pubkey: owner, isSigner: multiSigners.length === 0, isWritable: false },
      ...multiSigners.map((signer) => ({
        pubkey: signer,
        isSigner: true,
        isWritable: false,
      })),
    ];

    const data = Buffer.alloc(9);
    data.writeUInt8(TokenInstruction.Approve, 0);
    data.writeBigUInt64LE(amount, 1);

    return new TransactionInstruction({
      keys,
      programId: tokenProgram,
      data,
    });
  }

  /**
   * Create Revoke instruction
   */
  static revoke(
    account: PublicKey,
    owner: PublicKey,
    multiSigners: PublicKey[] = [],
    tokenProgram: PublicKey = TOKEN_PROGRAM_ID
  ): TransactionInstruction {
    const keys = [
      { pubkey: account, isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: multiSigners.length === 0, isWritable: false },
      ...multiSigners.map((signer) => ({
        pubkey: signer,
        isSigner: true,
        isWritable: false,
      })),
    ];

    const data = Buffer.from([TokenInstruction.Revoke]);

    return new TransactionInstruction({
      keys,
      programId: tokenProgram,
      data,
    });
  }

  /**
   * Create CloseAccount instruction
   */
  static closeAccount(
    account: PublicKey,
    destination: PublicKey,
    owner: PublicKey,
    multiSigners: PublicKey[] = [],
    tokenProgram: PublicKey = TOKEN_PROGRAM_ID
  ): TransactionInstruction {
    const keys = [
      { pubkey: account, isSigner: false, isWritable: true },
      { pubkey: destination, isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: multiSigners.length === 0, isWritable: false },
      ...multiSigners.map((signer) => ({
        pubkey: signer,
        isSigner: true,
        isWritable: false,
      })),
    ];

    const data = Buffer.from([TokenInstruction.CloseAccount]);

    return new TransactionInstruction({
      keys,
      programId: tokenProgram,
      data,
    });
  }

  /**
   * Create SyncNative instruction (for WSOL accounts)
   */
  static syncNative(
    nativeAccount: PublicKey,
    tokenProgram: PublicKey = TOKEN_PROGRAM_ID
  ): TransactionInstruction {
    const keys = [{ pubkey: nativeAccount, isSigner: false, isWritable: true }];

    const data = Buffer.from([TokenInstruction.SyncNative]);

    return new TransactionInstruction({
      keys,
      programId: tokenProgram,
      data,
    });
  }
}

// ===== Token Utilities =====

/**
 * Token utility functions
 */
export class TokenUtil {
  /**
   * Calculate associated token account address
   */
  static async getAssociatedTokenAddress(
    mint: PublicKey,
    owner: PublicKey,
    _allowOwnerOffCurve: boolean = false,
    tokenProgram: PublicKey = TOKEN_PROGRAM_ID,
    associatedTokenProgram: PublicKey = ASSOCIATED_TOKEN_PROGRAM_ID
  ): Promise<PublicKey> {
    const [address] = await PublicKey.findProgramAddress(
      [owner.toBuffer(), tokenProgram.toBuffer(), mint.toBuffer()],
      associatedTokenProgram
    );
    return address;
  }

  /**
   * Create associated token account idempotent instruction
   */
  static createAssociatedTokenAccountIdempotentInstruction(
    payer: PublicKey,
    associatedToken: PublicKey,
    owner: PublicKey,
    mint: PublicKey,
    tokenProgram: PublicKey = TOKEN_PROGRAM_ID,
    associatedTokenProgram: PublicKey = ASSOCIATED_TOKEN_PROGRAM_ID
  ): TransactionInstruction {
    const keys = [
      { pubkey: payer, isSigner: true, isWritable: true },
      { pubkey: associatedToken, isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: false, isWritable: false },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: tokenProgram, isSigner: false, isWritable: false },
      { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
    ];

    // Instruction data: 1 = CreateIdempotent
    const data = Buffer.from([1]);

    return new TransactionInstruction({
      keys,
      programId: associatedTokenProgram,
      data,
    });
  }

  /**
   * Create associated token account instruction
   */
  static createAssociatedTokenAccountInstruction(
    payer: PublicKey,
    associatedToken: PublicKey,
    owner: PublicKey,
    mint: PublicKey,
    tokenProgram: PublicKey = TOKEN_PROGRAM_ID,
    associatedTokenProgram: PublicKey = ASSOCIATED_TOKEN_PROGRAM_ID
  ): TransactionInstruction {
    const keys = [
      { pubkey: payer, isSigner: true, isWritable: true },
      { pubkey: associatedToken, isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: false, isWritable: false },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: tokenProgram, isSigner: false, isWritable: false },
      { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
    ];

    // Instruction data: 0 = Create
    const data = Buffer.from([0]);

    return new TransactionInstruction({
      keys,
      programId: associatedTokenProgram,
      data,
    });
  }

  /**
   * Check if a token is a wrapped SOL (WSOL) token
   */
  static isWrappedSol(mint: PublicKey): boolean {
    return mint.equals(WSOL_MINT);
  }

  /**
   * Convert token amount to UI amount (with decimals)
   */
  static toUiAmount(amount: bigint, decimals: number): number {
    return Number(amount) / Math.pow(10, decimals);
  }

  /**
   * Convert UI amount to token amount (with decimals)
   */
  static fromUiAmount(uiAmount: number, decimals: number): bigint {
    return BigInt(Math.floor(uiAmount * Math.pow(10, decimals)));
  }

  /**
   * Format token amount for display
   */
  static formatAmount(amount: bigint, decimals: number, maxDecimals: number = 6): string {
    const uiAmount = this.toUiAmount(amount, decimals);
    return uiAmount.toLocaleString('en-US', {
      maximumFractionDigits: maxDecimals,
    });
  }
}

// ===== Common Token Mints =====

/**
 * Wrapped SOL mint
 */
export const WSOL_MINT = new PublicKey('So11111111111111111111111111111111111111112');

/**
 * Native SOL mint (for Token-2022)
 */
export const NATIVE_MINT = new PublicKey('So11111111111111111111111111111111111111111');

/**
 * USDC mint
 */
export const USDC_MINT = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');

/**
 * USDT mint
 */
export const USDT_MINT = new PublicKey('Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB');

/**
 * Common token decimals
 */
export const TOKEN_DECIMALS = {
  SOL: 9,
  WSOL: 9,
  USDC: 6,
  USDT: 6,
} as const;
