/**
 * Middleware trait definitions.
 * Based on sol-trade-sdk Rust implementation.
 */

import { TransactionInstruction, PublicKey, AccountMeta } from '@solana/web3.js';

/**
 * Instruction middleware interface
 * Used to modify, add or remove instructions before transaction execution
 */
export interface InstructionMiddleware {
  /** Middleware name */
  name(): string;

  /**
   * Process protocol instructions
   * @param protocolInstructions - Current instruction list
   * @param protocolName - Protocol name
   * @param isBuy - Whether the transaction is a buy transaction
   * @returns Modified instruction list
   */
  processProtocolInstructions(
    protocolInstructions: TransactionInstruction[],
    protocolName: string,
    isBuy: boolean,
  ): TransactionInstruction[];

  /**
   * Process full instructions
   * @param fullInstructions - Current instruction list
   * @param protocolName - Protocol name
   * @param isBuy - Whether the transaction is a buy transaction
   * @returns Modified instruction list
   */
  processFullInstructions(
    fullInstructions: TransactionInstruction[],
    protocolName: string,
    isBuy: boolean,
  ): TransactionInstruction[];

  /** Clone middleware */
  clone(): InstructionMiddleware;
}

/**
 * Middleware manager
 */
export class MiddlewareManager {
  private middlewares: InstructionMiddleware[] = [];

  /**
   * Create new middleware manager
   */
  constructor() {}

  /**
   * Add middleware
   */
  addMiddleware(middleware: InstructionMiddleware): this {
    this.middlewares.push(middleware);
    return this;
  }

  /**
   * Apply all middlewares to process protocol instructions
   */
  applyMiddlewaresProcessProtocolInstructions(
    protocolInstructions: TransactionInstruction[],
    protocolName: string,
    isBuy: boolean,
  ): TransactionInstruction[] {
    let result = protocolInstructions;
    for (const middleware of this.middlewares) {
      result = middleware.processProtocolInstructions(result, protocolName, isBuy);
      if (result.length === 0) {
        break;
      }
    }
    return result;
  }

  /**
   * Apply all middlewares to process full instructions
   */
  applyMiddlewaresProcessFullInstructions(
    fullInstructions: TransactionInstruction[],
    protocolName: string,
    isBuy: boolean,
  ): TransactionInstruction[] {
    let result = fullInstructions;
    for (const middleware of this.middlewares) {
      result = middleware.processFullInstructions(result, protocolName, isBuy);
      if (result.length === 0) {
        break;
      }
    }
    return result;
  }

  /**
   * Clone the manager
   */
  clone(): MiddlewareManager {
    const cloned = new MiddlewareManager();
    for (const mw of this.middlewares) {
      cloned.middlewares.push(mw.clone());
    }
    return cloned;
  }

  /**
   * Create manager with common middlewares
   */
  static withCommonMiddlewares(): MiddlewareManager {
    return new MiddlewareManager().addMiddleware(new LoggingMiddleware());
  }
}

/**
 * Logging middleware - Records instruction information
 */
export class LoggingMiddleware implements InstructionMiddleware {
  name(): string {
    return 'LoggingMiddleware';
  }

  processProtocolInstructions(
    protocolInstructions: TransactionInstruction[],
    protocolName: string,
    isBuy: boolean,
  ): TransactionInstruction[] {
    console.log(`-------------------[${this.name()}]-------------------`);
    console.log('process_protocol_instructions');
    console.log(`[${this.name()}] Instruction count: ${protocolInstructions.length}`);
    console.log(`[${this.name()}] Protocol name: ${protocolName}\n`);
    console.log(`[${this.name()}] Is buy: ${isBuy}`);
    for (let i = 0; i < protocolInstructions.length; i++) {
      const ix = protocolInstructions[i];
      if (!ix) continue;
      console.log(`Instruction ${i + 1}:`);
      console.log(`  ProgramID: ${ix.programId.toBase58()}`);
      console.log(`  Accounts: ${ix.keys.length}`);
      console.log(`  Data length: ${ix.data.length}\n`);
    }
    return protocolInstructions;
  }

  processFullInstructions(
    fullInstructions: TransactionInstruction[],
    protocolName: string,
    isBuy: boolean,
  ): TransactionInstruction[] {
    console.log(`-------------------[${this.name()}]-------------------`);
    console.log('process_full_instructions');
    console.log(`[${this.name()}] Instruction count: ${fullInstructions.length}`);
    console.log(`[${this.name()}] Protocol name: ${protocolName}\n`);
    console.log(`[${this.name()}] Is buy: ${isBuy}`);
    for (let i = 0; i < fullInstructions.length; i++) {
      const ix = fullInstructions[i];
      if (!ix) continue;
      console.log(`Instruction ${i + 1}:`);
      console.log(`  ProgramID: ${ix.programId.toBase58()}`);
      console.log(`  Accounts: ${ix.keys.length}`);
      console.log(`  Data length: ${ix.data.length}\n`);
    }
    return fullInstructions;
  }

  clone(): InstructionMiddleware {
    return new LoggingMiddleware();
  }
}

/**
 * Timer middleware - Measures execution time
 */
export class TimerMiddleware implements InstructionMiddleware {
  private enabled: boolean = true;

  name(): string {
    return 'TimerMiddleware';
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  processProtocolInstructions(
    protocolInstructions: TransactionInstruction[],
    protocolName: string,
    isBuy: boolean,
  ): TransactionInstruction[] {
    if (!this.enabled) return protocolInstructions;

    const start = Date.now();
    console.log(`[${this.name()}] Processing protocol instructions for ${protocolName} (buy: ${isBuy})`);
    console.log(`[${this.name()}] Processing time: ${Date.now() - start}ms`);
    return protocolInstructions;
  }

  processFullInstructions(
    fullInstructions: TransactionInstruction[],
    protocolName: string,
    isBuy: boolean,
  ): TransactionInstruction[] {
    if (!this.enabled) return fullInstructions;

    const start = Date.now();
    console.log(`[${this.name()}] Processing full instructions for ${protocolName} (buy: ${isBuy})`);
    console.log(`[${this.name()}] Processing time: ${Date.now() - start}ms`);
    return fullInstructions;
  }

  clone(): InstructionMiddleware {
    const copy = new TimerMiddleware();
    copy.enabled = this.enabled;
    return copy;
  }
}

/**
 * Validation middleware - Validates instructions before processing
 */
export class ValidationMiddleware implements InstructionMiddleware {
  constructor(
    private maxInstructions: number = 100,
    private maxDataSize: number = 10000,
  ) {}

  name(): string {
    return 'ValidationMiddleware';
  }

  private validate(instructions: TransactionInstruction[]): void {
    if (this.maxInstructions > 0 && instructions.length > this.maxInstructions) {
      throw new Error(`[${this.name()}] Too many instructions: ${instructions.length} > ${this.maxInstructions}`);
    }

    for (let i = 0; i < instructions.length; i++) {
      const ix = instructions[i];
      if (!ix) continue;
      if (this.maxDataSize > 0 && ix.data.length > this.maxDataSize) {
        throw new Error(`[${this.name()}] Instruction ${i} data too large: ${ix.data.length} > ${this.maxDataSize}`);
      }
    }
  }

  processProtocolInstructions(
    protocolInstructions: TransactionInstruction[],
    protocolName: string,
    isBuy: boolean,
  ): TransactionInstruction[] {
    this.validate(protocolInstructions);
    return protocolInstructions;
  }

  processFullInstructions(
    fullInstructions: TransactionInstruction[],
    protocolName: string,
    isBuy: boolean,
  ): TransactionInstruction[] {
    this.validate(fullInstructions);
    return fullInstructions;
  }

  clone(): InstructionMiddleware {
    return new ValidationMiddleware(this.maxInstructions, this.maxDataSize);
  }
}

/**
 * Filter middleware - Filters instructions based on program ID
 */
export class FilterMiddleware implements InstructionMiddleware {
  private allowedPrograms: Set<string>;

  constructor(
    programs: PublicKey[],
    private mode: 'allow' | 'block' = 'allow',
  ) {
    this.allowedPrograms = new Set(programs.map(p => p.toBase58()));
  }

  name(): string {
    return 'FilterMiddleware';
  }

  private filter(instructions: TransactionInstruction[]): TransactionInstruction[] {
    return instructions.filter(ix => {
      const programId = ix.programId.toBase58();
      const isAllowed = this.allowedPrograms.has(programId);
      return this.mode === 'allow' ? isAllowed : !isAllowed;
    });
  }

  processProtocolInstructions(
    protocolInstructions: TransactionInstruction[],
    protocolName: string,
    isBuy: boolean,
  ): TransactionInstruction[] {
    return this.filter(protocolInstructions);
  }

  processFullInstructions(
    fullInstructions: TransactionInstruction[],
    protocolName: string,
    isBuy: boolean,
  ): TransactionInstruction[] {
    return this.filter(fullInstructions);
  }

  clone(): InstructionMiddleware {
    const programs = Array.from(this.allowedPrograms).map(p => new PublicKey(p));
    return new FilterMiddleware(programs, this.mode);
  }
}

/**
 * Metrics middleware - Collects metrics about instruction processing
 */
export class MetricsMiddleware implements InstructionMiddleware {
  private instructionCounts: Map<string, number> = new Map();
  private totalInstructions: number = 0;
  private totalDataSize: number = 0;

  name(): string {
    return 'MetricsMiddleware';
  }

  private record(protocolName: string, instructions: TransactionInstruction[]): void {
    const current = this.instructionCounts.get(protocolName) || 0;
    this.instructionCounts.set(protocolName, current + instructions.length);
    this.totalInstructions += instructions.length;

    for (const ix of instructions) {
      this.totalDataSize += ix.data.length;
    }
  }

  processProtocolInstructions(
    protocolInstructions: TransactionInstruction[],
    protocolName: string,
    isBuy: boolean,
  ): TransactionInstruction[] {
    this.record(protocolName, protocolInstructions);
    return protocolInstructions;
  }

  processFullInstructions(
    fullInstructions: TransactionInstruction[],
    protocolName: string,
    isBuy: boolean,
  ): TransactionInstruction[] {
    this.record(protocolName, fullInstructions);
    return fullInstructions;
  }

  clone(): InstructionMiddleware {
    return new MetricsMiddleware();
  }

  /**
   * Get collected metrics
   */
  getMetrics(): {
    instructionCounts: Record<string, number>;
    totalInstructions: number;
    totalDataSize: number;
  } {
    return {
      instructionCounts: Object.fromEntries(this.instructionCounts),
      totalInstructions: this.totalInstructions,
      totalDataSize: this.totalDataSize,
    };
  }

  /**
   * Reset metrics
   */
  reset(): void {
    this.instructionCounts.clear();
    this.totalInstructions = 0;
    this.totalDataSize = 0;
  }
}

/**
 * Create manager with standard middlewares
 */
export function withStandardMiddlewares(): MiddlewareManager {
  return new MiddlewareManager()
    .addMiddleware(new ValidationMiddleware())
    .addMiddleware(new LoggingMiddleware())
    .addMiddleware(new TimerMiddleware());
}

/**
 * Create manager with all builtin middlewares
 */
export function withAllBuiltinMiddlewares(): MiddlewareManager {
  return new MiddlewareManager()
    .addMiddleware(new ValidationMiddleware())
    .addMiddleware(new LoggingMiddleware())
    .addMiddleware(new TimerMiddleware())
    .addMiddleware(new MetricsMiddleware());
}
