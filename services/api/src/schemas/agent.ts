import { z } from 'zod';

export const agentRegistrationSchema = z.object({
  body: z.object({
    stacksAddress: z.string().min(1),
    agentId: z.string().min(1).max(64),
    enabledChains: z.array(z.string()).min(1),
    minPaymentAmount: z.string().optional(),
    autoWithdraw: z.boolean().optional(),
    settlementPreference: z.enum(['usdh', 'stx']).optional(),
  }),
});

