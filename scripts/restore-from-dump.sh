#!/bin/bash

# Script to restore SQLite database from dump file
# Usage: ./restore-from-dump.sh <dump_file_path>

set -e  # Exit on error

DUMP_FILE="$1"
DB_PATH="${2:-data/database.sqlite}"
BACKUP_PATH="data/database.sqlite.backup.$(date +%Y%m%d_%H%M%S)"

if [ -z "$DUMP_FILE" ]; then
    echo "Usage: $0 <dump_file_path> [database_path]"
    echo "Example: $0 backup.sql data/database.sqlite"
    exit 1
fi

if [ ! -f "$DUMP_FILE" ]; then
    echo "Error: Dump file '$DUMP_FILE' not found"
    exit 1
fi

echo "🔄 Starting database restore process..."

# Create backup of current database if it exists
if [ -f "$DB_PATH" ]; then
    echo "📦 Creating backup of current database: $BACKUP_PATH"
    cp "$DB_PATH" "$BACKUP_PATH"
fi

# Restore from dump
echo "📥 Restoring from dump file: $DUMP_FILE"
sqlite3 "$DB_PATH" < "$DUMP_FILE"

echo "✅ Database restored successfully!"
echo "📊 Verifying tables..."

# Verify restoration
sqlite3 "$DB_PATH" "SELECT name FROM sqlite_master WHERE type='table';"

echo "🎉 Restore completed successfully!"
echo "💾 Backup saved as: $BACKUP_PATH"