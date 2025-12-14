import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../api-client';
import type { PaymentIntent } from '@/types';

/**
 * Hook to fetch a single payment intent
 */
export function usePaymentIntent(intentId: string | null, options?: {
  refetchInterval?: number;
  enabled?: boolean;
}) {
  return useQuery({
    queryKey: ['payment-intent', intentId],
    queryFn: async () => {
      if (!intentId) throw new Error('Intent ID is required');
      const response = await apiClient.getPaymentIntent(intentId);
      if (!response.success || !response.data) {
        throw new Error(response.error?.message || 'Failed to fetch payment intent');
      }
      return response.data;
    },
    enabled: !!intentId && (options?.enabled !== false),
    refetchInterval: options?.refetchInterval || false,
    staleTime: 10000, // 10 seconds
  });
}

/**
 * Hook to create a new payment intent
 */
export function useCreatePaymentIntent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      agentAddress: string;
      amount: string;
      chain: string;
      metadata?: Record<string, any>;
    }) => {
      const response = await apiClient.createPaymentIntent(data);
      if (!response.success || !response.data) {
        throw new Error(response.error?.message || 'Failed to create payment intent');
      }
      return response.data;
    },
    onSuccess: (data) => {
      // Cache the newly created intent
      queryClient.setQueryData(['payment-intent', data.id], data);
    },
  });
}

/**
 * Hook to fetch agent's payment intents
 */
export function useAgentPayments(agentAddress: string | null, options?: {
  status?: string;
  limit?: number;
  offset?: number;
  enabled?: boolean;
}) {
  return useQuery({
    queryKey: ['agent-payments', agentAddress, options],
    queryFn: async () => {
      if (!agentAddress) throw new Error('Agent address is required');
      const response = await apiClient.getAgentPayments(agentAddress, {
        status: options?.status,
        limit: options?.limit,
        offset: options?.offset,
      });
      if (!response.success || !response.data) {
        throw new Error(response.error?.message || 'Failed to fetch payments');
      }
      return response.data;
    },
    enabled: !!agentAddress && (options?.enabled !== false),
    staleTime: 30000, // 30 seconds
  });
}

/**
 * Hook for real-time payment status updates
 * Polls the API at specified interval
 */
export function usePaymentStatus(intentId: string | null, options?: {
  pollInterval?: number;
  enabled?: boolean;
  onStatusChange?: (status: string) => void;
}) {
  const pollInterval = options?.pollInterval || 5000; // Default 5 seconds

  return useQuery({
    queryKey: ['payment-status', intentId],
    queryFn: async () => {
      if (!intentId) throw new Error('Intent ID is required');
      const response = await apiClient.getPaymentIntent(intentId);
      if (!response.success || !response.data) {
        throw new Error(response.error?.message || 'Failed to fetch payment status');
      }

      // Call status change callback if provided
      if (options?.onStatusChange && response.data.status) {
        options.onStatusChange(response.data.status);
      }

      return response.data;
    },
    enabled: !!intentId && (options?.enabled !== false),
    refetchInterval: pollInterval,
    staleTime: 0, // Always fetch fresh data
  });
}
