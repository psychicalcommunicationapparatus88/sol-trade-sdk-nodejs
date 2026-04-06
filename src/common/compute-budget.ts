/**
 * Compute Budget Manager - 100% port from Rust: src/trading/common/compute_budget_manager.rs
 * 
 * Provides utilities for managing compute budget instructions:
 * - Setting compute unit price
 * - Setting compute unit limit
 * - Caching for performance
 */

import { TransactionInstruction, PublicKey } from '@solana/web3.js';

// ===== Constants =====

const COMPUTE_BUDGET_PROGRAM_ID = new PublicKey('ComputeBudget111111111111111111111111111111');

// Instruction types for Compute Budget program
const COMPUTE_BUDGET_INSTRUCTIONS = {
  REQUEST_UNITS: 0,
  REQUEST_HEAP_FRAME: 1,
  SET_COMPUTE_UNIT_LIMIT: 2,
  SET_COMPUTE_UNIT_PRICE: 3,
} as const;

// ===== Cache =====

interface ComputeBudgetCacheKey {
  unitPrice: bigint;
  unitLimit: number;
}

const computeBudgetCache = new Map<string, TransactionInstruction[]>();

function getCacheKey(key: ComputeBudgetCacheKey): string {
  return `${key.unitPrice}:${key.unitLimit}`;
}

// ===== Instruction Builders =====

/**
 * Create Set Compute Unit Price instruction
 */
function setComputeUnitPrice(price: bigint): TransactionInstruction {
  const data = Buffer.alloc(9);
  data.writeUInt8(COMPUTE_BUDGET_INSTRUCTIONS.SET_COMPUTE_UNIT_PRICE, 0);
  data.writeBigUInt64LE(price, 1);
  
  return new TransactionInstruction({
    keys: [],
    programId: COMPUTE_BUDGET_PROGRAM_ID,
    data,
  });
}

/**
 * Create Set Compute Unit Limit instruction
 */
function setComputeUnitLimit(limit: number): TransactionInstruction {
  const data = Buffer.alloc(5);
  data.writeUInt8(COMPUTE_BUDGET_INSTRUCTIONS.SET_COMPUTE_UNIT_LIMIT, 0);
  data.writeUInt32LE(limit, 1);
  
  return new TransactionInstruction({
    keys: [],
    programId: COMPUTE_BUDGET_PROGRAM_ID,
    data,
  });
}

// ===== Public Functions =====

/**
 * Extend instructions array with compute budget instructions
 * Uses caching for performance
 * 100% from Rust: src/trading/common/compute_budget_manager.rs extend_compute_budget_instructions
 */
export function extendComputeBudgetInstructions(
  instructions: TransactionInstruction[],
  unitPrice: bigint,
  unitLimit: number
): void {
  const cacheKey: ComputeBudgetCacheKey = { unitPrice, unitLimit };
  const key = getCacheKey(cacheKey);
  
  let cachedInstructions = computeBudgetCache.get(key);
  
  if (!cachedInstructions) {
    cachedInstructions = [];
    
    if (unitPrice > BigInt(0)) {
      cachedInstructions.push(setComputeUnitPrice(unitPrice));
    }
    
    if (unitLimit > 0) {
      cachedInstructions.push(setComputeUnitLimit(unitLimit));
    }
    
    computeBudgetCache.set(key, cachedInstructions);
  }
  
  instructions.push(...cachedInstructions);
}

/**
 * Get compute budget instructions as array
 * 100% from Rust: src/trading/common/compute_budget_manager.rs compute_budget_instructions
 */
export function computeBudgetInstructions(
  unitPrice: bigint,
  unitLimit: number
): TransactionInstruction[] {
  const cacheKey: ComputeBudgetCacheKey = { unitPrice, unitLimit };
  const key = getCacheKey(cacheKey);
  
  let cachedInstructions = computeBudgetCache.get(key);
  
  if (!cachedInstructions) {
    cachedInstructions = [];
    
    if (unitPrice > BigInt(0)) {
      cachedInstructions.push(setComputeUnitPrice(unitPrice));
    }
    
    if (unitLimit > 0) {
      cachedInstructions.push(setComputeUnitLimit(unitLimit));
    }
    
    computeBudgetCache.set(key, cachedInstructions);
  }
  
  return [...cachedInstructions]; // Return copy
}

/**
 * Clear the compute budget cache
 */
export function clearComputeBudgetCache(): void {
  computeBudgetCache.clear();
}

// ===== Predefined Compute Budgets =====

export const COMPUTE_BUDGET_PRESETS = {
  LOW: { unitLimit: 100_000, unitPrice: BigInt(1_000) },
  MEDIUM: { unitLimit: 200_000, unitPrice: BigInt(10_000) },
  HIGH: { unitLimit: 400_000, unitPrice: BigInt(50_000) },
  VERY_HIGH: { unitLimit: 800_000, unitPrice: BigInt(100_000) },
  MAX: { unitLimit: 1_400_000, unitPrice: BigInt(200_000) },
} as const;
