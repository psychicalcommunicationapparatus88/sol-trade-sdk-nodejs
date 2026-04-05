/**
 * Security module for Sol Trade SDK
 *
 * Provides secure key storage and input validation
 */

export {
  SecureKeyStorage,
  SecureKeyError,
  KeyNotAvailableError,
  signWithKeypair,
  type KeyMetadata,
} from './secure-key';

export {
  ValidationError,
  KNOWN_PROGRAM_IDS,
  validateRpcUrl,
  validateProgramId,
  validateAmount,
  validateSlippage,
  validatePubkey,
  validateMintPair,
  validateTransactionSize,
  validateSignature,
} from './validators';
