'use client';

import React, { useEffect, useRef, useState } from 'react';
import QRCodeLib from 'qrcode';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

interface QRCodeProps {
  value: string;
  size?: number;
  level?: 'L' | 'M' | 'Q' | 'H';
  includeMargin?: boolean;
  fgColor?: string;
  bgColor?: string;
  imageSettings?: {
    src: string;
    height: number;
    width: number;
    excavate?: boolean;
  };
  onDownload?: () => void;
  className?: string;
  showDownload?: boolean;
}

/**
 * QR Code Component
 * Generates a QR code for payment addresses with download functionality
 */
export function QRCode({
  value,
  size = 256,
  level = 'H',
  includeMargin = true,
  fgColor = '#000000',
  bgColor = '#ffffff',
  imageSettings,
  onDownload,
  className,
  showDownload = true,
}: QRCodeProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Generate QR code
  useEffect(() => {
    if (!canvasRef.current || !value) return;

    setIsGenerating(true);
    setError(null);

    QRCodeLib.toCanvas(
      canvasRef.current,
      value,
      {
        width: size,
        margin: includeMargin ? 4 : 0,
        errorCorrectionLevel: level,
        color: {
          dark: fgColor,
          light: bgColor,
        },
      },
      (err) => {
        setIsGenerating(false);
        if (err) {
          console.error('QR Code generation error:', err);
          setError('Failed to generate QR code');
        }
      }
    );
  }, [value, size, level, includeMargin, fgColor, bgColor]);

  // Download QR code as PNG
  const handleDownload = () => {
    if (!canvasRef.current) return;

    canvasRef.current.toBlob((blob) => {
      if (!blob) return;

      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `payment-qr-${Date.now()}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      if (onDownload) {
        onDownload();
      }
    });
  };

  if (error) {
    return (
      <Card className={cn('p-8 text-center', className)}>
        <p className="text-sm text-destructive">{error}</p>
      </Card>
    );
  }

  return (
    <div className={cn('flex flex-col items-center space-y-4', className)}>
      <div
        className={cn(
          'relative rounded-lg border bg-white p-4 shadow-sm',
          isGenerating && 'animate-pulse'
        )}
      >
        <canvas
          ref={canvasRef}
          className="block"
          style={{ width: size, height: size }}
        />
      </div>

      {showDownload && (
        <Button
          variant="outline"
          size="sm"
          onClick={handleDownload}
          disabled={isGenerating || !!error}
        >
          Download QR Code
        </Button>
      )}
    </div>
  );
}

/**
 * Simple QR Code wrapper for addresses
 */
export function PaymentQRCode({
  address,
  size = 256,
  className,
}: {
  address: string;
  size?: number;
  className?: string;
}) {
  return (
    <QRCode
      value={address}
      size={size}
      level="H"
      className={className}
      showDownload={true}
    />
  );
}
