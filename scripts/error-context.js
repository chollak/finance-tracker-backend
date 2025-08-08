#!/usr/bin/env node

// Collects error context efficiently - saves tokens on debugging sessions
const fs = require('fs');
const { execSync } = require('child_process');

console.log('🐛 ERROR CONTEXT COLLECTOR');
console.log('===========================');

const errorSources = [
  { name: 'Build Errors', cmd: 'npm run build 2>&1 | tail -20' },
  { name: 'Test Errors', cmd: 'npm test 2>&1 | tail -10' },
  { name: 'TypeScript Errors', cmd: 'npx tsc --noEmit 2>&1 | head -10' },
];

console.log('\n🔍 CHECKING COMMON ERROR SOURCES:\n');

errorSources.forEach(source => {
  console.log(`📋 ${source.name}:`);
  try {
    const output = execSync(source.cmd, { encoding: 'utf8', timeout: 10000 });
    if (output.trim()) {
      console.log(output.trim());
    } else {
      console.log('✅ No errors');
    }
  } catch (error) {
    if (error.stdout) {
      console.log(error.stdout.trim());
    } else {
      console.log('❌ Command failed or no output');
    }
  }
  console.log('');
});

// Check for common log files
console.log('📁 LOG FILES:');
const logFiles = ['npm-debug.log', '.npm/_logs/*.log'];
let foundLogs = false;

logFiles.forEach(pattern => {
  try {
    const files = execSync(`ls ${pattern} 2>/dev/null || true`, { encoding: 'utf8' }).trim();
    if (files) {
      console.log(`Found: ${files}`);
      foundLogs = true;
    }
  } catch (e) {}
});

if (!foundLogs) {
  console.log('✅ No log files found');
}

console.log('\n💡 USAGE: Copy relevant sections to Claude for focused debugging');