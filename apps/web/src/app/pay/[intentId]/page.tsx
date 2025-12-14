'use client';

import React, { use } from 'react';
import { usePaymentStatus } from '@/lib/hooks/use-payment-intent';
import { PaymentQRCode } from '@/components/features/payment/qr-code';
import { PaymentStatusDetailed } from '@/components/features/payment/payment-status';
import { CountdownTimerWithLabel } from '@/components/features/payment/countdown-timer';
import { CopyAddress } from '@/components/features/payment/copy-address';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { formatCurrency } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

interface PageProps {
  params: Promise<{
    intentId: string;
  }>;
}

/**
 * Payment Intent Page
 * Public page for customers to view payment details and make payments
 */
export default function PaymentIntentPage({ params }: PageProps) {
  const { intentId } = use(params);

  // Poll for status updates every 5 seconds
  const { data: payment, isLoading, error } = usePaymentStatus(intentId, {
    pollInterval: 5000,
    enabled: true,
  });

  // Loading state
  if (isLoading) {
    return (
      <div className="container max-w-4xl mx-auto py-12 px-4">
        <div className="space-y-8">
          <Skeleton className="h-12 w-3/4" />
          <div className="grid md:grid-cols-2 gap-8">
            <Skeleton className="h-[400px]" />
            <Skeleton className="h-[400px]" />
          </div>
        </div>
      </div>
    );
  }

  // Error state
  if (error || !payment) {
    return (
      <div className="container max-w-4xl mx-auto py-12 px-4">
        <Card className="p-12 text-center">
          <div className="text-6xl mb-4">❌</div>
          <h1 className="text-2xl font-bold mb-2">Payment Not Found</h1>
          <p className="text-muted-foreground">
            {error?.message || 'This payment intent does not exist or has been removed.'}
          </p>
        </Card>
      </div>
    );
  }

  const isExpired = new Date(payment.expiresAt) < new Date();
  const isCompleted = payment.status === 'settled';

  return (
    <div className="container max-w-5xl mx-auto py-8 px-4">
      {/* Header */}
      <div className="mb-8 space-y-2">
        <div className="flex items-center justify-between">
          <h1 className="text-4xl font-bold tracking-tight">Payment Request</h1>
          <Badge variant="outline" className="font-mono">
            #{intentId.slice(0, 8)}
          </Badge>
        </div>
        <p className="text-muted-foreground">
          Complete your payment by sending crypto to the address below
        </p>
      </div>

      {/* Main Content */}
      <div className="grid md:grid-cols-2 gap-8">
        {/* Left Column - QR Code */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Scan to Pay</CardTitle>
              <CardDescription>
                Scan this QR code with your wallet app
              </CardDescription>
            </CardHeader>
            <CardContent className="flex justify-center">
              <PaymentQRCode address={payment.paymentAddress} size={280} />
            </CardContent>
          </Card>

          {/* Payment Address */}
          <CopyAddress
            address={payment.paymentAddress}
            label="Payment Address"
            showFull={false}
          />

          {/* Chain Info */}
          <Card className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Blockchain</span>
              <Badge variant="secondary" className="font-semibold uppercase">
                {payment.chain}
              </Badge>
            </div>
          </Card>
        </div>

        {/* Right Column - Payment Details */}
        <div className="space-y-6">
          {/* Status */}
          <Card>
            <CardHeader>
              <CardTitle>Payment Status</CardTitle>
            </CardHeader>
            <CardContent>
              <PaymentStatusDetailed status={payment.status} />

              {/* Show transaction hash if detected/settled */}
              {payment.txHash && (
                <div className="mt-4 pt-4 border-t">
                  <div className="text-xs text-muted-foreground mb-1">
                    Transaction Hash
                  </div>
                  <code className="text-xs font-mono break-all bg-muted px-2 py-1 rounded">
                    {payment.txHash}
                  </code>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Amount */}
          <Card>
            <CardHeader>
              <CardTitle>Amount Due</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="text-4xl font-bold">
                {formatCurrency(payment.amount)}
              </div>
              <div className="text-sm text-muted-foreground">
                Expected: {payment.expectedAmount} {payment.chain.toUpperCase()}
              </div>
            </CardContent>
          </Card>

          {/* Timer */}
          {!isCompleted && !isExpired && (
            <Card>
              <CardHeader>
                <CardTitle>Time Remaining</CardTitle>
                <CardDescription>
                  Complete payment before expiry
                </CardDescription>
              </CardHeader>
              <CardContent>
                <CountdownTimerWithLabel expiresAt={payment.expiresAt} />
              </CardContent>
            </Card>
          )}

          {/* Expired Message */}
          {isExpired && !isCompleted && (
            <Card className="border-destructive">
              <CardContent className="pt-6">
                <div className="text-center space-y-2">
                  <div className="text-4xl">⏱️</div>
                  <h3 className="font-semibold text-lg">Payment Expired</h3>
                  <p className="text-sm text-muted-foreground">
                    This payment request has expired. Please request a new payment link.
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Success Message */}
          {isCompleted && (
            <Card className="border-green-500 bg-green-50 dark:bg-green-950">
              <CardContent className="pt-6">
                <div className="text-center space-y-2">
                  <div className="text-4xl">✅</div>
                  <h3 className="font-semibold text-lg text-green-900 dark:text-green-100">
                    Payment Complete!
                  </h3>
                  <p className="text-sm text-green-700 dark:text-green-300">
                    Your payment has been settled successfully.
                  </p>
                  {payment.settledAt && (
                    <p className="text-xs text-green-600 dark:text-green-400">
                      Settled on {new Date(payment.settledAt).toLocaleString()}
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Instructions */}
          {!isCompleted && !isExpired && payment.status === 'pending' && (
            <Card>
              <CardHeader>
                <CardTitle>How to Pay</CardTitle>
              </CardHeader>
              <CardContent>
                <ol className="space-y-3 text-sm">
                  <li className="flex space-x-3">
                    <span className="flex-shrink-0 flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold">
                      1
                    </span>
                    <span>Open your {payment.chain} wallet</span>
                  </li>
                  <li className="flex space-x-3">
                    <span className="flex-shrink-0 flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold">
                      2
                    </span>
                    <span>Scan the QR code or copy the address</span>
                  </li>
                  <li className="flex space-x-3">
                    <span className="flex-shrink-0 flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold">
                      3
                    </span>
                    <span>Send exactly {payment.expectedAmount} {payment.chain.toUpperCase()}</span>
                  </li>
                  <li className="flex space-x-3">
                    <span className="flex-shrink-0 flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold">
                      4
                    </span>
                    <span>Wait for confirmation (this page updates automatically)</span>
                  </li>
                </ol>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="mt-12 pt-8 border-t text-center text-sm text-muted-foreground">
        <p>Powered by Stacks Payment Router • Secure cross-chain payments</p>
        {payment.metadata && (
          <p className="mt-2 text-xs">Reference: {JSON.stringify(payment.metadata)}</p>
        )}
      </div>
    </div>
  );
}
