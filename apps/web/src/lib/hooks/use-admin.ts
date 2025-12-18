import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../api-client';
import { toast } from 'sonner';

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
    onSuccess: (results) => {
      // Invalidate pending settlements query
      queryClient.invalidateQueries({ queryKey: ['admin', 'settlements', 'pending'] });
      const successCount = results.filter((r: { success: boolean }) => r.success).length;
      const failCount = results.length - successCount;
      if (failCount === 0) {
        toast.success(`Successfully settled ${successCount} payment(s)`);
      } else {
        toast.warning(`Settled ${successCount} payment(s), ${failCount} failed`);
      }
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Batch settlement failed');
    },
  });
}

