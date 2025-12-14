#!/bin/bash
# Run database migrations

set -e

DATABASE_URL=${DATABASE_URL:-postgresql://payment_router:payment_router_dev@localhost:5432/payment_router}

echo "Running database migrations..."

psql "$DATABASE_URL" -f infrastructure/database/schema.sql

echo "Migrations completed!"

