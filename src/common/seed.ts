/**
 * Seed and key derivation utilities for Sol Trade SDK
 * Provides mnemonic generation, seed derivation, and key pair management.
 */

import { PublicKey, Keypair } from '@solana/web3.js';
import * as crypto from 'crypto';

// ===== Constants =====

const BIP39_WORDLIST_SIZE = 2048;
const SEED_LENGTH = 64;

// ===== BIP39 Wordlist (simplified - first 256 words for demo, full implementation would have all 2048)
const BIP39_WORDS: string[] = [
  'abandon', 'ability', 'able', 'about', 'above', 'absent', 'absorb', 'abstract', 'absurd', 'abuse',
  'access', 'accident', 'account', 'accuse', 'achieve', 'acid', 'acoustic', 'acquire', 'across', 'act',
  'action', 'actor', 'actress', 'actual', 'adapt', 'add', 'addict', 'address', 'adjust', 'admit',
  'adult', 'advance', 'advice', 'aerobic', 'affair', 'afford', 'afraid', 'again', 'age', 'agent',
  'agree', 'ahead', 'aim', 'air', 'airport', 'aisle', 'alarm', 'album', 'alcohol', 'alert',
  'alien', 'all', 'alley', 'allow', 'almost', 'alone', 'alpha', 'already', 'also', 'alter',
  'always', 'amateur', 'amazing', 'among', 'amount', 'amused', 'analyst', 'anchor', 'ancient', 'anger',
  'angle', 'angry', 'animal', 'ankle', 'announce', 'annual', 'another', 'answer', 'antenna', 'antique',
  'anxiety', 'any', 'apart', 'apology', 'appear', 'apple', 'approve', 'april', 'arch', 'arctic',
  'area', 'arena', 'argue', 'arm', 'armed', 'armor', 'army', 'around', 'arrange', 'arrest',
  'arrive', 'arrow', 'art', 'artefact', 'artist', 'artwork', 'ask', 'aspect', 'assault', 'asset',
  'assist', 'assume', 'asthma', 'athlete', 'atom', 'attack', 'attend', 'attitude', 'attract', 'auction',
  'audit', 'august', 'aunt', 'author', 'auto', 'autumn', 'average', 'avocado', 'avoid', 'awake',
  'aware', 'away', 'awesome', 'awful', 'awkward', 'axis', 'baby', 'bachelor', 'bacon', 'badge',
  'bag', 'balance', 'balcony', 'ball', 'bamboo', 'banana', 'banner', 'bar', 'barely', 'bargain',
  'barrel', 'base', 'basic', 'basket', 'battle', 'beach', 'bean', 'beauty', 'because', 'become',
  'beef', 'before', 'begin', 'behave', 'behind', 'believe', 'below', 'belt', 'bench', 'benefit',
  'best', 'betray', 'better', 'between', 'beyond', 'bicycle', 'bid', 'bike', 'bind', 'biology',
  'bird', 'birth', 'bitter', 'black', 'blade', 'blame', 'blanket', 'blast', 'bleak', 'bless',
  'blind', 'blood', 'blossom', 'blouse', 'blue', 'blur', 'blush', 'board', 'boat', 'body',
  'boil', 'bomb', 'bone', 'bonus', 'book', 'boost', 'border', 'boring', 'borrow', 'boss',
  'bottom', 'bounce', 'box', 'boy', 'bracket', 'brain', 'brand', 'brass', 'brave', 'bread',
  'breeze', 'brick', 'bridge', 'brief', 'bright', 'brilliant', 'bring', 'british', 'broad', 'broken',
  'bronze', 'brother', 'brown', 'brush', 'bubble', 'buddy', 'budget', 'buffalo', 'build', 'bulb',
  'bulk', 'bullet', 'bundle', 'bunker', 'burden', 'burger', 'burst', 'bus', 'business', 'busy',
  'butter', 'buyer', 'buzz', 'cabbage', 'cabin', 'cable', 'cactus', 'cage', 'cake', 'call',
  'calm', 'camera', 'camp', 'can', 'canal', 'cancel', 'candy', 'cannon', 'canoe', 'canvas',
];

// ===== Derivation Path Types =====

/**
 * BIP44 derivation path components
 */
export interface DerivationPath {
  purpose: number;
  coinType: number;
  account: number;
  change: number;
  addressIndex: number;
}

/**
 * Parse a derivation path string
 * Format: m/purpose'/coin_type'/account'/change/address_index
 */
export function parseDerivationPath(path: string): DerivationPath {
  const parts = path.replace(/'/g, '').split('/').slice(1);

  if (parts.length < 2) {
    throw new Error('Invalid derivation path: must have at least purpose and coin_type');
  }

  return {
    purpose: parseInt(parts[0] ?? '44', 10),
    coinType: parseInt(parts[1] ?? '501', 10),
    account: parseInt(parts[2] || '0', 10),
    change: parseInt(parts[3] || '0', 10),
    addressIndex: parseInt(parts[4] || '0', 10),
  };
}

/**
 * Convert derivation path to string
 */
export function derivationPathToString(path: DerivationPath): string {
  return `m/${path.purpose}'/${path.coinType}'/${path.account}'/${path.change}/${path.addressIndex}`;
}

/**
 * Create a Solana derivation path
 */
export function createSolanaDerivationPath(
  account: number = 0,
  change: number = 0,
  addressIndex: number = 0
): DerivationPath {
  return {
    purpose: 44,
    coinType: 501, // Solana coin type
    account,
    change,
    addressIndex,
  };
}

// ===== Mnemonic Generation =====

/**
 * Generate a random mnemonic phrase
 * @param wordCount Number of words (12, 15, 18, 21, or 24)
 */
export function generateMnemonic(wordCount: number = 12): string {
  if (![12, 15, 18, 21, 24].includes(wordCount)) {
    throw new Error('Word count must be 12, 15, 18, 21, or 24');
  }

  const entropyBits = (wordCount * 32) / 3;
  const entropyBytes = entropyBits / 8;

  // Generate random entropy
  const entropy = crypto.randomBytes(entropyBytes);

  // Calculate checksum
  const hash = crypto.createHash('sha256').update(entropy).digest();
  const checksumBits = entropyBits / 32;
  const checksum = (hash[0] ?? 0) >> (8 - checksumBits);

  // Combine entropy and checksum
  const combined = Buffer.concat([entropy, Buffer.from([checksum])]);

  // Convert to words
  const words: string[] = [];
  const totalBits = entropyBits + checksumBits;

  for (let i = 0; i < totalBits; i += 11) {
    const byteIndex = Math.floor(i / 8);
    const bitOffset = i % 8;

    let value = 0;
    for (let j = 0; j < 11; j++) {
      const currentByteIndex = byteIndex + Math.floor((bitOffset + j) / 8);
      const currentBitOffset = (bitOffset + j) % 8;

      if (currentByteIndex < combined.length) {
        const byte = combined[currentByteIndex] ?? 0;
        const bit = (byte >> (7 - currentBitOffset)) & 1;
        value = (value << 1) | bit;
      }
    }

    const word = BIP39_WORDS[value % BIP39_WORDLIST_SIZE];
    if (word) {
      words.push(word);
    }
  }

  return words.join(' ');
}

/**
 * Validate a mnemonic phrase
 */
export function validateMnemonic(mnemonic: string): boolean {
  const words = mnemonic.trim().toLowerCase().split(/\s+/);

  if (![12, 15, 18, 21, 24].includes(words.length)) {
    return false;
  }

  // Check all words are in the wordlist
  for (const word of words) {
    if (!BIP39_WORDS.includes(word)) {
      return false;
    }
  }

  return true;
}

/**
 * Convert mnemonic to seed
 */
export function mnemonicToSeed(mnemonic: string, password: string = ''): Buffer {
  const salt = 'mnemonic' + password;
  return crypto.pbkdf2Sync(mnemonic, salt, 2048, SEED_LENGTH, 'sha512');
}

// ===== Seed Generation =====

/**
 * Seed generator for deterministic key derivation
 */
export class SeedGenerator {
  private seed: Buffer;

  constructor(seed: Buffer | string) {
    this.seed = typeof seed === 'string' ? Buffer.from(seed, 'hex') : seed;

    if (this.seed.length !== SEED_LENGTH) {
      throw new Error(`Seed must be ${SEED_LENGTH} bytes`);
    }
  }

  /**
   * Create from mnemonic
   */
  static fromMnemonic(mnemonic: string, password: string = ''): SeedGenerator {
    const seed = mnemonicToSeed(mnemonic, password);
    return new SeedGenerator(seed);
  }

  /**
   * Create from random bytes
   */
  static random(): SeedGenerator {
    const seed = crypto.randomBytes(SEED_LENGTH);
    return new SeedGenerator(seed);
  }

  /**
   * Get the seed bytes
   */
  getSeed(): Buffer {
    return Buffer.from(this.seed);
  }

  /**
   * Get seed as hex string
   */
  toHex(): string {
    return this.seed.toString('hex');
  }
}

// ===== Key Pair Types =====

/**
 * Extended key pair with derivation info
 */
export interface KeyPair {
  keypair: Keypair;
  publicKey: PublicKey;
  secretKey: Uint8Array;
  derivationPath?: DerivationPath;
}

/**
 * Create a KeyPair from a Solana Keypair
 */
export function createKeyPair(keypair: Keypair, derivationPath?: DerivationPath): KeyPair {
  return {
    keypair,
    publicKey: keypair.publicKey,
    secretKey: keypair.secretKey,
    derivationPath,
  };
}

/**
 * Generate a new random keypair
 */
export function generateKeyPair(): KeyPair {
  const keypair = Keypair.generate();
  return createKeyPair(keypair);
}

/**
 * Create keypair from seed and derivation path
 * Note: This is a simplified implementation. Full BIP44 derivation requires
 * proper hierarchical deterministic key derivation.
 */
export function deriveKeyPair(seed: Buffer, path: DerivationPath | string): KeyPair {
  const parsedPath = typeof path === 'string' ? parseDerivationPath(path) : path;

  // Simplified derivation - in production, use proper BIP44 derivation
  // This creates a deterministic keypair based on the seed and path
  const pathString = derivationPathToString(parsedPath);
  const derivedSeed = crypto
    .createHmac('sha512', seed)
    .update(pathString)
    .digest();

  // Use the first 32 bytes as the secret key
  const secretKey = derivedSeed.slice(0, 32);

  // Generate keypair from secret key (this is simplified)
  // In practice, you'd use proper Ed25519 key derivation
  const keypair = Keypair.fromSeed(secretKey);

  return createKeyPair(keypair, parsedPath);
}

/**
 * Derive multiple keypairs from a seed
 */
export function deriveKeyPairs(
  seed: Buffer,
  count: number,
  accountStart: number = 0
): KeyPair[] {
  const keypairs: KeyPair[] = [];

  for (let i = 0; i < count; i++) {
    const path = createSolanaDerivationPath(accountStart + i);
    keypairs.push(deriveKeyPair(seed, path));
  }

  return keypairs;
}

// ===== Wallet Utilities =====

/**
 * Wallet from mnemonic
 */
export interface Wallet {
  mnemonic: string;
  seed: Buffer;
  masterKey: KeyPair;
  accounts: KeyPair[];
}

/**
 * Create a wallet from mnemonic
 */
export function createWalletFromMnemonic(
  mnemonic: string,
  accountCount: number = 1
): Wallet {
  const seed = mnemonicToSeed(mnemonic);
  const masterKey = deriveKeyPair(seed, createSolanaDerivationPath(0));
  const accounts = deriveKeyPairs(seed, accountCount);

  return {
    mnemonic,
    seed,
    masterKey,
    accounts,
  };
}

/**
 * Generate a new wallet with random mnemonic
 */
export function generateWallet(wordCount: number = 12, accountCount: number = 1): Wallet {
  const mnemonic = generateMnemonic(wordCount);
  return createWalletFromMnemonic(mnemonic, accountCount);
}

// ===== Convenience Functions =====

/**
 * Load keypair from secret key bytes
 */
export function loadKeyPair(secretKey: Uint8Array | number[]): KeyPair {
  const keypair = Keypair.fromSecretKey(Uint8Array.from(secretKey));
  return createKeyPair(keypair);
}

/**
 * Load keypair from base58 encoded secret key
 */
export function loadKeyPairFromBase58(secretKeyBase58: string): KeyPair {
  // Note: This requires bs58 package
  // For now, we assume it's available
  try {
    const bs58 = require('bs58');
    const secretKey = bs58.decode(secretKeyBase58);
    return loadKeyPair(secretKey);
  } catch {
    throw new Error('bs58 package required for base58 decoding');
  }
}

/**
 * Export keypair to base58 encoded secret key
 */
export function exportKeyPairToBase58(keyPair: KeyPair): string {
  try {
    const bs58 = require('bs58');
    return bs58.encode(keyPair.secretKey);
  } catch {
    throw new Error('bs58 package required for base58 encoding');
  }
}
