#!/bin/bash

# Docker-based safe database restoration script
# Usage: ./docker-safe-restore.sh <backup_file_path>

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

echo "🔄 Starting Docker-based safe database restoration..."

# 1. Create backup of current database
echo "📦 Creating backup of current database..."
cp "$DB_PATH" "$CURRENT_BACKUP"
echo "✅ Current database backed up to: $CURRENT_BACKUP"

# 2. Copy backup file to data directory for Docker access
BACKUP_IN_DATA="data/$(basename "$BACKUP_FILE")"
cp "$BACKUP_FILE" "$BACKUP_IN_DATA"
echo "📋 Backup file copied to: $BACKUP_IN_DATA"

# 3. Use Docker to check schemas and perform restoration
echo "🔍 Using Docker container to check schema compatibility..."

# Build temporary container for database operations
cat > /tmp/restore-script.sh << 'SCRIPT_EOF'
#!/bin/bash

BACKUP_FILE="/app/data/$(basename "$1")"
DB_PATH="/app/data/database.sqlite"
TEMP_DB="/app/data/temp_restore.sqlite"

echo "🔍 Checking schema compatibility using Docker..."

# Copy backup to temporary location
cp "$BACKUP_FILE" "$TEMP_DB"

# Check if backup has category column
BACKUP_HAS_CATEGORY=$(sqlite3 "$TEMP_DB" "PRAGMA table_info(transactions);" 2>/dev/null | grep -c "category" || echo "0")
CURRENT_HAS_CATEGORY=$(sqlite3 "$DB_PATH" "PRAGMA table_info(transactions);" 2>/dev/null | grep -c "category" || echo "0")

echo "📊 Backup has category column: $BACKUP_HAS_CATEGORY"
echo "📊 Current has category column: $CURRENT_HAS_CATEGORY"

# Handle schema migration if needed
if [ "$BACKUP_HAS_CATEGORY" -eq "0" ] && [ "$CURRENT_HAS_CATEGORY" -eq "1" ]; then
    echo "⚠️  Adding missing category column to backup data..."
    
    # Add category column to backup
    sqlite3 "$TEMP_DB" "ALTER TABLE transactions ADD COLUMN category varchar DEFAULT 'Другое';" 2>/dev/null || echo "Column might already exist"
    
    # Update all records to have default category
    sqlite3 "$TEMP_DB" "UPDATE transactions SET category = 'Другое' WHERE category IS NULL;" 2>/dev/null
    
    echo "✅ Category column added with default values"
elif [ "$BACKUP_HAS_CATEGORY" -eq "0" ] && [ "$CURRENT_HAS_CATEGORY" -eq "0" ]; then
    echo "ℹ️  Neither backup nor current database has category column - no migration needed"
else
    echo "ℹ️  Schema compatibility confirmed"
fi

# Restore the database
echo "🔄 Restoring database..."
cp "$TEMP_DB" "$DB_PATH"

# Verify restoration
echo "🔍 Verifying restoration..."
TRANSACTION_COUNT=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM transactions;" 2>/dev/null || echo "Could not count")
echo "📊 Database restored with $TRANSACTION_COUNT transactions"

# Clean up
rm -f "$TEMP_DB"

echo "✅ Docker-based restoration completed successfully!"
SCRIPT_EOF

# Make the script executable
chmod +x /tmp/restore-script.sh

# Run the restore script inside Docker container
echo "🐳 Running restoration inside Docker container..."
docker compose run --rm -v /tmp/restore-script.sh:/tmp/restore-script.sh app /tmp/restore-script.sh "$BACKUP_FILE"

# Clean up temporary files
rm -f "$BACKUP_IN_DATA" /tmp/restore-script.sh

echo ""
echo "🎉 Safe restoration completed successfully!"
echo "💾 Previous database saved as: $CURRENT_BACKUP"
echo ""
echo "🚀 You can now restart your application:"
echo "   docker compose up -d"