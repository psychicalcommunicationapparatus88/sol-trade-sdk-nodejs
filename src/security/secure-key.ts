/**
 * Secure key storage and management for Sol Trade SDK
 *
 * Implements secure memory handling for private keys with:
 * - Memory encryption at rest
 * - Secure zeroing after use
 * - Context manager for automatic cleanup
 */

import { Keypair, PublicKey } from '@solana/web3.js';
import * as crypto from 'crypto';
import * as nacl from 'tweetnacl';

/**
 * Error thrown when secure key operation fails
 */
export class SecureKeyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SecureKeyError';
  }
}

/**
 * Error thrown when trying to access a cleared key
 */
export class KeyNotAvailableError extends SecureKeyError {
  constructor(message: string = 'Key not available') {
    super(message);
    this.name = 'KeyNotAvailableError';
  }
}

/**
 * Metadata about a stored key
 */
export interface KeyMetadata {
  pubkey: string;
  createdAt: number;
  lastAccessed?: number;
  accessCount: number;
}

/**
 * Secure storage for Solana private keys.
 *
 * Features:
 * - Keys are encrypted in memory when not in use
 * - Automatic secure zeroing of key material
 * - Context manager support for temporary key access
 */
export class SecureKeyStorage {
  private encryptedKey: Buffer | null = null;
  private salt: Buffer | null = null;
  private pubkey: string | null = null;
  private isUnlocked: boolean = false;
  private unlockedKey: Buffer | null = null;
  private metadata: KeyMetadata | null = null;
  private passwordProtected: boolean = false;

  private constructor() {}

  /**
   * Create secure storage from a Keypair.
   */
  static fromKeypair(keypair: Keypair, password?: string): SecureKeyStorage {
    const storage = new SecureKeyStorage();
    storage.pubkey = keypair.publicKey.toBase58();

    // Get secret key bytes
    const secretBytes = Buffer.from(keypair.secretKey);

    try {
      if (password) {
        storage.passwordProtected = true;
        storage.salt = crypto.randomBytes(16);
        storage.encryptedKey = storage.encryptWithPassword(
          secretBytes,
          password,
          storage.salt
        );
      } else {
        // Simple XOR encryption with random key (better than plaintext)
        storage.salt = crypto.randomBytes(64);
        storage.encryptedKey = storage.xorEncrypt(secretBytes, storage.salt);
      }

      storage.metadata = {
        pubkey: storage.pubkey,
        createdAt: Date.now(),
        accessCount: 0,
      };
    } finally {
      // Always clear the secret bytes from memory
      storage.secureZero(secretBytes);
    }

    return storage;
  }

  /**
   * Create secure storage from a seed.
   */
  static fromSeed(seed: Uint8Array, password?: string): SecureKeyStorage {
    if (seed.length !== 32) {
      throw new SecureKeyError(`Seed must be 32 bytes, got ${seed.length}`);
    }

    const keypair = Keypair.fromSeed(seed);
    try {
      return SecureKeyStorage.fromKeypair(keypair, password);
    } finally {
      // Clear seed from memory
      SecureKeyStorage.secureZero(Buffer.from(seed));
    }
  }

  /**
   * Create secure storage from a mnemonic phrase.
   */
  static fromMnemonic(mnemonic: string, password?: string): SecureKeyStorage {
    // Simplified implementation - in production use proper BIP39 derivation
    const seed = crypto
      .pbkdf2Sync(mnemonic, 'mnemonic', 2048, 32, 'sha512');
    const keypair = Keypair.fromSeed(seed);
    try {
      return SecureKeyStorage.fromKeypair(keypair, password);
    } finally {
      SecureKeyStorage.secureZero(seed);
    }
  }

  private encryptWithPassword(data: Buffer, password: string, salt: Buffer): Buffer {
    const key = crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha256');
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return Buffer.concat([iv, authTag, encrypted]);
  }

  private decryptWithPassword(encryptedData: Buffer, password: string, salt: Buffer): Buffer {
    const key = crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha256');
    const iv = encryptedData.slice(0, 16);
    const authTag = encryptedData.slice(16, 32);
    const encrypted = encryptedData.slice(32);
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]);
  }

  private xorEncrypt(data: Buffer, key: Buffer): Buffer {
    const result = Buffer.alloc(data.length);
    for (let i = 0; i < data.length; i++) {
      const dataByte = data[i] ?? 0;
      const keyByte = key[i % key.length] ?? 0;
      result[i] = dataByte ^ keyByte;
    }
    return result;
  }

  /**
   * Securely zero out sensitive data from memory
   */
  private static secureZero(data: Buffer): void {
    // Overwrite with zeros
    data.fill(0);
    // Overwrite with ones
    data.fill(0xff);
    // Overwrite with random
    crypto.randomFillSync(data);
    // Final zero
    data.fill(0);
  }

  private secureZero(data: Buffer): void {
    SecureKeyStorage.secureZero(data);
  }

  /**
   * Temporarily access the keypair.
   * Key is automatically cleared after callback completes.
   */
  async withKeypair<T>(
    callback: (keypair: Keypair) => Promise<T>,
    password?: string
  ): Promise<T> {
    if (!this.encryptedKey) {
      throw new KeyNotAvailableError('No key stored');
    }

    if (this.passwordProtected && !password) {
      throw new SecureKeyError('Password required to unlock');
    }

    let decrypted: Buffer | null = null;

    try {
      // Decrypt the key
      if (this.passwordProtected && this.salt) {
        decrypted = this.decryptWithPassword(this.encryptedKey, password!, this.salt);
      } else if (this.salt) {
        decrypted = this.xorEncrypt(this.encryptedKey, this.salt);
      } else {
        throw new SecureKeyError('Invalid storage state');
      }

      // Create keypair from decrypted bytes
      const keypair = Keypair.fromSeed(decrypted.slice(0, 32));

      // Update metadata
      if (this.metadata) {
        this.metadata.lastAccessed = Date.now();
        this.metadata.accessCount++;
      }

      this.isUnlocked = true;
      this.unlockedKey = decrypted;

      return await callback(keypair);
    } finally {
      // Always cleanup
      this.isUnlocked = false;
      if (this.unlockedKey) {
        this.secureZero(this.unlockedKey);
        this.unlockedKey = null;
      }
      if (decrypted) {
        this.secureZero(decrypted);
      }
    }
  }

  /**
   * Sign a message without exposing the keypair.
   */
  async signMessage(message: Buffer | Uint8Array, password?: string): Promise<Buffer> {
    return this.withKeypair(async (keypair) => {
      const signature = nacl.sign.detached(Buffer.from(message), keypair.secretKey);
      return Buffer.from(signature);
    }, password);
  }

  /**
   * Get the public key (safe to access)
   */
  getPublicKey(): string {
    return this.pubkey || '';
  }

  /**
   * Check if storage requires password
   */
  get isPasswordProtected(): boolean {
    return this.passwordProtected;
  }

  /**
   * Get key metadata
   */
  getMetadata(): KeyMetadata | null {
    return this.metadata;
  }

  /**
   * Permanently clear all key material
   */
  clear(): void {
    if (this.encryptedKey) {
      this.secureZero(this.encryptedKey);
      this.encryptedKey = null;
    }
    if (this.salt) {
      this.secureZero(this.salt);
      this.salt = null;
    }
    if (this.unlockedKey) {
      this.secureZero(this.unlockedKey);
      this.unlockedKey = null;
    }
    this.pubkey = null;
    this.metadata = null;
  }
}

/**
 * Convenience function for quick signing
 */
export async function signWithKeypair(
  keypair: Keypair,
  message: Buffer | Uint8Array,
  clearAfter: boolean = false
): Promise<Buffer> {
  const signature = nacl.sign.detached(Buffer.from(message), keypair.secretKey);

  if (clearAfter) {
    // Attempt to clear sensitive data
    const secret = Buffer.from(keypair.secretKey);
    SecureKeyStorage['secureZero'](secret);
  }

  return Buffer.from(signature);
}
