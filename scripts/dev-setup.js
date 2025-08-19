#!/usr/bin/env node

const { spawn, exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const { startNgrok } = require('./start-ngrok');

const PORT = process.env.PORT || 3000;

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

function log(color, prefix, message) {
  console.log(`${color}${prefix}${colors.reset} ${message}`);
}

// Check if .env.local exists
function ensureEnvLocal() {
  const envLocalPath = path.resolve(process.cwd(), '.env.local');
  const envDevPath = path.resolve(process.cwd(), '.env.development');
  
  if (!fs.existsSync(envLocalPath)) {
    if (fs.existsSync(envDevPath)) {
      log(colors.yellow, '[ENV]', 'Copying .env.development to .env.local...');
      fs.copyFileSync(envDevPath, envLocalPath);
    } else {
      log(colors.yellow, '[ENV]', 'Creating .env.local from template...');
      const template = `NODE_ENV=development
PORT=3000
DB_SYNCHRONIZE=true
WEB_APP_URL=http://localhost:3000
ENABLE_TELEGRAM_POLLING=true
WEBHOOK_MODE=false

# Add your API keys:
OPENAI_API_KEY=your_openai_key_here
NOTION_API_KEY=your_notion_key_here
NOTION_DATABASE_ID=your_notion_database_id_here
TG_BOT_API_KEY=your_telegram_bot_key_here
`;
      fs.writeFileSync(envLocalPath, template);
      log(colors.red, '[ENV]', 'Please update .env.local with your API keys!');
      return false;
    }
  }
  return true;
}

// Start the development server
async function startDevServer() {
  log(colors.blue, '[DEV]', 'Starting development server...');
  
  const devServer = spawn('npm', ['run', 'dev'], {
    stdio: ['inherit', 'pipe', 'pipe'],
    env: { ...process.env, NODE_ENV: 'development' }
  });

  devServer.stdout.on('data', (data) => {
    const output = data.toString().trim();
    if (output) {
      log(colors.green, '[SERVER]', output);
    }
  });

  devServer.stderr.on('data', (data) => {
    const output = data.toString().trim();
    if (output && !output.includes('ExperimentalWarning')) {
      log(colors.red, '[SERVER]', output);
    }
  });

  return devServer;
}

// Start the frontend development server
async function startFrontend() {
  log(colors.blue, '[FRONTEND]', 'Starting frontend development server...');
  
  const frontend = spawn('npm', ['run', 'dev'], {
    cwd: path.join(process.cwd(), 'webapp'),
    stdio: ['inherit', 'pipe', 'pipe']
  });

  frontend.stdout.on('data', (data) => {
    const output = data.toString().trim();
    if (output) {
      log(colors.cyan, '[WEBAPP]', output);
    }
  });

  frontend.stderr.on('data', (data) => {
    const output = data.toString().trim();
    if (output && !output.includes('ExperimentalWarning')) {
      log(colors.red, '[WEBAPP]', output);
    }
  });

  return frontend;
}

// Main development setup
async function main() {
  console.log(`${colors.bright}🚀 Finance Tracker Development Setup${colors.reset}\n`);
  
  // Check environment
  if (!ensureEnvLocal()) {
    process.exit(1);
  }

  const useNgrok = process.argv.includes('--ngrok') || process.argv.includes('--tunnel');
  const skipFrontend = process.argv.includes('--backend-only');

  let processes = [];
  
  try {
    // Start ngrok if requested
    if (useNgrok) {
      log(colors.magenta, '[NGROK]', 'Starting ngrok tunnel...');
      const tunnel = await startNgrok(PORT);
      log(colors.magenta, '[NGROK]', `Tunnel active: ${tunnel.url}`);
    }

    // Start backend development server
    const devServer = await startDevServer();
    processes.push(devServer);

    // Wait a bit for server to start
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Start frontend if not skipped
    if (!skipFrontend) {
      const frontend = await startFrontend();
      processes.push(frontend);
    }

    log(colors.green, '[INFO]', `✅ Development environment ready!`);
    log(colors.green, '[INFO]', `🌐 Backend: http://localhost:${PORT}`);
    log(colors.green, '[INFO]', `📱 Frontend: http://localhost:5173`);
    if (useNgrok) {
      log(colors.green, '[INFO]', `🌍 Public: ${process.env.NGROK_URL || 'Check ngrok logs'}`);
    }
    log(colors.yellow, '[INFO]', `⏹️  Press Ctrl+C to stop all servers`);

  } catch (error) {
    log(colors.red, '[ERROR]', `Failed to start development environment: ${error.message}`);
    process.exit(1);
  }

  // Handle shutdown
  process.on('SIGINT', () => {
    log(colors.yellow, '[SHUTDOWN]', 'Stopping all development servers...');
    processes.forEach(proc => {
      if (!proc.killed) {
        proc.kill('SIGTERM');
      }
    });
    process.exit(0);
  });
}

if (require.main === module) {
  main();
}