import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../api-client';
import type { Agent } from '@/types';
import { toast } from 'sonner';

/**
 * Hook to fetch agent details
 */
export function useAgent(address: string | null, options?: {
  enabled?: boolean;
}) {
  return useQuery({
    queryKey: ['agent', address],
    queryFn: async () => {
      if (!address) throw new Error('Agent address is required');
      const response = await apiClient.getAgent(address);
      if (!response.success || !response.data) {
        throw new Error(response.error?.message || 'Failed to fetch agent');
      }
      return response.data;
    },
    enabled: !!address && (options?.enabled !== false),
    staleTime: 60000, // 1 minute
  });
}

/**
 * Hook to register a new agent
 */
export function useRegisterAgent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      address: string;
      name?: string;
      description?: string;
      autoWithdraw?: boolean;
      supportedChains?: string[];
    }) => {
      const response = await apiClient.registerAgent(data);
      if (!response.success || !response.data) {
        throw new Error(response.error?.message || 'Failed to register agent');
      }
      return response.data;
    },
    onSuccess: (data) => {
      // Cache the newly registered agent
      queryClient.setQueryData(['agent', data.address], data);
      toast.success('Agent registered successfully!');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to register agent');
    },
  });
}

/**
 * Hook to update agent settings
 */
export function useUpdateAgent(address: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: Partial<Agent>) => {
      const response = await apiClient.updateAgent(address, data);
      if (!response.success || !response.data) {
        throw new Error(response.error?.message || 'Failed to update agent');
      }
      return response.data;
    },
    onSuccess: (data) => {
      // Update cached agent data
      queryClient.setQueryData(['agent', address], data);
      // Invalidate related queries
      queryClient.invalidateQueries({ queryKey: ['agent', address] });
      toast.success('Agent settings updated successfully!');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to update agent');
    },
  });
}

/**
 * Hook to fetch vault stats
 */
export function useVaultStats(agentAddress: string | null, options?: {
  enabled?: boolean;
  refetchInterval?: number;
}) {
  return useQuery({
    queryKey: ['vault-stats', agentAddress],
    queryFn: async () => {
      if (!agentAddress) throw new Error('Agent address is required');
      const response = await apiClient.getVaultStats(agentAddress);
      if (!response.success || !response.data) {
        throw new Error(response.error?.message || 'Failed to fetch vault stats');
      }
      return response.data;
    },
    enabled: !!agentAddress && (options?.enabled !== false),
    refetchInterval: options?.refetchInterval || false,
    staleTime: 30000, // 30 seconds
  });
}

/**
 * Hook to fetch withdrawal history
 */
export function useWithdrawalHistory(agentAddress: string | null, options?: {
  enabled?: boolean;
  limit?: number;
  offset?: number;
}) {
  return useQuery({
    queryKey: ['withdrawal-history', agentAddress, options?.limit, options?.offset],
    queryFn: async () => {
      if (!agentAddress) throw new Error('Agent address is required');
      const response = await apiClient.getWithdrawalHistory(agentAddress, {
        limit: options?.limit,
        offset: options?.offset,
      });
      if (!response.success || !response.data) {
        throw new Error(response.error?.message || 'Failed to fetch withdrawal history');
      }
      return response.data;
    },
    enabled: !!agentAddress && (options?.enabled !== false),
    staleTime: 60000, // 1 minute
  });
}

/**
 * Hook to withdraw from vault
 */
export function useWithdrawFromVault(agentAddress: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (amount: string) => {
      const response = await apiClient.withdrawFromVault(agentAddress, amount);
      if (!response.success || !response.data) {
        throw new Error(response.error?.message || 'Failed to withdraw from vault');
      }
      return response.data;
    },
    onSuccess: (data) => {
      // Invalidate vault stats to refresh balance
      queryClient.invalidateQueries({ queryKey: ['vault-stats', agentAddress] });
      queryClient.invalidateQueries({ queryKey: ['agent', agentAddress] });
      queryClient.invalidateQueries({ queryKey: ['withdrawal-history', agentAddress] });
      toast.success(`Withdrawal initiated! Transaction: ${data.txId.substring(0, 10)}...`);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Withdrawal failed');
    },
  });
}
