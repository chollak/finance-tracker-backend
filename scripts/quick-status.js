#!/usr/bin/env node

// Quick status check - saves tokens by providing summary upfront
const fs = require('fs');
const path = require('path');

console.log('🚀 Finance Tracker - Quick Status Check');
console.log('=====================================');

// Database status
const dbPath = path.join(__dirname, '../data/database.sqlite');
console.log(`📊 Database: ${fs.existsSync(dbPath) ? '✅ Ready' : '❌ Missing'}`);

// Build status  
const distPath = path.join(__dirname, '../dist');
console.log(`🔨 Build: ${fs.existsSync(distPath) ? '✅ Built' : '❌ Need Build'}`);

// Config status
try {
  const config = require('../dist/config/appConfig');
  console.log('⚙️  Config: ✅ Valid');
} catch (e) {
  console.log('⚙️  Config: ❌ Invalid');
}

// Package info
const pkg = require('../package.json');
console.log(`📦 Version: ${pkg.version}`);
console.log(`🏷️  Main: ${pkg.main}`);

console.log('\n💡 Use: node scripts/quick-status.js');
console.log('💡 Use: node scripts/inspect-db.js (for DB details)');