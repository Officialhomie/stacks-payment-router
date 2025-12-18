/**
 * Agent Registration Form Component
 *
 * Allows users to register as agents with:
 * - Name and description
 * - Supported chains selection
 * - Auto-withdraw preference
 *
 * @example
 * ```tsx
 * <RegistrationForm onSuccess={handleSuccess} />
 * ```
 */

'use client';

import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useRegisterAgent } from '@/lib/hooks/use-agent';
import { useWallet } from '@/components/providers/wallet-provider';
import type { Agent } from '@/types';

export interface RegistrationFormData {
  name: string;
  description: string;
  supportedChains: string[];
  autoWithdraw: boolean;
}

export interface RegistrationFormProps {
  onSuccess?: (agent: Agent) => void;
  onError?: (error: Error) => void;
}

const SUPPORTED_CHAINS = [
  { id: 'ethereum', label: 'Ethereum', icon: 'Ξ' },
  { id: 'arbitrum', label: 'Arbitrum', icon: '🔷' },
  { id: 'base', label: 'Base', icon: '🔵' },
  { id: 'polygon', label: 'Polygon', icon: '🟣' },
  { id: 'optimism', label: 'Optimism', icon: '🔴' },
];

export function RegistrationForm({ onSuccess, onError }: RegistrationFormProps) {
  const { address } = useWallet();
  const registerMutation = useRegisterAgent();
  const [formData, setFormData] = useState<RegistrationFormData>({
    name: '',
    description: '',
    supportedChains: [],
    autoWithdraw: false,
  });
  const [errors, setErrors] = useState<Partial<Record<keyof RegistrationFormData, string>>>({});

  /**
   * Validate form data
   */
  const validate = (): boolean => {
    const newErrors: Partial<Record<keyof RegistrationFormData, string>> = {};

    if (!formData.name.trim()) {
      newErrors.name = 'Name is required';
    }

    if (!formData.description.trim()) {
      newErrors.description = 'Description is required';
    }

    if (formData.supportedChains.length === 0) {
      newErrors.supportedChains = 'Select at least one supported chain';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  /**
   * Handle form submission
   */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!address) {
      onError?.(new Error('Wallet not connected'));
      return;
    }

    if (!validate()) {
      return;
    }

    try {
      const agent = await registerMutation.mutateAsync({
        address,
        name: formData.name,
        description: formData.description,
        supportedChains: formData.supportedChains,
        autoWithdraw: formData.autoWithdraw,
      });

      onSuccess?.(agent);
    } catch (error) {
      onError?.(error as Error);
    }
  };

  /**
   * Toggle chain selection
   */
  const toggleChain = (chainId: string) => {
    setFormData((prev) => ({
      ...prev,
      supportedChains: prev.supportedChains.includes(chainId)
        ? prev.supportedChains.filter((c) => c !== chainId)
        : [...prev.supportedChains, chainId],
    }));
    // Clear error when chain is selected
    if (errors.supportedChains) {
      setErrors((prev) => ({ ...prev, supportedChains: undefined }));
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Register as Agent</CardTitle>
        <CardDescription>
          Register your wallet address to start receiving cross-chain payments
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Name */}
          <div className="space-y-2">
            <label htmlFor="name" className="text-sm font-medium">
              Agent Name <span className="text-destructive">*</span>
            </label>
            <input
              id="name"
              type="text"
              placeholder="My AI Agent"
              value={formData.name}
              onChange={(e) => {
                setFormData((prev) => ({ ...prev, name: e.target.value }));
                if (errors.name) setErrors((prev) => ({ ...prev, name: undefined }));
              }}
              className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary ${
                errors.name ? 'border-destructive' : ''
              }`}
            />
            {errors.name && <p className="text-sm text-destructive">{errors.name}</p>}
          </div>

          {/* Description */}
          <div className="space-y-2">
            <label htmlFor="description" className="text-sm font-medium">
              Description <span className="text-destructive">*</span>
            </label>
            <textarea
              id="description"
              placeholder="A brief description of your agent and its purpose"
              value={formData.description}
              onChange={(e) => {
                setFormData((prev) => ({ ...prev, description: e.target.value }));
                if (errors.description) setErrors((prev) => ({ ...prev, description: undefined }));
              }}
              rows={4}
              className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary ${
                errors.description ? 'border-destructive' : ''
              }`}
            />
            {errors.description && (
              <p className="text-sm text-destructive">{errors.description}</p>
            )}
          </div>

          {/* Supported Chains */}
          <div className="space-y-2">
            <label className="text-sm font-medium">
              Supported Chains <span className="text-destructive">*</span>
            </label>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {SUPPORTED_CHAINS.map((chain) => (
                <button
                  key={chain.id}
                  type="button"
                  onClick={() => toggleChain(chain.id)}
                  className={`
                    p-3 border rounded-lg text-left transition-colors
                    ${
                      formData.supportedChains.includes(chain.id)
                        ? 'border-primary bg-primary/10'
                        : 'border-muted hover:border-primary/50'
                    }
                  `}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{chain.icon}</span>
                    <span className="font-medium">{chain.label}</span>
                  </div>
                </button>
              ))}
            </div>
            {errors.supportedChains && (
              <p className="text-sm text-destructive">{errors.supportedChains}</p>
            )}
          </div>

          {/* Auto-Withdraw */}
          <div className="flex items-center justify-between p-4 border rounded-lg">
            <div className="flex-1">
              <p className="font-medium">Auto-Withdraw by Default</p>
              <p className="text-sm text-muted-foreground">
                Automatically withdraw settled payments instead of depositing to vault
              </p>
            </div>
            <button
              type="button"
              onClick={() => setFormData((prev) => ({ ...prev, autoWithdraw: !prev.autoWithdraw }))}
              className={`
                relative inline-flex h-6 w-11 items-center rounded-full transition-colors
                ${formData.autoWithdraw ? 'bg-primary' : 'bg-muted'}
              `}
              role="switch"
              aria-checked={formData.autoWithdraw}
            >
              <span
                className={`
                  inline-block h-4 w-4 transform rounded-full bg-white transition-transform
                  ${formData.autoWithdraw ? 'translate-x-6' : 'translate-x-1'}
                `}
              />
            </button>
          </div>

          {/* Submit Button */}
          <Button
            type="submit"
            className="w-full"
            disabled={registerMutation.isPending}
          >
            {registerMutation.isPending ? 'Registering...' : 'Register Agent'}
          </Button>

          {registerMutation.isError && (
            <p className="text-sm text-destructive text-center">
              {registerMutation.error instanceof Error
                ? registerMutation.error.message
                : 'Registration failed'}
            </p>
          )}
        </form>
      </CardContent>
    </Card>
  );
}

