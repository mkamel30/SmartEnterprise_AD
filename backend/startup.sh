#!/bin/bash
set -e

echo "Running database migrations..."
npx prisma db push --accept-data-loss

echo "Starting server..."
exec node server.js
