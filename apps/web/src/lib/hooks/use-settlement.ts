import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../api-client';
import { toast } from 'sonner';

/**
 * Hook to request settlement for a payment intent
 */
export function useSettlement() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: { intentId: string; autoWithdraw?: boolean }) => {
      const response = await apiClient.requestSettlement(data.intentId, data.autoWithdraw || false);
      if (!response.success || !response.data) {
        throw new Error(response.error?.message || 'Settlement failed');
      }
      return response.data;
    },
    onSuccess: (data) => {
      // Invalidate pending settlements query
      queryClient.invalidateQueries({ queryKey: ['admin', 'settlements', 'pending'] });
      // Invalidate agent payments
      queryClient.invalidateQueries({ queryKey: ['agent-payments'] });
      toast.success(`Payment settled! Transaction: ${data.txId.substring(0, 10)}...`);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Settlement failed');
    },
  });
}

