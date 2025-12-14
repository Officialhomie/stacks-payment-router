#!/bin/bash

# Database migration script

set -e

if [ -z "$DATABASE_URL" ]; then
  echo "Error: DATABASE_URL not set"
  exit 1
fi

echo "Running database migrations..."

# Run schema
psql $DATABASE_URL < infrastructure/database/schema.sql

echo "Migrations complete!"

