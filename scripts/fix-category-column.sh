#!/bin/bash
# Emergency fix for missing category column

echo "🔧 Fixing missing category column..."

# Check if we're in Docker or local
if [ -f "/.dockerenv" ]; then
    DB_PATH="/app/data/database.sqlite"
else
    DB_PATH="./data/database.sqlite"
fi

echo "📍 Database path: $DB_PATH"

# Check if database exists
if [ ! -f "$DB_PATH" ]; then
    echo "❌ Database file not found at $DB_PATH"
    exit 1
fi

# Check if column already exists
COLUMN_EXISTS=$(sqlite3 "$DB_PATH" "PRAGMA table_info(transactions);" | grep -c "category")

if [ "$COLUMN_EXISTS" -gt 0 ]; then
    echo "✅ Category column already exists"
else
    echo "➕ Adding category column..."
    sqlite3 "$DB_PATH" "ALTER TABLE transactions ADD COLUMN category VARCHAR DEFAULT 'Другое';"
    
    if [ $? -eq 0 ]; then
        echo "✅ Category column added successfully"
    else
        echo "❌ Failed to add category column"
        exit 1
    fi
fi

echo "🎉 Migration complete!"