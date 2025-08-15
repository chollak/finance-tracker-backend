#!/bin/bash

# Safe database restoration script that handles schema differences
# Usage: ./safe-restore.sh <backup_file_path>

set -e

BACKUP_FILE="$1"
DB_PATH="data/database.sqlite"
TEMP_DB="data/temp_restore.sqlite"
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

echo "🔄 Starting safe database restoration..."

# 1. Create backup of current database
echo "📦 Creating backup of current database..."
cp "$DB_PATH" "$CURRENT_BACKUP"
echo "✅ Current database backed up to: $CURRENT_BACKUP"

# 2. Copy backup to temporary location
echo "📋 Analyzing backup file..."
cp "$BACKUP_FILE" "$TEMP_DB"

# 3. Check if backup has category column
echo "🔍 Checking schema compatibility..."
BACKUP_HAS_CATEGORY=$(sqlite3 "$TEMP_DB" "PRAGMA table_info(transactions);" | grep -c "category" || echo "0")
CURRENT_HAS_CATEGORY=$(sqlite3 "$DB_PATH" "PRAGMA table_info(transactions);" | grep -c "category" || echo "0")

echo "📊 Backup has category column: $BACKUP_HAS_CATEGORY"
echo "📊 Current has category column: $CURRENT_HAS_CATEGORY"

# 4. Handle schema migration if needed
if [ "$BACKUP_HAS_CATEGORY" -eq "0" ] && [ "$CURRENT_HAS_CATEGORY" -eq "1" ]; then
    echo "⚠️  Adding missing category column to backup data..."
    
    # Add category column to backup
    sqlite3 "$TEMP_DB" "ALTER TABLE transactions ADD COLUMN category varchar DEFAULT 'Другое';"
    
    # Update all records to have default category
    sqlite3 "$TEMP_DB" "UPDATE transactions SET category = 'Другое' WHERE category IS NULL;"
    
    echo "✅ Category column added with default values"
fi

# 5. Restore the database
echo "🔄 Restoring database..."
cp "$TEMP_DB" "$DB_PATH"

# 6. Clean up
rm "$TEMP_DB"

# 7. Verify restoration
echo "🔍 Verifying restoration..."
TRANSACTION_COUNT=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM transactions;")
echo "📊 Restored $TRANSACTION_COUNT transactions"

# Check category column
CATEGORY_COUNT=$(sqlite3 "$DB_PATH" "SELECT COUNT(DISTINCT category) FROM transactions;")
echo "📊 Found $CATEGORY_COUNT unique categories"

echo "✅ Safe restoration completed successfully!"
echo "💾 Previous database saved as: $CURRENT_BACKUP"
echo ""
echo "🚀 You can now restart your application:"
echo "   docker compose restart app"