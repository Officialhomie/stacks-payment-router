import { Wallet, TransactionRequest } from 'ethers';
import { logger } from '@shared/utils/logger';

export class TransactionSigner {
  async sign(tx: TransactionRequest, wallet: Wallet): Promise<string> {
    logger.info('Signing transaction', { to: tx.to, value: tx.value });

    try {
      // Sign transaction with wallet
      const signedTx = await wallet.signTransaction(tx);
      logger.info('Transaction signed', { to: tx.to });
      return signedTx;
    } catch (error) {
      logger.error('Transaction signing failed', { error, to: tx.to });
      throw error;
    }
  }
}

