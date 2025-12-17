import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../api-client';

export interface PendingPayment {
  intentId: string;
  agentId: string;
  agentAddress: string;
  sourceChain: string;
  sourceToken: string;
  amount: string;
  amountUSD: number;
  paymentAddress: string;
  txHash?: string;
  blockNumber?: number;
  detectedAt: Date;
  createdAt: Date;
  expiresAt: Date;
}

/**
 * Hook to fetch pending settlements
 */
export function useAdminSettlements(options?: {
  enabled?: boolean;
  refetchInterval?: number;
}) {
  return useQuery({
    queryKey: ['admin', 'settlements', 'pending'],
    queryFn: async () => {
      const response = await apiClient.getPendingSettlements();
      if (!response.success || !response.data) {
        throw new Error(response.error?.message || 'Failed to fetch pending settlements');
      }
      return response.data;
    },
    enabled: options?.enabled !== false,
    refetchInterval: options?.refetchInterval || 30000, // 30 seconds
    staleTime: 10000, // 10 seconds
  });
}

/**
 * Hook to batch settle payments
 */
export function useBatchSettle() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: { intentIds: string[]; autoWithdraw?: boolean }) => {
      const response = await apiClient.batchSettle(data.intentIds, data.autoWithdraw);
      if (!response.success || !response.data) {
        throw new Error(response.error?.message || 'Batch settlement failed');
      }
      return response.data;
    },
    onSuccess: () => {
      // Invalidate pending settlements query
      queryClient.invalidateQueries({ queryKey: ['admin', 'settlements', 'pending'] });
    },
  });
}

