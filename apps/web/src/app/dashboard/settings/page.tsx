/**
 * Agent Settings Page
 *
 * Comprehensive settings page for agents to manage:
 * - Profile information
 * - Notification preferences
 * - Settlement defaults
 *
 * @route /dashboard/settings
 */

'use client';

import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AgentProfile } from '@/components/features/settings/agent-profile';
import { NotificationSettings } from '@/components/features/settings/notification-settings';
import { useWallet } from '@/components/providers/wallet-provider';
import { useAgent, useUpdateAgent } from '@/lib/hooks/use-agent';
import { formatAddress } from '@/lib/utils';
import type { Agent } from '@/types';

/**
 * Settings tab type
 */
type SettingsTab = 'profile' | 'notifications' | 'api' | 'security';

export default function SettingsPage() {
  const { connected, address } = useWallet();
  const { data: agent, isLoading: agentLoading } = useAgent(address || null, {
    enabled: connected && !!address,
  });
  const updateAgentMutation = useUpdateAgent(address || '');
  const [activeTab, setActiveTab] = useState<SettingsTab>('profile');

  /**
   * Handle profile save
   */
  const handleProfileSave = async (data: { name: string; description: string; defaultAutoWithdraw: boolean }) => {
    try {
      await updateAgentMutation.mutateAsync({
        name: data.name,
        description: data.description,
        autoWithdraw: data.defaultAutoWithdraw,
      } as Partial<Agent>);
      // Success handled by mutation
    } catch (error) {
      console.error('Failed to save profile:', error);
    }
  };

  /**
   * Handle notification preferences save
   */
  const handleNotificationsSave = async (_preferences: {
    paymentDetected: boolean;
    paymentSettled: boolean;
    vaultDeposit: boolean;
    vaultWithdrawal: boolean;
    systemAlerts: boolean;
    emailEnabled: boolean;
    webhookUrl?: string;
    webhookEnabled: boolean;
  }) => {
    // Notification preferences require backend API endpoint
    // This will be implemented when the backend endpoint is available
    throw new Error('Notification preferences API endpoint not yet implemented');
  };

  // Check wallet connection
  if (!connected || !address) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle>Connect Your Wallet</CardTitle>
            <CardDescription>Please connect your wallet to access settings</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  // Loading state
  if (agentLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle>Loading...</CardTitle>
            <CardDescription>Fetching agent settings</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  // Prepare agent data for components
  const agentProfileData = agent
    ? {
        name: agent.name || '',
        description: agent.description || '',
        website: '',
        apiEndpoint: '',
        defaultAutoWithdraw: agent.autoWithdraw || false,
        address: agent.address || address || '',
        registeredAt: agent.registeredAt?.toString() || new Date().toISOString(),
      }
    : undefined;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="text-muted-foreground mt-1">Manage your agent configuration and preferences</p>
      </div>

      {/* Tabs */}
      <div className="border-b">
        <nav className="flex gap-4 -mb-px">
          <button
            onClick={() => setActiveTab('profile')}
            className={`
              py-2 px-1 border-b-2 font-medium text-sm transition-colors
              ${
                activeTab === 'profile'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:border-muted'
              }
            `}
          >
            Profile
          </button>
          <button
            onClick={() => setActiveTab('notifications')}
            className={`
              py-2 px-1 border-b-2 font-medium text-sm transition-colors
              ${
                activeTab === 'notifications'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:border-muted'
              }
            `}
          >
            Notifications
          </button>
          <button
            onClick={() => setActiveTab('api')}
            className={`
              py-2 px-1 border-b-2 font-medium text-sm transition-colors
              ${
                activeTab === 'api'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:border-muted'
              }
            `}
          >
            API Keys
          </button>
          <button
            onClick={() => setActiveTab('security')}
            className={`
              py-2 px-1 border-b-2 font-medium text-sm transition-colors
              ${
                activeTab === 'security'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:border-muted'
              }
            `}
          >
            Security
          </button>
        </nav>
      </div>

      {/* Tab Content */}
      <div>
        {/* Profile Tab */}
        {activeTab === 'profile' && agentProfileData && (
          <div className="space-y-6">
            <AgentProfile
              agentAddress={address}
              initialData={agentProfileData}
              editable
              onSave={handleProfileSave}
            />
            {agent && (
              <AgentProfile.Stats
                totalPayments={agent.paymentCount || 0}
                totalVolume={parseFloat(agent.totalReceived || '0').toFixed(2)}
                averagePayment={
                  (agent.paymentCount || 0) > 0
                    ? (parseFloat(agent.totalReceived || '0') / (agent.paymentCount || 1)).toFixed(2)
                    : '0.00'
                }
              />
            )}
          </div>
        )}

        {/* Notifications Tab */}
        {activeTab === 'notifications' && (
          <NotificationSettings
            agentAddress={address}
            onSave={handleNotificationsSave}
            enableEmail
            enableWebhook
          />
        )}

        {/* API Keys Tab */}
        {activeTab === 'api' && (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>API Keys</CardTitle>
                <CardDescription>
                  API key management will be available soon
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-center py-8 text-muted-foreground">
                  <p>API key management is not yet implemented.</p>
                  <p className="text-sm mt-2">This feature will be available in a future update.</p>
                </div>
              </CardContent>
            </Card>

            {/* API Documentation */}
            <Card>
              <CardHeader>
                <CardTitle>API Documentation</CardTitle>
                <CardDescription>How to use the Payment Router API</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <p className="text-sm font-medium">Authentication</p>
                  <pre className="bg-muted p-4 rounded-lg text-xs overflow-x-auto">
                    {`curl https://api.payment-router.com/v1/intents \\
  -H &quot;Authorization: Bearer YOUR_API_KEY&quot; \\
  -H &quot;Content-Type: application/json&quot;`}
                  </pre>
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-medium">Create Payment Intent</p>
                  <pre className="bg-muted p-4 rounded-lg text-xs overflow-x-auto">
                    {`curl -X POST https://api.payment-router.com/v1/intents \\
  -H &quot;Authorization: Bearer YOUR_API_KEY&quot; \\
  -H &quot;Content-Type: application/json&quot; \\
  -d '{
    &quot;amount&quot;: &quot;100.00&quot;,
    &quot;chain&quot;: &quot;ethereum&quot;,
    &quot;agentAddress&quot;: &quot;${formatAddress(address, 6)}&quot;
  }'`}
                  </pre>
                </div>

                <Button variant="outline" asChild>
                  <a href="/docs/api" target="_blank" rel="noopener noreferrer">
                    View Full API Documentation →
                  </a>
                </Button>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Security Tab */}
        {activeTab === 'security' && (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Security Settings</CardTitle>
                <CardDescription>Security features will be available soon</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-center py-8 text-muted-foreground">
                  <p>Security settings including 2FA, session management, and audit logs</p>
                  <p className="text-sm mt-2">will be available in a future update.</p>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
