/**
 * Retry Manager
 * Implements exponential backoff retry logic with circuit breaker pattern
 * for reliable route execution with automatic recovery
 */

import { Route, RouteStep } from '@shared/types';
import { logger } from '@shared/utils/logger';
import { db } from '../db';
import { getRedis } from '@shared/utils/redis';

// Retry configuration
interface RetryConfig {
  maxRetries: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  jitterPercent: number;
}

// Circuit breaker states
type CircuitState = 'closed' | 'open' | 'half-open';

interface CircuitBreakerConfig {
  failureThreshold: number;      // Number of failures before opening circuit
  recoveryTimeout: number;       // Time in ms before trying again
  successThreshold: number;      // Successes needed in half-open to close
  monitoringWindow: number;      // Window in ms for tracking failures
}

interface CircuitBreakerState {
  state: CircuitState;
  failures: number;
  successes: number;
  lastFailure: number;
  lastStateChange: number;
  failureTimestamps: number[];
}

interface RetryAttempt {
  attempt: number;
  timestamp: number;
  error: string;
  willRetry: boolean;
  nextRetryAt?: number;
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialDelayMs: 1000,       // 1 second
  maxDelayMs: 60000,          // 1 minute max
  backoffMultiplier: 2,       // Double each time
  jitterPercent: 20,          // Add ±20% randomness
};

const DEFAULT_CIRCUIT_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  recoveryTimeout: 60000,     // 1 minute
  successThreshold: 3,
  monitoringWindow: 300000,   // 5 minutes
};

// Error types that should trigger retry
const RETRYABLE_ERRORS = [
  'NETWORK_ERROR',
  'TIMEOUT',
  'RATE_LIMITED',
  'GAS_ESTIMATION_FAILED',
  'NONCE_TOO_LOW',
  'TRANSACTION_UNDERPRICED',
  'INSUFFICIENT_FUNDS_FOR_GAS',
  'RPC_ERROR',
  'CONNECTION_REFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
];

// Errors that should NOT be retried
const NON_RETRYABLE_ERRORS = [
  'INSUFFICIENT_BALANCE',
  'APPROVAL_REQUIRED',
  'INVALID_SIGNATURE',
  'CONTRACT_ERROR',
  'SLIPPAGE_EXCEEDED',
  'DEADLINE_EXCEEDED',
  'INVALID_ROUTE',
];

export class RetryManager {
  private retryConfig: RetryConfig;
  private circuitConfig: CircuitBreakerConfig;
  private circuitBreakers: Map<string, CircuitBreakerState> = new Map();

  constructor(
    retryConfig: Partial<RetryConfig> = {},
    circuitConfig: Partial<CircuitBreakerConfig> = {}
  ) {
    this.retryConfig = { ...DEFAULT_RETRY_CONFIG, ...retryConfig };
    this.circuitConfig = { ...DEFAULT_CIRCUIT_CONFIG, ...circuitConfig };
  }

  /**
   * Execute with retry logic
   */
  async retry(
    route: Route,
    paymentIntentId: string,
    error: Error,
    currentAttempt: number = 0
  ): Promise<string> {
    const circuitKey = this.getCircuitKey(route);

    // Check circuit breaker
    if (!this.canExecute(circuitKey)) {
      logger.warn('Circuit breaker open, failing fast', { 
        routeId: route.id, 
        circuitKey 
      });
      throw new Error(`Circuit breaker open for ${circuitKey}: ${error.message}`);
    }

    // Check if error is retryable
    if (!this.isRetryable(error)) {
      logger.error('Non-retryable error encountered', {
        routeId: route.id,
        error: error.message,
      });
      this.recordFailure(circuitKey);
      throw error;
    }

    // Check if we've exhausted retries
    if (currentAttempt >= this.retryConfig.maxRetries) {
      logger.error('Max retries exceeded', {
        routeId: route.id,
        attempts: currentAttempt,
        error: error.message,
      });
      this.recordFailure(circuitKey);
      await this.logRetryExhausted(route, paymentIntentId, error);
      throw new Error(`Route execution failed after ${currentAttempt} retries: ${error.message}`);
    }

    // Calculate delay with exponential backoff and jitter
    const delay = this.calculateDelay(currentAttempt);

    logger.info('Scheduling retry', {
      routeId: route.id,
      attempt: currentAttempt + 1,
      maxRetries: this.retryConfig.maxRetries,
      delayMs: delay,
      error: error.message,
    });

    // Log retry attempt
    await this.logRetryAttempt(route, paymentIntentId, currentAttempt, error, delay);

    // Wait before retry
    await this.sleep(delay);

    // The actual retry execution would be handled by the caller
    // This method schedules and tracks the retry
    return this.createRetryToken(route.id, currentAttempt + 1);
  }

  /**
   * Execute a function with automatic retry
   */
  async executeWithRetry<T>(
    operation: () => Promise<T>,
    operationName: string,
    context: { routeId?: string; chain?: string } = {}
  ): Promise<T> {
    const circuitKey = context.chain || 'default';
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.retryConfig.maxRetries; attempt++) {
      // Check circuit breaker
      if (!this.canExecute(circuitKey)) {
        throw new Error(`Circuit breaker open for ${circuitKey}`);
      }

      try {
        const result = await operation();
        
        // Record success for circuit breaker
        this.recordSuccess(circuitKey);
        
        if (attempt > 0) {
          logger.info('Operation succeeded after retry', {
            operationName,
            attempt,
            ...context,
          });
        }

        return result;
      } catch (error) {
        lastError = error as Error;

        // Check if retryable
        if (!this.isRetryable(lastError)) {
          this.recordFailure(circuitKey);
          throw lastError;
        }

        // Check if we've exhausted retries
        if (attempt >= this.retryConfig.maxRetries) {
          this.recordFailure(circuitKey);
          break;
        }

        // Calculate and apply delay
        const delay = this.calculateDelay(attempt);
        
        logger.warn('Operation failed, retrying', {
          operationName,
          attempt: attempt + 1,
          maxRetries: this.retryConfig.maxRetries,
          delayMs: delay,
          error: lastError.message,
          ...context,
        });

        await this.sleep(delay);
      }
    }

    throw lastError || new Error('Unknown error during retry');
  }

  /**
   * Check if an error is retryable
   */
  isRetryable(error: Error): boolean {
    const errorMessage = error.message.toUpperCase();
    const errorName = error.name?.toUpperCase() || '';

    // Check non-retryable first
    for (const nonRetryable of NON_RETRYABLE_ERRORS) {
      if (errorMessage.includes(nonRetryable) || errorName.includes(nonRetryable)) {
        return false;
      }
    }

    // Check retryable errors
    for (const retryable of RETRYABLE_ERRORS) {
      if (errorMessage.includes(retryable) || errorName.includes(retryable)) {
        return true;
      }
    }

    // Default: retry on unknown errors (conservative approach)
    return true;
  }

  /**
   * Calculate delay with exponential backoff and jitter
   */
  private calculateDelay(attempt: number): number {
    // Base delay with exponential backoff
    const exponentialDelay = this.retryConfig.initialDelayMs * 
      Math.pow(this.retryConfig.backoffMultiplier, attempt);

    // Cap at maximum delay
    const cappedDelay = Math.min(exponentialDelay, this.retryConfig.maxDelayMs);

    // Add jitter (randomness) to prevent thundering herd
    const jitterRange = cappedDelay * (this.retryConfig.jitterPercent / 100);
    const jitter = (Math.random() * 2 - 1) * jitterRange; // ±jitterPercent

    return Math.floor(cappedDelay + jitter);
  }

  /**
   * Circuit breaker: check if execution is allowed
   */
  private canExecute(circuitKey: string): boolean {
    const state = this.getCircuitState(circuitKey);

    switch (state.state) {
      case 'closed':
        return true;

      case 'open':
        // Check if recovery timeout has passed
        if (Date.now() - state.lastStateChange >= this.circuitConfig.recoveryTimeout) {
          this.transitionState(circuitKey, 'half-open');
          return true;
        }
        return false;

      case 'half-open':
        // Allow limited traffic in half-open state
        return true;

      default:
        return true;
    }
  }

  /**
   * Circuit breaker: record failure
   */
  private recordFailure(circuitKey: string): void {
    const state = this.getCircuitState(circuitKey);
    const now = Date.now();

    // Add failure timestamp
    state.failureTimestamps.push(now);

    // Remove old failures outside monitoring window
    state.failureTimestamps = state.failureTimestamps.filter(
      (ts) => now - ts < this.circuitConfig.monitoringWindow
    );

    state.failures = state.failureTimestamps.length;
    state.lastFailure = now;
    state.successes = 0; // Reset success counter

    // Check if we should open the circuit
    if (state.state === 'closed' && state.failures >= this.circuitConfig.failureThreshold) {
      this.transitionState(circuitKey, 'open');
    } else if (state.state === 'half-open') {
      // Any failure in half-open reopens the circuit
      this.transitionState(circuitKey, 'open');
    }

    this.circuitBreakers.set(circuitKey, state);
  }

  /**
   * Circuit breaker: record success
   */
  private recordSuccess(circuitKey: string): void {
    const state = this.getCircuitState(circuitKey);

    state.successes++;

    if (state.state === 'half-open' && state.successes >= this.circuitConfig.successThreshold) {
      this.transitionState(circuitKey, 'closed');
    }

    this.circuitBreakers.set(circuitKey, state);
  }

  /**
   * Get circuit breaker state
   */
  private getCircuitState(circuitKey: string): CircuitBreakerState {
    let state = this.circuitBreakers.get(circuitKey);

    if (!state) {
      state = {
        state: 'closed',
        failures: 0,
        successes: 0,
        lastFailure: 0,
        lastStateChange: Date.now(),
        failureTimestamps: [],
      };
      this.circuitBreakers.set(circuitKey, state);
    }

    return state;
  }

  /**
   * Transition circuit breaker state
   */
  private transitionState(circuitKey: string, newState: CircuitState): void {
    const state = this.getCircuitState(circuitKey);
    const oldState = state.state;

    state.state = newState;
    state.lastStateChange = Date.now();

    if (newState === 'closed') {
      state.failures = 0;
      state.failureTimestamps = [];
    }

    this.circuitBreakers.set(circuitKey, state);

    logger.info('Circuit breaker state transition', {
      circuitKey,
      oldState,
      newState,
    });
  }

  /**
   * Get circuit key for a route
   */
  private getCircuitKey(route: Route): string {
    // Use the first step's chain as the circuit key
    if (route.steps.length > 0) {
      return `chain:${route.steps[0].fromChain}`;
    }
    return 'default';
  }

  /**
   * Create retry token for tracking
   */
  private createRetryToken(routeId: string, attempt: number): string {
    return `retry:${routeId}:${attempt}:${Date.now()}`;
  }

  /**
   * Log retry attempt to database
   */
  private async logRetryAttempt(
    route: Route,
    paymentIntentId: string,
    attempt: number,
    error: Error,
    delayMs: number
  ): Promise<void> {
    try {
      await db.query(
        `INSERT INTO retry_logs (
          route_id, payment_intent_id, attempt, error_message, 
          delay_ms, scheduled_at, status
        ) VALUES ($1, $2, $3, $4, $5, NOW() + interval '${delayMs} milliseconds', 'scheduled')`,
        [route.id, paymentIntentId, attempt + 1, error.message, delayMs]
      );
    } catch (dbError) {
      logger.error('Failed to log retry attempt', { dbError, routeId: route.id });
    }
  }

  /**
   * Log when retries are exhausted
   */
  private async logRetryExhausted(
    route: Route,
    paymentIntentId: string,
    error: Error
  ): Promise<void> {
    try {
      await db.query(
        `UPDATE routes 
         SET status = 'failed', 
             failure_reason = $1,
             failed_at = NOW()
         WHERE id = $2`,
        [error.message, route.id]
      );

      await db.query(
        `UPDATE payment_intents 
         SET status = 'failed',
             failure_reason = $1
         WHERE id = $2`,
        [error.message, paymentIntentId]
      );
    } catch (dbError) {
      logger.error('Failed to log retry exhaustion', { dbError, routeId: route.id });
    }
  }

  /**
   * Get circuit breaker status for all circuits
   */
  getCircuitStatus(): Record<string, CircuitBreakerState> {
    const status: Record<string, CircuitBreakerState> = {};
    this.circuitBreakers.forEach((state, key) => {
      status[key] = { ...state };
    });
    return status;
  }

  /**
   * Reset circuit breaker for a specific key
   */
  resetCircuit(circuitKey: string): void {
    this.transitionState(circuitKey, 'closed');
    logger.info('Circuit breaker manually reset', { circuitKey });
  }

  /**
   * Reset all circuit breakers
   */
  resetAllCircuits(): void {
    this.circuitBreakers.forEach((_, key) => {
      this.transitionState(key, 'closed');
    });
    logger.info('All circuit breakers reset');
  }

  /**
   * Sleep helper
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export default RetryManager;
