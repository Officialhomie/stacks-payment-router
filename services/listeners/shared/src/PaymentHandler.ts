import { ChainEvent } from '@shared/types';
import axios from 'axios';

export class PaymentHandler {
  private apiUrl: string;

  constructor(apiUrl: string = process.env.API_URL || 'http://localhost:3000') {
    this.apiUrl = apiUrl;
  }

  async handlePayment(event: ChainEvent): Promise<void> {
    try {
      // Send payment event to API
      await axios.post(`${this.apiUrl}/api/v1/webhooks/payment`, {
        chain: event.chain,
        txHash: event.txHash,
        blockNumber: event.blockNumber,
        blockHash: event.blockHash,
        from: event.from,
        to: event.to,
        tokenAddress: event.tokenAddress,
        amount: event.amount,
        amountUSD: event.amountUSD,
        timestamp: event.timestamp,
        confirmations: event.confirmations,
      });
    } catch (error) {
      console.error('Failed to send payment event to API', error);
      throw error;
    }
  }
}

