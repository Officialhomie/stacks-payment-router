// Database connection utility for listeners

import { Pool, QueryResult } from 'pg';

let pool: Pool | null = null;
let mockMode = false;

interface DbInterface {
  query: (text: string, params?: any[]) => Promise<QueryResult<any>>;
}

function getPool(): Pool | null {
  if (mockMode) {
    return null;
  }

  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      // Use mock mode for environments without database
      console.warn('DATABASE_URL not set, using mock database');
      mockMode = true;
      return null;
    }

    pool = new Pool({
      connectionString,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });

    pool.on('error', (err: Error) => {
      console.error('Unexpected database error:', err.message);
    });
  }

  return pool;
}

// Mock query result for when database is not available
function createMockResult(): QueryResult<any> {
  return {
    rows: [],
    rowCount: 0,
    command: 'SELECT',
    oid: 0,
    fields: [],
  };
}

export const db: DbInterface = {
  query: async (text: string, params?: any[]): Promise<QueryResult<any>> => {
    const p = getPool();
    if (!p) {
      return createMockResult();
    }
    return p.query(text, params);
  },
};

export default db;

