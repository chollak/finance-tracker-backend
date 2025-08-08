#!/usr/bin/env node

// Smart file explorer - helps you find exactly what Claude needs to see
const fs = require('fs');
const path = require('path');

function getFileStructure(dir, maxDepth = 2, currentDepth = 0, ignore = []) {
  if (currentDepth >= maxDepth) return [];
  
  const items = [];
  try {
    const entries = fs.readdirSync(dir);
    
    entries.forEach(entry => {
      if (ignore.some(pattern => entry.match(pattern))) return;
      
      const fullPath = path.join(dir, entry);
      const relativePath = path.relative('.', fullPath);
      const stat = fs.statSync(fullPath);
      
      if (stat.isDirectory()) {
        items.push({ type: 'dir', path: relativePath });
        if (currentDepth < maxDepth - 1) {
          items.push(...getFileStructure(fullPath, maxDepth, currentDepth + 1, ignore));
        }
      } else {
        const size = stat.size;
        const sizeStr = size > 10000 ? `(${Math.round(size/1000)}KB)` : '';
        items.push({ type: 'file', path: relativePath, size: sizeStr });
      }
    });
  } catch (e) {}
  
  return items;
}

const command = process.argv[2];

if (command === 'src') {
  console.log('📁 SOURCE CODE STRUCTURE:');
  const items = getFileStructure('src', 3, 0, [/node_modules/, /\.git/, /dist/]);
  items.forEach(item => {
    const prefix = item.type === 'dir' ? '📁' : '📄';
    console.log(`${prefix} ${item.path} ${item.size || ''}`);
  });
} else if (command === 'api') {
  console.log('🔌 API ENDPOINTS:');
  const items = getFileStructure('src/framework/express', 2, 0);
  items.filter(item => item.path.includes('.ts')).forEach(item => {
    console.log(`📄 ${item.path}`);
  });
} else if (command === 'db') {
  console.log('🗄️ DATABASE STRUCTURE:');
  const items = getFileStructure('src/database', 2, 0);
  items.forEach(item => {
    const prefix = item.type === 'dir' ? '📁' : '📄';
    console.log(`${prefix} ${item.path}`);
  });
} else {
  console.log('🗂️ SMART EXPLORER');
  console.log('==================');
  console.log('');
  console.log('Usage:');
  console.log('node scripts/explore.js src    - Show source code structure');
  console.log('node scripts/explore.js api    - Show API endpoints');
  console.log('node scripts/explore.js db     - Show database files');
  console.log('');
  console.log('💡 Use this to find exact file paths for Claude');
}