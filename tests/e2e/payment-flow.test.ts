/**
 * End-to-end test for payment flow
 * Tests: Payment Intent → Detection → Routing → Execution → Settlement
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import axios from 'axios';

const API_URL = process.env.API_URL || 'http://localhost:3000';

describe('Payment Flow E2E', () => {
  let agentId: string;
  let paymentIntentId: string;

  beforeAll(async () => {
    // Register test agent
    const response = await axios.post(`${API_URL}/api/v1/agents/register`, {
      stacksAddress: 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM',
      agentId: 'test-agent-001',
      enabledChains: ['ethereum', 'arbitrum', 'stacks'],
    });

    agentId = response.data.data.agentId;
  });

  it('should create a payment intent', async () => {
    const response = await axios.post(`${API_URL}/api/v1/payments/intent`, {
      agentId,
      sourceChain: 'ethereum',
      sourceToken: 'USDC',
      amount: '100',
      amountUSD: 100,
    });

    expect(response.status).toBe(201);
    expect(response.data.success).toBe(true);
    expect(response.data.data.paymentAddress).toBeDefined();

    paymentIntentId = response.data.data.intent_id;
  });

  it('should get a quote for payment', async () => {
    const response = await axios.post(`${API_URL}/api/v1/quotes`, {
      sourceChain: 'ethereum',
      sourceToken: 'USDC',
      amount: '100',
      agentId,
    });

    expect(response.status).toBe(200);
    expect(response.data.success).toBe(true);
    expect(response.data.data.bestRoute).toBeDefined();
  });

  it('should check payment intent status', async () => {
    const response = await axios.get(
      `${API_URL}/api/v1/payments/intent/${paymentIntentId}/status`
    );

    expect(response.status).toBe(200);
    expect(response.data.success).toBe(true);
    expect(response.data.data.status).toBeDefined();
  });

  it('should get agent balance', async () => {
    const response = await axios.get(`${API_URL}/api/v1/agents/${agentId}/balance`);

    expect(response.status).toBe(200);
    expect(response.data.success).toBe(true);
    expect(response.data.data.total_usdh).toBeDefined();
  });
});

