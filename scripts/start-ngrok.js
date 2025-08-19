#!/usr/bin/env node

const { spawn, exec } = require('child_process');
const fs = require('fs');
const path = require('path');

// Function to check if ngrok is installed
function checkNgrokInstalled() {
  return new Promise((resolve) => {
    exec('ngrok version', (error) => {
      resolve(!error);
    });
  });
}

// Function to start ngrok and get the URL
async function startNgrok(port = 3000) {
  console.log('🚀 Starting ngrok tunnel...');
  
  const isInstalled = await checkNgrokInstalled();
  if (!isInstalled) {
    console.log('⚠️  ngrok is not installed.');
    console.log('💡 Install it with: npm install -g @ngrok/ngrok');
    console.log('💡 Or visit: https://ngrok.com/download');
    process.exit(1);
  }

  return new Promise((resolve, reject) => {
    const ngrok = spawn('ngrok', ['http', port.toString()], {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let tunnelUrl = null;
    let attempts = 0;
    const maxAttempts = 30; // 30 seconds

    const checkTunnel = () => {
      exec('curl -s http://127.0.0.1:4040/api/tunnels', (error, stdout) => {
        if (error) {
          attempts++;
          if (attempts < maxAttempts) {
            setTimeout(checkTunnel, 1000);
            return;
          }
          reject(new Error('Failed to get ngrok tunnel URL'));
          return;
        }

        try {
          const response = JSON.parse(stdout);
          const httpsTunnel = response.tunnels.find(t => t.proto === 'https');
          if (httpsTunnel) {
            tunnelUrl = httpsTunnel.public_url;
            console.log(`✅ ngrok tunnel active: ${tunnelUrl}`);
            
            // Update .env.local with ngrok URL
            updateEnvFile(tunnelUrl);
            resolve({ url: tunnelUrl, process: ngrok });
          } else {
            attempts++;
            if (attempts < maxAttempts) {
              setTimeout(checkTunnel, 1000);
            } else {
              reject(new Error('No HTTPS tunnel found'));
            }
          }
        } catch (parseError) {
          attempts++;
          if (attempts < maxAttempts) {
            setTimeout(checkTunnel, 1000);
          } else {
            reject(new Error('Failed to parse ngrok response'));
          }
        }
      });
    };

    ngrok.on('error', (error) => {
      console.error('❌ ngrok error:', error);
      reject(error);
    });

    // Start checking for tunnel after a short delay
    setTimeout(checkTunnel, 2000);
  });
}

// Function to update .env.local with ngrok URL
function updateEnvFile(ngrokUrl) {
  const envLocalPath = path.resolve(process.cwd(), '.env.local');
  
  if (!fs.existsSync(envLocalPath)) {
    console.log('⚠️  .env.local not found, creating it...');
    fs.writeFileSync(envLocalPath, '# Local development environment\n');
  }

  let envContent = fs.readFileSync(envLocalPath, 'utf8');
  
  // Update or add NGROK_URL
  if (envContent.includes('NGROK_URL=')) {
    envContent = envContent.replace(/NGROK_URL=.*$/m, `NGROK_URL=${ngrokUrl}`);
  } else {
    envContent += `\nNGROK_URL=${ngrokUrl}\n`;
  }

  // Update WEB_APP_URL for development
  if (envContent.includes('WEB_APP_URL=')) {
    envContent = envContent.replace(/WEB_APP_URL=.*$/m, `WEB_APP_URL=${ngrokUrl}`);
  } else {
    envContent += `\nWEB_APP_URL=${ngrokUrl}\n`;
  }

  fs.writeFileSync(envLocalPath, envContent);
  console.log('✅ Updated .env.local with ngrok URL');
}

// Main execution
async function main() {
  const port = process.argv[2] || 3000;
  
  try {
    const tunnel = await startNgrok(port);
    console.log('🌍 Public URL:', tunnel.url);
    console.log('🔧 Local URL: http://localhost:' + port);
    console.log('📱 Use this URL for Telegram bot testing');
    console.log('⏹️  Press Ctrl+C to stop');
    
    // Keep the process alive
    process.on('SIGINT', () => {
      console.log('\n🛑 Shutting down ngrok...');
      tunnel.process.kill();
      process.exit(0);
    });

    // Keep process alive
    setInterval(() => {}, 1000);
    
  } catch (error) {
    console.error('❌ Failed to start ngrok:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { startNgrok };