import { z } from 'zod';

export const paymentIntentSchema = z.object({
  agentId: z.string().min(1),
  sourceChain: z.enum(['ethereum', 'arbitrum', 'base', 'polygon', 'optimism', 'solana', 'bitcoin', 'stacks']),
  sourceToken: z.enum(['ETH', 'USDC', 'USDT', 'WETH', 'WBTC', 'SOL', 'STX', 'USDh']),
  sourceTokenAddress: z.string().optional(),
  amount: z.string().min(1),
  expiresIn: z.number().positive().optional().default(3600), // seconds
});

export const quoteRequestSchema = z.object({
  paymentIntentId: z.string().uuid(),
});

