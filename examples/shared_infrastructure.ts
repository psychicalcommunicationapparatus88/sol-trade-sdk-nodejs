/**
 * Shared Infrastructure Example
 *
 * This example demonstrates how to share infrastructure across multiple wallets.
 * The infrastructure (RPC client, SWQOS clients) is created once and shared.
 */

import {
  InfrastructureConfig,
  TradingInfrastructure,
  TradingClient,
  SwqosConfig,
  SwqosType,
  SwqosRegion,
} from 'sol-trade-sdk';
import { Keypair } from '@solana/web3.js';

async function main() {
  const rpcUrl = process.env.RPC_URL || 'https://api.mainnet-beta.solana.com';

  // Configure SWQoS services
  const swqosConfigs: SwqosConfig[] = [
    { type: SwqosType.DEFAULT, url: rpcUrl },
    { type: SwqosType.JITO, uuid: 'your_uuid', region: SwqosRegion.FRANKFURT },
    { type: SwqosType.BLOXROUTE, apiToken: 'your_api_token', region: SwqosRegion.FRANKFURT },
  ];

  // Create infrastructure once (expensive operation)
  const infraConfig = new InfrastructureConfig({
    rpcUrl,
    swqosConfigs,
  });
  const infrastructure = await TradingInfrastructure.new(infraConfig);
  console.log('Infrastructure created successfully!');

  // Create multiple clients sharing the same infrastructure (fast)
  const payer1 = Keypair.generate();
  const payer2 = Keypair.generate();
  const payer3 = Keypair.generate();

  const client1 = TradingClient.fromInfrastructure(payer1, infrastructure, true);
  const client2 = TradingClient.fromInfrastructure(payer2, infrastructure, true);
  const client3 = TradingClient.fromInfrastructure(payer3, infrastructure, true);

  console.log(`Client 1: ${client1.payerPubkey}`);
  console.log(`Client 2: ${client2.payerPubkey}`);
  console.log(`Client 3: ${client3.payerPubkey}`);

  // All clients share the same RPC and SWQoS connections
  console.log('All clients share the same infrastructure!');
}

main().catch(console.error);
