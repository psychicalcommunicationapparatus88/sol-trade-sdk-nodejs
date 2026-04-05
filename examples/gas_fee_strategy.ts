/**
 * Gas Fee Strategy Example
 *
 * This example demonstrates how to configure gas fee strategy
 * for optimal transaction landing.
 */

import { GasFeeStrategy } from 'sol-trade-sdk';

async function main() {
  // Create gas fee strategy
  const gasFeeStrategy = new GasFeeStrategy();

  // Set global fee strategy
  // Parameters:
  // - computeUnitPrice: base compute unit price (micro-lamports)
  // - computeUnitLimit: maximum compute units
  // - priorityFee: priority fee in lamports
  // - rentExemptBalance: rent-exempt balance for accounts
  // - slippageBps: slippage in basis points
  // - tipBps: tip percentage in basis points
  gasFeeStrategy.setGlobalFeeStrategy(150000, 150000, 500000, 500000, 0.001, 0.001);

  console.log('Gas fee strategy configured:');
  console.log(`  Compute unit price: ${gasFeeStrategy.computeUnitPrice}`);
  console.log(`  Compute unit limit: ${gasFeeStrategy.computeUnitLimit}`);
  console.log(`  Priority fee: ${gasFeeStrategy.priorityFee}`);

  // You can also set individual parameters
  gasFeeStrategy.setComputeUnitPrice(200000);
  gasFeeStrategy.setPriorityFee(600000);

  console.log('\nUpdated gas fee strategy:');
  console.log(`  Compute unit price: ${gasFeeStrategy.computeUnitPrice}`);
  console.log(`  Priority fee: ${gasFeeStrategy.priorityFee}`);
}

main().catch(console.error);
