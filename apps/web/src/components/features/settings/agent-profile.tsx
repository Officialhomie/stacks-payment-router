/**
 * Agent Profile Component
 *
 * Allows agents to view and update their profile information:
 * - Display name
 * - Description
 * - Website/API endpoint
 * - Default settlement preferences
 *
 * @example Basic Usage
 * ```tsx
 * <AgentProfile agentAddress="ST1PQHQKV..." />
 * ```
 *
 * @example With Edit Mode
 * ```tsx
 * <AgentProfile
 *   agentAddress="ST1PQHQKV..."
 *   editable
 *   onSave={handleSave}
 * />
 * ```
 */

'use client';

import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { formatAddress } from '@/lib/utils';

/**
 * Agent profile data interface
 */
export interface AgentProfileData {
  /** Agent display name */
  name: string;
  /** Agent description */
  description: string;
  /** Website URL */
  website?: string;
  /** API endpoint URL */
  apiEndpoint?: string;
  /** Default auto-withdraw preference */
  defaultAutoWithdraw: boolean;
  /** Stacks address */
  address: string;
  /** Registration date */
  registeredAt: string;
}

/**
 * Props for AgentProfile component
 */
export interface AgentProfileProps {
  /** Agent Stacks address */
  agentAddress: string;
  /** Initial profile data (optional) */
  initialData?: Partial<AgentProfileData>;
  /** Allow editing */
  editable?: boolean;
  /** Callback when profile is saved */
  onSave?: (data: AgentProfileData) => void;
}

/**
 * Default profile data
 */
const defaultProfileData: Partial<AgentProfileData> = {
  name: '',
  description: '',
  defaultAutoWithdraw: false,
};

export function AgentProfile({
  agentAddress,
  initialData = {},
  editable = true,
  onSave,
}: AgentProfileProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [profileData, setProfileData] = useState<AgentProfileData>({
    ...defaultProfileData,
    ...initialData,
    address: agentAddress,
    registeredAt: initialData.registeredAt || new Date().toISOString(),
  } as AgentProfileData);

  /**
   * Update profile field
   */
  const updateField = (field: keyof AgentProfileData, value: string | boolean) => {
    setProfileData((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  /**
   * Save profile changes
   */
  const handleSave = async () => {
    setIsSaving(true);
    try {
      // Call the onSave callback which handles the API call
      await onSave?.(profileData);
      setIsEditing(false);
    } catch (error) {
      console.error('Failed to save profile:', error);
      throw error; // Re-throw to let parent handle
    } finally {
      setIsSaving(false);
    }
  };

  /**
   * Cancel editing
   */
  const handleCancel = () => {
    // Reset to initial data
    setProfileData({
      ...defaultProfileData,
      ...initialData,
      address: agentAddress,
      registeredAt: initialData.registeredAt || new Date().toISOString(),
    } as AgentProfileData);
    setIsEditing(false);
  };

  return (
    <div className="space-y-6">
      {/* Profile Information */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div>
              <CardTitle>Agent Profile</CardTitle>
              <CardDescription>Manage your agent information</CardDescription>
            </div>
            {editable && !isEditing && (
              <Button variant="outline" onClick={() => setIsEditing(true)}>
                Edit Profile
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Stacks Address (Read-only) */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-muted-foreground">Stacks Address</label>
            <div className="flex items-center gap-2">
              <code className="text-sm bg-muted px-3 py-2 rounded-md flex-1">
                {formatAddress(agentAddress, 8)}
              </code>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigator.clipboard.writeText(agentAddress)}
              >
                Copy
              </Button>
            </div>
          </div>

          {/* Display Name */}
          <div className="space-y-2">
            <label htmlFor="name" className="text-sm font-medium">
              Display Name
            </label>
            {isEditing ? (
              <input
                id="name"
                type="text"
                placeholder="My AI Agent"
                value={profileData.name}
                onChange={(e) => updateField('name', e.target.value)}
                className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
              />
            ) : (
              <p className="text-base">{profileData.name || 'Not set'}</p>
            )}
          </div>

          {/* Description */}
          <div className="space-y-2">
            <label htmlFor="description" className="text-sm font-medium">
              Description
            </label>
            {isEditing ? (
              <textarea
                id="description"
                placeholder="A brief description of your agent"
                value={profileData.description}
                onChange={(e) => updateField('description', e.target.value)}
                rows={3}
                className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
              />
            ) : (
              <p className="text-base">{profileData.description || 'Not set'}</p>
            )}
          </div>

          {/* Website */}
          <div className="space-y-2">
            <label htmlFor="website" className="text-sm font-medium">
              Website
            </label>
            {isEditing ? (
              <input
                id="website"
                type="url"
                placeholder="https://your-agent.com"
                value={profileData.website || ''}
                onChange={(e) => updateField('website', e.target.value)}
                className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
              />
            ) : (
              <p className="text-base">
                {profileData.website ? (
                  <a
                    href={profileData.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline"
                  >
                    {profileData.website}
                  </a>
                ) : (
                  'Not set'
                )}
              </p>
            )}
          </div>

          {/* API Endpoint */}
          <div className="space-y-2">
            <label htmlFor="api" className="text-sm font-medium">
              API Endpoint
            </label>
            {isEditing ? (
              <input
                id="api"
                type="url"
                placeholder="https://api.your-agent.com"
                value={profileData.apiEndpoint || ''}
                onChange={(e) => updateField('apiEndpoint', e.target.value)}
                className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
              />
            ) : (
              <p className="text-base">
                {profileData.apiEndpoint ? (
                  <code className="text-sm bg-muted px-2 py-1 rounded">{profileData.apiEndpoint}</code>
                ) : (
                  'Not set'
                )}
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              Optional: API endpoint for programmatic integration
            </p>
          </div>

          {/* Registered Date (Read-only) */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-muted-foreground">Registered</label>
            <p className="text-base">{new Date(profileData.registeredAt).toLocaleDateString()}</p>
          </div>

          {/* Save/Cancel Buttons */}
          {isEditing && (
            <div className="flex gap-2 pt-4">
              <Button onClick={handleSave} disabled={isSaving}>
                {isSaving ? 'Saving...' : 'Save Changes'}
              </Button>
              <Button variant="outline" onClick={handleCancel} disabled={isSaving}>
                Cancel
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Default Settlement Preferences */}
      <Card>
        <CardHeader>
          <CardTitle>Default Settlement Preferences</CardTitle>
          <CardDescription>Set your default preferences for new payments</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <p className="font-medium">Auto-Withdraw by Default</p>
              <p className="text-sm text-muted-foreground">
                Automatically withdraw settled payments to your wallet instead of depositing to vault
              </p>
            </div>
            <button
              type="button"
              onClick={() => updateField('defaultAutoWithdraw', !profileData.defaultAutoWithdraw)}
              disabled={!isEditing}
              className={`
                relative inline-flex h-6 w-11 items-center rounded-full transition-colors
                ${profileData.defaultAutoWithdraw ? 'bg-primary' : 'bg-muted'}
                ${!isEditing ? 'opacity-50 cursor-not-allowed' : ''}
              `}
              role="switch"
              aria-checked={profileData.defaultAutoWithdraw}
            >
              <span
                className={`
                  inline-block h-4 w-4 transform rounded-full bg-white transition-transform
                  ${profileData.defaultAutoWithdraw ? 'translate-x-6' : 'translate-x-1'}
                `}
              />
            </button>
          </div>

          <div className="rounded-lg bg-muted p-4 text-sm">
            <p className="font-medium mb-2">Note:</p>
            <ul className="space-y-1 text-muted-foreground">
              <li>• Vault deposits earn yield automatically</li>
              <li>• Auto-withdraw has higher fees (1.0% vs 0.5%)</li>
              <li>• You can override this on a per-payment basis</li>
            </ul>
          </div>
        </CardContent>
      </Card>

      {/* Danger Zone */}
      <Card className="border-destructive">
        <CardHeader>
          <CardTitle className="text-destructive">Danger Zone</CardTitle>
          <CardDescription>Irreversible actions</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <p className="font-medium">Deactivate Agent</p>
              <p className="text-sm text-muted-foreground">
                Stop accepting new payments (existing payments can still be settled)
              </p>
            </div>
            <Button variant="destructive" disabled>
              Deactivate
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * Agent Stats Summary Component
 *
 * Display key agent statistics in profile view
 *
 * @example
 * ```tsx
 * <AgentProfile.Stats
 *   totalPayments={150}
 *   totalVolume="15000.00"
 *   averagePayment="100.00"
 * />
 * ```
 */
AgentProfile.Stats = function AgentStats({
  totalPayments,
  totalVolume,
  averagePayment,
}: {
  totalPayments: number;
  totalVolume: string;
  averagePayment: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Agent Statistics</CardTitle>
        <CardDescription>Your payment processing overview</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <p className="text-sm text-muted-foreground">Total Payments</p>
            <p className="text-2xl font-bold">{totalPayments}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Total Volume</p>
            <p className="text-2xl font-bold">${totalVolume}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Avg. Payment</p>
            <p className="text-2xl font-bold">${averagePayment}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
