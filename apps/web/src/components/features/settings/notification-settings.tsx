/**
 * Notification Settings Component
 *
 * Allows agents to configure their notification preferences for:
 * - Payment events (detected, settled)
 * - Vault events (deposits, withdrawals)
 * - System alerts
 *
 * @example Basic Usage
 * ```tsx
 * <NotificationSettings
 *   agentAddress="ST1PQHQKV..."
 *   onSave={handleSave}
 * />
 * ```
 *
 * @example With Email Integration
 * ```tsx
 * <NotificationSettings
 *   agentAddress="ST1PQHQKV..."
 *   email="agent@example.com"
 *   enableEmail
 *   onSave={handleSave}
 * />
 * ```
 */

'use client';

import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

/**
 * Notification preferences interface
 */
export interface NotificationPreferences {
  /** Enable payment detection notifications */
  paymentDetected: boolean;
  /** Enable payment settlement notifications */
  paymentSettled: boolean;
  /** Enable vault deposit notifications */
  vaultDeposit: boolean;
  /** Enable vault withdrawal notifications */
  vaultWithdrawal: boolean;
  /** Enable system alert notifications */
  systemAlerts: boolean;
  /** Email address for notifications */
  email?: string;
  /** Enable email notifications */
  emailEnabled: boolean;
  /** Webhook URL for notifications */
  webhookUrl?: string;
  /** Enable webhook notifications */
  webhookEnabled: boolean;
}

/**
 * Props for NotificationSettings component
 */
export interface NotificationSettingsProps {
  /** Agent Stacks address */
  agentAddress: string;
  /** Initial preferences (optional) */
  initialPreferences?: Partial<NotificationPreferences>;
  /** Callback when settings are saved */
  onSave?: (preferences: NotificationPreferences) => void;
  /** Show email settings */
  enableEmail?: boolean;
  /** Show webhook settings */
  enableWebhook?: boolean;
}

/**
 * Default notification preferences
 */
const defaultPreferences: NotificationPreferences = {
  paymentDetected: true,
  paymentSettled: true,
  vaultDeposit: true,
  vaultWithdrawal: true,
  systemAlerts: true,
  emailEnabled: false,
  webhookEnabled: false,
};

export function NotificationSettings({
  agentAddress: _agentAddress,
  initialPreferences = {},
  onSave,
  enableEmail = true,
  enableWebhook = true,
}: NotificationSettingsProps) {
  const [preferences, setPreferences] = useState<NotificationPreferences>({
    ...defaultPreferences,
    ...initialPreferences,
  });
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  /**
   * Toggle a notification preference
   */
  const togglePreference = (key: keyof NotificationPreferences) => {
    setPreferences((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
    setSaved(false);
  };

  /**
   * Update text field preferences
   */
  const updateTextField = (key: keyof NotificationPreferences, value: string) => {
    setPreferences((prev) => ({
      ...prev,
      [key]: value,
    }));
    setSaved(false);
  };

  /**
   * Save notification preferences
   */
  const handleSave = async () => {
    setIsSaving(true);
    try {
      // Notification preferences API endpoint not yet implemented
      // This will call the backend when the endpoint is available
      throw new Error('Notification preferences API endpoint not yet implemented');

      onSave?.(preferences);
      setSaved(true);

      // Hide success message after 3 seconds
      setTimeout(() => setSaved(false), 3000);
    } catch (error) {
      console.error('Failed to save preferences:', error);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Payment Notifications */}
      <Card>
        <CardHeader>
          <CardTitle>Payment Notifications</CardTitle>
          <CardDescription>Get notified about payment events</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <NotificationToggle
            label="Payment Detected"
            description="When a payment is detected on-chain"
            checked={preferences.paymentDetected}
            onToggle={() => togglePreference('paymentDetected')}
          />
          <NotificationToggle
            label="Payment Settled"
            description="When a payment is settled to your vault"
            checked={preferences.paymentSettled}
            onToggle={() => togglePreference('paymentSettled')}
          />
        </CardContent>
      </Card>

      {/* Vault Notifications */}
      <Card>
        <CardHeader>
          <CardTitle>Vault Notifications</CardTitle>
          <CardDescription>Get notified about vault activity</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <NotificationToggle
            label="Vault Deposits"
            description="When funds are deposited to your vault"
            checked={preferences.vaultDeposit}
            onToggle={() => togglePreference('vaultDeposit')}
          />
          <NotificationToggle
            label="Vault Withdrawals"
            description="When you withdraw funds from your vault"
            checked={preferences.vaultWithdrawal}
            onToggle={() => togglePreference('vaultWithdrawal')}
          />
        </CardContent>
      </Card>

      {/* System Notifications */}
      <Card>
        <CardHeader>
          <CardTitle>System Notifications</CardTitle>
          <CardDescription>Important system alerts and updates</CardDescription>
        </CardHeader>
        <CardContent>
          <NotificationToggle
            label="System Alerts"
            description="Security alerts, maintenance notices, and system updates"
            checked={preferences.systemAlerts}
            onToggle={() => togglePreference('systemAlerts')}
          />
        </CardContent>
      </Card>

      {/* Email Settings */}
      {enableEmail && (
        <Card>
          <CardHeader>
            <CardTitle>Email Notifications</CardTitle>
            <CardDescription>Receive notifications via email</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <NotificationToggle
              label="Enable Email Notifications"
              description="Send notifications to your email address"
              checked={preferences.emailEnabled}
              onToggle={() => togglePreference('emailEnabled')}
            />
            {preferences.emailEnabled && (
              <div className="space-y-2">
                <label htmlFor="email" className="text-sm font-medium">
                  Email Address
                </label>
                <input
                  id="email"
                  type="email"
                  placeholder="agent@example.com"
                  value={preferences.email || ''}
                  onChange={(e) => updateTextField('email', e.target.value)}
                  className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Webhook Settings */}
      {enableWebhook && (
        <Card>
          <CardHeader>
            <CardTitle>Webhook Notifications</CardTitle>
            <CardDescription>Send notifications to your webhook endpoint</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <NotificationToggle
              label="Enable Webhook Notifications"
              description="Send POST requests to your webhook URL"
              checked={preferences.webhookEnabled}
              onToggle={() => togglePreference('webhookEnabled')}
            />
            {preferences.webhookEnabled && (
              <div className="space-y-2">
                <label htmlFor="webhook" className="text-sm font-medium">
                  Webhook URL
                </label>
                <input
                  id="webhook"
                  type="url"
                  placeholder="https://your-api.com/webhook"
                  value={preferences.webhookUrl || ''}
                  onChange={(e) => updateTextField('webhookUrl', e.target.value)}
                  className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                />
                <p className="text-xs text-muted-foreground">
                  We&apos;ll send POST requests with payment event data in JSON format
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Save Button */}
      <div className="flex items-center gap-4">
        <Button onClick={handleSave} disabled={isSaving || saved}>
          {isSaving ? 'Saving...' : saved ? 'Saved!' : 'Save Preferences'}
        </Button>
        {saved && (
          <span className="text-sm text-green-600 flex items-center gap-1">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="h-4 w-4"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
            Preferences saved successfully
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * Notification Toggle Component
 *
 * Reusable toggle switch for notification preferences
 *
 * @example
 * ```tsx
 * <NotificationToggle
 *   label="Email Notifications"
 *   description="Receive updates via email"
 *   checked={enabled}
 *   onToggle={() => setEnabled(!enabled)}
 * />
 * ```
 */
function NotificationToggle({
  label,
  description,
  checked,
  onToggle,
}: {
  label: string;
  description: string;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex-1">
        <p className="font-medium">{label}</p>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <button
        type="button"
        onClick={onToggle}
        className={`
          relative inline-flex h-6 w-11 items-center rounded-full transition-colors
          ${checked ? 'bg-primary' : 'bg-muted'}
        `}
        role="switch"
        aria-checked={checked}
      >
        <span
          className={`
            inline-block h-4 w-4 transform rounded-full bg-white transition-transform
            ${checked ? 'translate-x-6' : 'translate-x-1'}
          `}
        />
      </button>
    </div>
  );
}
