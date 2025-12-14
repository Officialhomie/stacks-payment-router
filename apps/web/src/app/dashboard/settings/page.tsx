/**
 * Agent Settings Page
 *
 * Comprehensive settings page for agents to manage:
 * - Profile information
 * - Notification preferences
 * - Settlement defaults
 * - API keys and integrations
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
import { formatAddress } from '@/lib/utils';

/**
 * Settings tab type
 */
type SettingsTab = 'profile' | 'notifications' | 'api' | 'security';

/**
 * Mock agent data
 * TODO: Replace with actual API call
 */
const mockAgentData = {
  name: 'My AI Agent',
  description: 'An intelligent payment processing agent',
  website: 'https://my-agent.com',
  apiEndpoint: 'https://api.my-agent.com',
  defaultAutoWithdraw: false,
  registeredAt: '2024-01-01T00:00:00Z',
};

export default function SettingsPage() {
  const { connected, address } = useWallet();
  const [activeTab, setActiveTab] = useState<SettingsTab>('profile');
  const [apiKey, setApiKey] = useState('sk_test_1234567890abcdef');
  const [showApiKey, setShowApiKey] = useState(false);

  /**
   * Handle profile save
   */
  const handleProfileSave = (data: any) => {
    console.log('Profile saved:', data);
    // TODO: Show success notification
  };

  /**
   * Handle notification preferences save
   */
  const handleNotificationsSave = (preferences: any) => {
    console.log('Notifications saved:', preferences);
    // TODO: Show success notification
  };

  /**
   * Generate new API key
   */
  const handleGenerateApiKey = async () => {
    // TODO: Implement API key generation
    const newKey = `sk_test_${Math.random().toString(36).substring(2, 18)}`;
    setApiKey(newKey);
    setShowApiKey(true);
  };

  /**
   * Revoke API key
   */
  const handleRevokeApiKey = async () => {
    // TODO: Implement API key revocation
    console.log('API key revoked');
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
        {activeTab === 'profile' && (
          <div className="space-y-6">
            <AgentProfile
              agentAddress={address}
              initialData={mockAgentData}
              editable
              onSave={handleProfileSave}
            />
            <AgentProfile.Stats totalPayments={42} totalVolume="4200.00" averagePayment="100.00" />
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
            {/* API Key Management */}
            <Card>
              <CardHeader>
                <CardTitle>API Keys</CardTitle>
                <CardDescription>
                  Use API keys to integrate with the Payment Router programmatically
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Current API Key */}
                <div className="space-y-2">
                  <label className="text-sm font-medium">Your API Key</label>
                  <div className="flex gap-2">
                    <input
                      type={showApiKey ? 'text' : 'password'}
                      value={apiKey}
                      readOnly
                      className="flex-1 px-3 py-2 border rounded-md bg-muted font-mono text-sm"
                    />
                    <Button variant="outline" onClick={() => setShowApiKey(!showApiKey)}>
                      {showApiKey ? 'Hide' : 'Show'}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => navigator.clipboard.writeText(apiKey)}
                    >
                      Copy
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Keep your API key secret. Do not share it publicly.
                  </p>
                </div>

                {/* Actions */}
                <div className="flex gap-2">
                  <Button onClick={handleGenerateApiKey}>Generate New Key</Button>
                  <Button variant="destructive" onClick={handleRevokeApiKey}>
                    Revoke Key
                  </Button>
                </div>

                {/* Warning */}
                <div className="rounded-lg bg-destructive/10 text-destructive px-4 py-3 text-sm">
                  <p className="font-medium">⚠️ Warning</p>
                  <p className="mt-1">
                    Generating a new API key will invalidate the current key. Update your
                    integrations immediately.
                  </p>
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
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json"`}
                  </pre>
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-medium">Create Payment Intent</p>
                  <pre className="bg-muted p-4 rounded-lg text-xs overflow-x-auto">
                    {`curl -X POST https://api.payment-router.com/v1/intents \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "amount": "100.00",
    "chain": "ethereum",
    "agentAddress": "${formatAddress(address, 6)}"
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

            {/* Rate Limits */}
            <Card>
              <CardHeader>
                <CardTitle>Rate Limits</CardTitle>
                <CardDescription>Your current API usage limits</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="font-medium">Requests per minute</p>
                      <p className="text-sm text-muted-foreground">Current usage</p>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-bold">42 / 100</p>
                      <p className="text-xs text-muted-foreground">42% used</p>
                    </div>
                  </div>
                  <div className="w-full bg-muted rounded-full h-2">
                    <div className="bg-primary h-2 rounded-full" style={{ width: '42%' }} />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Security Tab */}
        {activeTab === 'security' && (
          <div className="space-y-6">
            {/* Two-Factor Authentication */}
            <Card>
              <CardHeader>
                <CardTitle>Two-Factor Authentication</CardTitle>
                <CardDescription>Add an extra layer of security to your account</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <p className="font-medium">2FA Status</p>
                    <p className="text-sm text-muted-foreground">
                      Two-factor authentication is not enabled
                    </p>
                  </div>
                  <Button>Enable 2FA</Button>
                </div>
              </CardContent>
            </Card>

            {/* Session Management */}
            <Card>
              <CardHeader>
                <CardTitle>Active Sessions</CardTitle>
                <CardDescription>Manage your active sessions across devices</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
                  {/* Current Session */}
                  <div className="flex items-center justify-between p-3 border rounded-lg">
                    <div>
                      <p className="font-medium">Current Session</p>
                      <p className="text-sm text-muted-foreground">
                        MacBook Pro • San Francisco, CA • Active now
                      </p>
                    </div>
                    <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded-full">
                      Active
                    </span>
                  </div>

                  {/* Other Sessions */}
                  <div className="flex items-center justify-between p-3 border rounded-lg">
                    <div>
                      <p className="font-medium">iPad</p>
                      <p className="text-sm text-muted-foreground">
                        Last active: 2 hours ago
                      </p>
                    </div>
                    <Button variant="ghost" size="sm">
                      Revoke
                    </Button>
                  </div>
                </div>

                <Button variant="destructive" className="w-full">
                  Revoke All Sessions
                </Button>
              </CardContent>
            </Card>

            {/* Audit Log */}
            <Card>
              <CardHeader>
                <CardTitle>Security Audit Log</CardTitle>
                <CardDescription>Recent security-related activity</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {[
                    {
                      action: 'Wallet Connected',
                      timestamp: '2024-01-10T14:30:00Z',
                      ip: '192.168.1.1',
                    },
                    {
                      action: 'API Key Generated',
                      timestamp: '2024-01-09T10:15:00Z',
                      ip: '192.168.1.1',
                    },
                    {
                      action: 'Settings Updated',
                      timestamp: '2024-01-08T16:45:00Z',
                      ip: '192.168.1.1',
                    },
                  ].map((log, i) => (
                    <div key={i} className="flex items-center justify-between py-2 border-b last:border-0">
                      <div>
                        <p className="font-medium text-sm">{log.action}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(log.timestamp).toLocaleString()} • {log.ip}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
