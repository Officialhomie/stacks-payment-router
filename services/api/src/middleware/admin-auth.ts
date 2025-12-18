import { Request, Response, NextFunction } from 'express';
import { logger } from '@shared/utils/logger';

/**
 * Admin authentication middleware
 * Checks if the request is from an authorized admin wallet address
 */
export function adminAuth(req: Request, res: Response, next: NextFunction) {
  // Get admin addresses from environment variable
  const adminAddresses = process.env.ADMIN_ADDRESSES
    ? process.env.ADMIN_ADDRESSES.split(',').map((addr) => addr.trim())
    : [];

  // For now, we'll use a simple header-based check
  // In production, this should verify a signed message from the wallet
  const adminAddress = req.headers['x-admin-address'] as string;

  if (!adminAddress) {
    logger.warn('Admin route accessed without admin address header');
    return res.status(401).json({
      success: false,
      error: 'Admin authentication required',
    });
  }

  if (adminAddresses.length > 0 && !adminAddresses.includes(adminAddress)) {
    logger.warn(`Unauthorized admin access attempt from ${adminAddress}`);
    return res.status(403).json({
      success: false,
      error: 'Unauthorized: Admin access required',
    });
  }

  // If no admin addresses configured, allow all (for development)
  if (adminAddresses.length === 0) {
    logger.warn('Admin authentication disabled - no ADMIN_ADDRESSES configured');
  }

  next();
}

