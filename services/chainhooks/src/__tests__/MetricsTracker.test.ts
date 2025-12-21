/**
 * Tests for MetricsTracker
 */

import { MetricsTracker } from '../MetricsTracker';
import { ChainhookEvent } from '@shared/types';

describe('MetricsTracker', () => {
  let tracker: MetricsTracker;

  beforeEach(() => {
    tracker = new MetricsTracker();
  });

  describe('handlePaymentIntentCreated', () => {
    it('should create new user metrics for first payment', async () => {
      const event: ChainhookEvent = {
        event: 'payment-intent-created',
        intentId: 'test-intent-1',
        agent: 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM',
        sourceChain: 'ethereum',
      };

      await tracker.handlePaymentIntentCreated(event);

      const userMetrics = tracker.getUserMetrics(event.agent!);
      expect(userMetrics).toBeDefined();
      expect(userMetrics?.totalPayments).toBe(1);
      expect(userMetrics?.agentAddress).toBe(event.agent);
      expect(userMetrics?.sourceChains.ethereum).toBe(1);
    });

    it('should update existing user metrics', async () => {
      const agent = 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM';

      const event1: ChainhookEvent = {
        event: 'payment-intent-created',
        intentId: 'test-intent-1',
        agent,
        sourceChain: 'ethereum',
      };

      const event2: ChainhookEvent = {
        event: 'payment-intent-created',
        intentId: 'test-intent-2',
        agent,
        sourceChain: 'arbitrum',
      };

      await tracker.handlePaymentIntentCreated(event1);
      await tracker.handlePaymentIntentCreated(event2);

      const userMetrics = tracker.getUserMetrics(agent);
      expect(userMetrics?.totalPayments).toBe(2);
      expect(userMetrics?.sourceChains.ethereum).toBe(1);
      expect(userMetrics?.sourceChains.arbitrum).toBe(1);
    });

    it('should update protocol metrics', async () => {
      const event: ChainhookEvent = {
        event: 'payment-intent-created',
        intentId: 'test-intent-1',
        agent: 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM',
        sourceChain: 'ethereum',
      };

      await tracker.handlePaymentIntentCreated(event);

      const protocolMetrics = tracker.getProtocolMetrics();
      expect(protocolMetrics.totalPayments).toBe(1);
      expect(protocolMetrics.paymentsByChain.ethereum).toBe(1);
    });
  });

  describe('handlePaymentSettled', () => {
    it('should update user metrics with volume and fees', async () => {
      const agent = 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM';

      // Create payment intent first
      const intentEvent: ChainhookEvent = {
        event: 'payment-intent-created',
        intentId: 'test-intent-1',
        agent,
        sourceChain: 'ethereum',
      };
      await tracker.handlePaymentIntentCreated(intentEvent);

      // Settle payment
      const settleEvent: ChainhookEvent = {
        event: 'payment-settled',
        intentId: 'test-intent-1',
        agent,
        usdhAmount: '1000000', // 1 USDh in micro-USDh
        netAmount: '950000', // 0.95 USDh after fees
        feesPaid: '50000', // 0.05 USDh in fees
        sourceChain: 'ethereum',
      };

      await tracker.handlePaymentSettled(settleEvent);

      const userMetrics = tracker.getUserMetrics(agent);
      expect(userMetrics?.totalVolumeUSD).toBe(0.95);
      expect(userMetrics?.totalFeesGenerated).toBe(0.05);
    });

    it('should create fee metrics record', async () => {
      const settleEvent: ChainhookEvent = {
        event: 'payment-settled',
        intentId: 'test-intent-1',
        agent: 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM',
        usdhAmount: '1000000',
        netAmount: '950000',
        feesPaid: '50000',
        sourceChain: 'ethereum',
      };

      await tracker.handlePaymentSettled(settleEvent);

      const feeMetrics = tracker.getFeeMetrics('test-intent-1');
      expect(feeMetrics).toBeDefined();
      expect(feeMetrics?.intentId).toBe('test-intent-1');
      expect(feeMetrics?.settlementFee).toBe(0.05);
      expect(feeMetrics?.sourceChain).toBe('ethereum');
    });

    it('should calculate fee basis points correctly', async () => {
      const settleEvent: ChainhookEvent = {
        event: 'payment-settled',
        intentId: 'test-intent-1',
        agent: 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM',
        usdhAmount: '1000000', // 1 USDh
        netAmount: '950000',
        feesPaid: '50000', // 0.05 USDh = 50 bps
        sourceChain: 'ethereum',
      };

      await tracker.handlePaymentSettled(settleEvent);

      const feeMetrics = tracker.getFeeMetrics('test-intent-1');
      expect(feeMetrics?.settlementFeeBps).toBe(50);
    });

    it('should update protocol metrics', async () => {
      const settleEvent: ChainhookEvent = {
        event: 'payment-settled',
        intentId: 'test-intent-1',
        agent: 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM',
        usdhAmount: '1000000',
        netAmount: '950000',
        feesPaid: '50000',
        sourceChain: 'ethereum',
      };

      await tracker.handlePaymentSettled(settleEvent);

      const protocolMetrics = tracker.getProtocolMetrics();
      expect(protocolMetrics.totalVolumeUSD).toBe(0.95);
      expect(protocolMetrics.totalFeesCollected).toBe(0.05);
      expect(protocolMetrics.volumeByChain.ethereum).toBe(0.95);
    });
  });

  describe('getAllUserMetrics', () => {
    it('should return all user metrics', async () => {
      const agent1 = 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM';
      const agent2 = 'ST2CY5V39NHDPWSXMW9QDT3HC3GD6Q6XX4CFRK9AG';

      await tracker.handlePaymentIntentCreated({
        event: 'payment-intent-created',
        intentId: 'test-1',
        agent: agent1,
        sourceChain: 'ethereum',
      });

      await tracker.handlePaymentIntentCreated({
        event: 'payment-intent-created',
        intentId: 'test-2',
        agent: agent2,
        sourceChain: 'arbitrum',
      });

      const allMetrics = tracker.getAllUserMetrics();
      expect(allMetrics.length).toBe(2);
    });
  });

  describe('getAllFeeMetrics', () => {
    it('should return all fee metrics', async () => {
      await tracker.handlePaymentSettled({
        event: 'payment-settled',
        intentId: 'test-1',
        agent: 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM',
        usdhAmount: '1000000',
        netAmount: '950000',
        feesPaid: '50000',
        sourceChain: 'ethereum',
      });

      await tracker.handlePaymentSettled({
        event: 'payment-settled',
        intentId: 'test-2',
        agent: 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM',
        usdhAmount: '2000000',
        netAmount: '1900000',
        feesPaid: '100000',
        sourceChain: 'arbitrum',
      });

      const allFees = tracker.getAllFeeMetrics();
      expect(allFees.length).toBe(2);
    });
  });
});


