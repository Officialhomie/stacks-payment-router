'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { copyToClipboard, formatAddress } from '@/lib/utils';
import { cn } from '@/lib/utils';

interface CopyAddressProps {
  address: string;
  label?: string;
  showFull?: boolean;
  className?: string;
}

/**
 * Copy Address Component
 * Displays an address with copy-to-clipboard functionality
 */
export function CopyAddress({
  address,
  label = 'Payment Address',
  showFull = false,
  className,
}: CopyAddressProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    const success = await copyToClipboard(address);
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const displayAddress = showFull ? address : formatAddress(address, 6);

  return (
    <Card className={cn('p-4', className)}>
      <div className="space-y-2">
        <label className="text-xs text-muted-foreground uppercase tracking-wide">
          {label}
        </label>
        <div className="flex items-center space-x-2">
          <code className="flex-1 rounded bg-muted px-3 py-2 font-mono text-sm break-all">
            {displayAddress}
          </code>
          <Button
            variant="outline"
            size="sm"
            onClick={handleCopy}
            className="shrink-0"
          >
            {copied ? (
              <>
                <CheckIcon className="mr-1 h-4 w-4" />
                Copied!
              </>
            ) : (
              <>
                <CopyIcon className="mr-1 h-4 w-4" />
                Copy
              </>
            )}
          </Button>
        </div>
        {!showFull && (
          <button
            onClick={handleCopy}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Click to copy full address
          </button>
        )}
      </div>
    </Card>
  );
}

/**
 * Inline Copy Button
 */
export function CopyButton({
  value,
  className,
}: {
  value: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    const success = await copyToClipboard(value);
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <button
      onClick={handleCopy}
      className={cn(
        'inline-flex items-center space-x-1 text-sm text-muted-foreground hover:text-foreground transition-colors',
        className
      )}
      title="Copy to clipboard"
    >
      {copied ? (
        <>
          <CheckIcon className="h-4 w-4" />
          <span>Copied</span>
        </>
      ) : (
        <CopyIcon className="h-4 w-4" />
      )}
    </button>
  );
}

// Simple SVG icons
function CopyIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}
