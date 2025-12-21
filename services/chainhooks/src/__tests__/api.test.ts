/**
 * Tests for Metrics API
 */

import http from 'http';
import { MetricsApi } from '../api';
import { MetricsTracker } from '../MetricsTracker';

describe('MetricsApi', () => {
  let api: MetricsApi;
  let tracker: MetricsTracker;
  let server: http.Server;
  const port = 3102; // Use different port for testing

  beforeAll(async () => {
    tracker = new MetricsTracker();
    api = new MetricsApi(tracker, { hostname: '0.0.0.0', port });
    await api.start();
  });

  afterAll(async () => {
    await api.stop();
  });

  const makeRequest = (path: string): Promise<{ status: number; body: any }> => {
    return new Promise((resolve, reject) => {
      const req = http.request(
        {
          hostname: 'localhost',
          port,
          path,
          method: 'GET',
        },
        (res) => {
          let data = '';
          res.on('data', (chunk) => {
            data += chunk;
          });
          res.on('end', () => {
            try {
              const body = JSON.parse(data);
              resolve({ status: res.statusCode || 200, body });
            } catch (e) {
              resolve({ status: res.statusCode || 200, body: data });
            }
          });
        }
      );
      req.on('error', reject);
      req.end();
    });
  };

  describe('Health Check', () => {
    it('should return health status', async () => {
      const response = await makeRequest('/health');
      expect(response.status).toBe(200);
      expect(response.body.status).toBe('ok');
      expect(response.body.service).toBe('chainhooks-metrics');
    });
  });

  describe('Protocol Metrics', () => {
    it('should return protocol metrics', async () => {
      const response = await makeRequest('/metrics/protocol');
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('totalUsers');
      expect(response.body).toHaveProperty('totalPayments');
      expect(response.body).toHaveProperty('totalVolumeUSD');
      expect(response.body).toHaveProperty('totalFeesCollected');
    });
  });

  describe('User Metrics', () => {
    it('should return all user metrics', async () => {
      const response = await makeRequest('/metrics/users');
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('count');
      expect(response.body).toHaveProperty('users');
      expect(Array.isArray(response.body.users)).toBe(true);
    });

    it('should support pagination', async () => {
      const response = await makeRequest('/metrics/users?page=1&limit=10');
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('page', 1);
      expect(response.body).toHaveProperty('limit', 10);
    });

    it('should support sorting', async () => {
      const response = await makeRequest('/metrics/users?sortBy=volume&sortOrder=desc');
      expect(response.status).toBe(200);
    });

    it('should return 404 for non-existent user', async () => {
      const response = await makeRequest('/metrics/user/nonexistent');
      expect(response.status).toBe(404);
    });
  });

  describe('Fee Metrics', () => {
    it('should return all fee metrics', async () => {
      const response = await makeRequest('/metrics/fees');
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('count');
      expect(response.body).toHaveProperty('fees');
      expect(Array.isArray(response.body.fees)).toBe(true);
    });

    it('should support filtering by chain', async () => {
      const response = await makeRequest('/metrics/fees?chain=ethereum');
      expect(response.status).toBe(200);
    });

    it('should support date filtering', async () => {
      const response = await makeRequest(
        '/metrics/fees?fromDate=2024-01-01&toDate=2024-01-31'
      );
      expect(response.status).toBe(200);
    });

    it('should return 404 for non-existent fee', async () => {
      const response = await makeRequest('/metrics/fee/nonexistent');
      expect(response.status).toBe(404);
    });
  });

  describe('Metrics Summary', () => {
    it('should return metrics summary', async () => {
      const response = await makeRequest('/metrics/summary');
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('protocol');
      expect(response.body).toHaveProperty('topUsers');
      expect(response.body).toHaveProperty('recentFees');
      expect(response.body).toHaveProperty('summary');
    });

    it('should support date range filtering', async () => {
      const response = await makeRequest(
        '/metrics/summary?fromDate=2024-01-01&toDate=2024-01-31'
      );
      expect(response.status).toBe(200);
    });
  });

  describe('404 Handling', () => {
    it('should return 404 for unknown routes', async () => {
      const response = await makeRequest('/unknown-route');
      expect(response.status).toBe(404);
    });
  });
});


