# Sol Trade SDK Node.js Examples

This directory contains examples demonstrating how to use the Sol Trade SDK for Node.js.

## Examples Summary

| Description | File | Run Command |
|-------------|------|-------------|
| Create and configure TradingClient instance | [trading_client.ts](trading_client.ts) | `npx ts-node examples/trading_client.ts` |
| Share infrastructure across multiple wallets | [shared_infrastructure.ts](shared_infrastructure.ts) | `npx ts-node examples/shared_infrastructure.ts` |
| PumpFun token sniping trading | [pumpfun_sniper_trading.ts](pumpfun_sniper_trading.ts) | `npx ts-node examples/pumpfun_sniper_trading.ts` |
| Gas fee strategy example | [gas_fee_strategy.ts](gas_fee_strategy.ts) | `npx ts-node examples/gas_fee_strategy.ts` |

## Environment Setup

Set the following environment variables before running examples:

```bash
export RPC_URL="https://api.mainnet-beta.solana.com"
# Or use Helius for better performance:
# export RPC_URL="https://mainnet.helius-rpc.com/?api-key=your_api_key"
```

## Quick Start

1. Install the SDK:
```bash
npm install sol-trade-sdk
```

2. Configure your keypair and settings

3. Run an example:
```bash
npx ts-node examples/trading_client.ts
```

## Important Notes

- Replace placeholder keypairs with your actual keypairs
- Configure SWQoS services with your API tokens for better transaction landing
- Test thoroughly before using on mainnet
- Monitor balances and transaction fees
