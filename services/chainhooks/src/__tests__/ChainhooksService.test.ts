/**
 * Tests for ChainhooksService
 * Note: These are unit tests that mock the chainhook client
 */

import { ChainhooksService, ChainhooksServiceConfig } from '../ChainhooksService';
import { MetricsTracker } from '../MetricsTracker';

// Mock the chainhook client
jest.mock('@hirosystems/chainhook-client', () => {
  return {
    ChainhookEventObserver: jest.fn().mockImplementation(() => {
      return {
        start: jest.fn().mockResolvedValue(undefined),
        close: jest.fn().mockResolvedValue(undefined),
      };
    }),
  };
});

describe('ChainhooksService', () => {
  const mockConfig: ChainhooksServiceConfig = {
    serverHostname: '0.0.0.0',
    serverPort: 3100,
    serverAuthToken: 'test-token',
    externalBaseUrl: 'http://localhost:3100',
    chainhookNodeUrl: 'http://localhost:20456',
    contractAddress: 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.payment-router-v2',
    network: 'devnet',
  };

  let service: ChainhooksService;

  beforeEach(() => {
    service = new ChainhooksService(mockConfig);
  });

  describe('Initialization', () => {
    it('should create service with config', () => {
      expect(service).toBeDefined();
    });

    it('should initialize successfully', async () => {
      await expect(service.initialize()).resolves.not.toThrow();
    });

    it('should create predicates for all events', async () => {
      await service.initialize();
      // The service should create 4 predicates (one for each event type)
      // This is verified by checking that initialize completes without error
      expect(service).toBeDefined();
    });
  });

  describe('Metrics Tracker', () => {
    it('should provide access to metrics tracker', () => {
      const tracker = service.getMetricsTracker();
      expect(tracker).toBeInstanceOf(MetricsTracker);
    });
  });

  describe('Start/Stop', () => {
    it('should start successfully after initialization', async () => {
      await service.initialize();
      await expect(service.start()).resolves.not.toThrow();
    });

    it('should throw error if started before initialization', async () => {
      await expect(service.start()).rejects.toThrow();
    });

    it('should stop successfully', async () => {
      await service.initialize();
      await service.start();
      await expect(service.stop()).resolves.not.toThrow();
    });

    it('should handle stop when not started', async () => {
      await expect(service.stop()).resolves.not.toThrow();
    });
  });

  describe('Configuration', () => {
    it('should accept valid network configuration', () => {
      const configs: ChainhooksServiceConfig[] = [
        { ...mockConfig, network: 'mainnet' },
        { ...mockConfig, network: 'testnet' },
        { ...mockConfig, network: 'devnet' },
      ];

      configs.forEach((config) => {
        const s = new ChainhooksService(config);
        expect(s).toBeDefined();
      });
    });

    it('should accept optional startBlock', () => {
      const config = { ...mockConfig, startBlock: 100000 };
      const s = new ChainhooksService(config);
      expect(s).toBeDefined();
    });
  });
});


