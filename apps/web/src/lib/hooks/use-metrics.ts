import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../api-client';

/**
 * Hook to fetch protocol metrics
 */
export function useProtocolMetrics(options?: {
  refetchInterval?: number;
  enabled?: boolean;
}) {
  return useQuery({
    queryKey: ['metrics', 'protocol'],
    queryFn: async () => {
      const response = await apiClient.getProtocolMetrics();
      if (!response.success || !response.data) {
        throw new Error(response.error?.message || 'Failed to fetch protocol metrics');
      }
      return response.data;
    },
    enabled: options?.enabled !== false,
    refetchInterval: options?.refetchInterval || 30000, // 30 seconds
    staleTime: 10000, // 10 seconds
  });
}

/**
 * Hook to fetch all user metrics
 */
export function useUserMetrics(params?: {
  minVolume?: number;
  minPayments?: number;
  sortBy?: 'volume' | 'payments' | 'fees' | 'lastPayment';
  sortOrder?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}, options?: {
  refetchInterval?: number;
  enabled?: boolean;
}) {
  return useQuery({
    queryKey: ['metrics', 'users', params],
    queryFn: async () => {
      const response = await apiClient.getUserMetrics(params);
      if (!response.success || !response.data) {
        throw new Error(response.error?.message || 'Failed to fetch user metrics');
      }
      return response.data;
    },
    enabled: options?.enabled !== false,
    refetchInterval: options?.refetchInterval || false,
    staleTime: 30000, // 30 seconds
  });
}

/**
 * Hook to fetch metrics for a specific user
 */
export function useUserMetric(agentAddress: string | null, options?: {
  refetchInterval?: number;
  enabled?: boolean;
}) {
  return useQuery({
    queryKey: ['metrics', 'user', agentAddress],
    queryFn: async () => {
      if (!agentAddress) throw new Error('Agent address is required');
      const response = await apiClient.getUserMetric(agentAddress);
      if (!response.success || !response.data) {
        throw new Error(response.error?.message || 'Failed to fetch user metrics');
      }
      return response.data;
    },
    enabled: !!agentAddress && (options?.enabled !== false),
    refetchInterval: options?.refetchInterval || 30000, // 30 seconds
    staleTime: 10000, // 10 seconds
  });
}

/**
 * Hook to fetch all fee metrics
 */
export function useFeeMetrics(params?: {
  agent?: string;
  chain?: string;
  fromDate?: string;
  toDate?: string;
  minFee?: number;
  page?: number;
  limit?: number;
}, options?: {
  refetchInterval?: number;
  enabled?: boolean;
}) {
  return useQuery({
    queryKey: ['metrics', 'fees', params],
    queryFn: async () => {
      const response = await apiClient.getFeeMetrics(params);
      if (!response.success || !response.data) {
        throw new Error(response.error?.message || 'Failed to fetch fee metrics');
      }
      return response.data;
    },
    enabled: options?.enabled !== false,
    refetchInterval: options?.refetchInterval || false,
    staleTime: 30000, // 30 seconds
  });
}

/**
 * Hook to fetch fee metrics for a specific intent
 */
export function useFeeMetric(intentId: string | null, options?: {
  refetchInterval?: number;
  enabled?: boolean;
}) {
  return useQuery({
    queryKey: ['metrics', 'fee', intentId],
    queryFn: async () => {
      if (!intentId) throw new Error('Intent ID is required');
      const response = await apiClient.getFeeMetric(intentId);
      if (!response.success || !response.data) {
        throw new Error(response.error?.message || 'Failed to fetch fee metrics');
      }
      return response.data;
    },
    enabled: !!intentId && (options?.enabled !== false),
    refetchInterval: options?.refetchInterval || false,
    staleTime: 30000, // 30 seconds
  });
}

/**
 * Hook to fetch metrics summary
 */
export function useMetricsSummary(params?: {
  fromDate?: string;
  toDate?: string;
  topUsers?: number;
  recentFees?: number;
}, options?: {
  refetchInterval?: number;
  enabled?: boolean;
}) {
  return useQuery({
    queryKey: ['metrics', 'summary', params],
    queryFn: async () => {
      const response = await apiClient.getMetricsSummary(params);
      if (!response.success || !response.data) {
        throw new Error(response.error?.message || 'Failed to fetch metrics summary');
      }
      return response.data;
    },
    enabled: options?.enabled !== false,
    refetchInterval: options?.refetchInterval || 30000, // 30 seconds
    staleTime: 10000, // 10 seconds
  });
}

