#!/usr/bin/env node

// Efficient session starter - provides all context Claude needs upfront
console.log('🚀 CLAUDE SESSION CONTEXT');
console.log('=========================');

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Project status
console.log('\n📊 PROJECT STATUS:');
const dbExists = fs.existsSync('data/database.sqlite');
const buildExists = fs.existsSync('dist/index.js');
console.log(`Database: ${dbExists ? '✅' : '❌'}`);
console.log(`Build: ${buildExists ? '✅' : '❌'}`);

// Git status (recent changes)
try {
  const gitStatus = execSync('git status --porcelain', { encoding: 'utf8' });
  const gitBranch = execSync('git branch --show-current', { encoding: 'utf8' }).trim();
  console.log(`Git: ${gitBranch} (${gitStatus ? 'uncommitted changes' : 'clean'})`);
} catch (e) {
  console.log('Git: Not available');
}

// Recent errors/logs
console.log('\n🔍 RECENT ACTIVITY:');
try {
  if (fs.existsSync('npm-debug.log')) {
    console.log('⚠️  npm-debug.log exists (check for errors)');
  }
  
  // Last 3 commits for context
  const commits = execSync('git log --oneline -3', { encoding: 'utf8' });
  console.log('Recent commits:');
  console.log(commits);
} catch (e) {
  console.log('No recent git activity');
}

// Architecture reminder
console.log('\n🏗️  CURRENT ARCHITECTURE:');
console.log('• SQLite + TypeORM (migrated from Notion)');
console.log('• Clean Architecture (Domain/App/Infrastructure)');
console.log('• Express API + React frontend + Telegram bot');
console.log('• 5 transactions, 10 categories, 1 user migrated');

console.log('\n💡 USAGE TIPS:');
console.log('• Reference this output when starting Claude sessions');
console.log('• Use specific file paths: src/modules/transaction/...');
console.log('• Batch related requests together');
console.log('• Use grep/glob for targeted searches');

console.log('\n📋 QUICK COMMANDS:');
console.log('npm run dev      - Start development');
console.log('npm test         - Run tests');
console.log('npm run build    - Build project');
console.log('node scripts/inspect-db.js - Check database');