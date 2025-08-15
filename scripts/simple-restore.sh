#!/bin/bash

# Simple database restoration script (no SQLite3 dependency)
# Usage: ./simple-restore.sh <backup_file_path>

set -e

BACKUP_FILE="$1"
DB_PATH="data/database.sqlite"
CURRENT_BACKUP="data/database.sqlite.pre-restore.$(date +%Y%m%d_%H%M%S)"

if [ -z "$BACKUP_FILE" ]; then
    echo "Usage: $0 <backup_file_path>"
    echo "Example: $0 database.sqlite.backup"
    exit 1
fi

if [ ! -f "$BACKUP_FILE" ]; then
    echo "Error: Backup file '$BACKUP_FILE' not found"
    exit 1
fi

echo "🔄 Starting simple database restoration..."

# 1. Create backup of current database
echo "📦 Creating backup of current database..."
if [ -f "$DB_PATH" ]; then
    cp "$DB_PATH" "$CURRENT_BACKUP"
    echo "✅ Current database backed up to: $CURRENT_BACKUP"
else
    echo "ℹ️  No existing database found"
fi

# 2. Stop application if running
echo "🛑 Stopping application..."
docker compose down 2>/dev/null || echo "Application was not running"

# 3. Restore the database
echo "🔄 Restoring database..."
cp "$BACKUP_FILE" "$DB_PATH"

# 4. Start application
echo "🚀 Starting application..."
docker compose up -d

# 5. Wait for startup
echo "⏳ Waiting for application to start..."
sleep 5

# 6. Basic verification
echo "🔍 Testing API endpoint..."
if curl -s http://localhost:3000/api/transactions > /dev/null; then
    echo "✅ API is responding!"
else
    echo "⚠️  API might still be starting up - check logs with: docker compose logs app"
fi

echo ""
echo "🎉 Simple restoration completed!"
echo "💾 Previous database saved as: $CURRENT_BACKUP"
echo ""
echo "📊 Check your data:"
echo "   curl http://localhost:3000/api/transactions"
echo ""
echo "📋 View logs if needed:"
echo "   docker compose logs app"