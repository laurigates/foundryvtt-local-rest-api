#!/usr/bin/env node

/**
 * Connection Test Script for FoundryVTT Bridge Server
 *
 * This script tests the connection between the bridge server and FoundryVTT,
 * providing detailed diagnostics and troubleshooting suggestions.
 *
 * Usage: node test-connection.js [options]
 *
 * Options:
 *   --foundry-url <url>    FoundryVTT server URL (default: http://localhost:30000)
 *   --api-key <key>        API key for authentication
 *   --timeout <ms>         Connection timeout in milliseconds (default: 5000)
 *   --verbose              Enable verbose logging
 */

import { FoundrySocketClient } from './lib/socket-client.js';
import dotenv from 'dotenv';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const packageJson = require('../package.json');

// Load environment variables
dotenv.config();

// Parse command line arguments
const args = process.argv.slice(2);
const options = {
  foundryUrl: process.env.FOUNDRY_URL || 'http://localhost:30000',
  apiKey: process.env.API_KEY,
  timeout: 5000,
  verbose: false
};

for (let i = 0; i < args.length; i++) {
  switch (args[i]) {
    case '--foundry-url':
      options.foundryUrl = args[++i];
      break;
    case '--api-key':
      options.apiKey = args[++i];
      break;
    case '--timeout':
      options.timeout = parseInt(args[++i]);
      break;
    case '--verbose':
      options.verbose = true;
      break;
    case '--help':
      console.log(`
FoundryVTT Bridge Server Connection Test v${packageJson.version}

Usage: node test-connection.js [options]

Options:
  --foundry-url <url>    FoundryVTT server URL (default: http://localhost:30000)
  --api-key <key>        API key for authentication
  --timeout <ms>         Connection timeout in milliseconds (default: 5000)
  --verbose              Enable verbose logging
  --help                 Show this help message
`);
      process.exit(0);
  }
}

// Color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(level, message, data = null) {
  let color = colors.reset;
  let prefix = '';

  switch (level) {
    case 'success':
      color = colors.green;
      prefix = '✅';
      break;
    case 'error':
      color = colors.red;
      prefix = '❌';
      break;
    case 'warning':
      color = colors.yellow;
      prefix = '⚠️ ';
      break;
    case 'info':
      color = colors.cyan;
      prefix = 'ℹ️ ';
      break;
    case 'debug':
      if (!options.verbose) return;
      color = colors.blue;
      prefix = '🔍';
      break;
  }

  console.log(`${color}${prefix} ${message}${colors.reset}`, data || '');
}

async function testConnection() {
  log('info', `${colors.bright}FoundryVTT Bridge Server Connection Test${colors.reset}`);
  log('info', '='.repeat(50));
  log('info', `FoundryVTT URL: ${options.foundryUrl}`);
  log(
    'info',
    `API Key: ${options.apiKey ? options.apiKey.substring(0, 10) + '...' : colors.red + 'NOT SET' + colors.reset}`
  );
  log('info', `Timeout: ${options.timeout}ms`);
  log('info', '='.repeat(50));
  console.log();

  const client = new FoundrySocketClient({
    foundryUrl: options.foundryUrl,
    apiKey: options.apiKey,
    timeout: options.timeout,
    requestTimeout: options.timeout
  });

  // Step 1: Test basic socket connection
  log('info', 'Step 1: Testing Socket.io connection...');
  try {
    await client.connect();
    log('success', 'Socket.io connection established!');
    log('info', `Socket ID: ${client.socket.id}`);
  } catch (error) {
    log('error', `Failed to connect: ${error.message}`);

    // Get diagnostic information even on failure
    const diagnostics = client.getConnectionDiagnostics();

    if (diagnostics.lastError) {
      console.log();
      log('error', `Error Type: ${diagnostics.lastError.type}`);
      log('info', 'Troubleshooting suggestions:');
      diagnostics.lastError.troubleshooting.forEach((hint) => {
        console.log(`  ${colors.yellow}→ ${hint}${colors.reset}`);
      });
    }

    return false;
  }

  // Step 2: Test API endpoint (status check)
  console.log();
  log('info', 'Step 2: Testing REST API module communication...');
  try {
    const result = await client.sendRequest('/api/status', {
      method: 'GET',
      headers: { 'x-api-key': options.apiKey }
    });

    log('success', 'REST API module is responding!');
    log('debug', 'Status response:', JSON.stringify(result, null, 2));

    if (result.world) {
      log('info', `World: ${result.world.title || 'Unknown'}`);
      log('info', `System: ${result.world.system || 'Unknown'}`);
    }
  } catch (error) {
    log('error', `API communication failed: ${error.message}`);

    if (error.message.includes('401') || error.message.includes('unauthorized')) {
      log('warning', 'Authentication failed - check your API key');
      log(
        'info',
        'Make sure the API key matches the one configured in the FoundryVTT module settings'
      );
    } else if (error.message.includes('timeout')) {
      log('warning', 'Request timed out - the module may not be responding');
      log('info', 'Check that the REST API module is enabled in FoundryVTT');
    }
  }

  // Step 3: Get comprehensive diagnostics
  console.log();
  log('info', 'Step 3: Gathering diagnostic information...');
  const diagnostics = client.getConnectionDiagnostics();

  console.log();
  log('info', `${colors.bright}Connection Statistics:${colors.reset}`);
  log('info', `  Connection Attempts: ${diagnostics.statistics.connectionAttempts}`);
  log('info', `  Retry Count: ${diagnostics.statistics.retryCount}`);
  log('info', `  Pending Requests: ${diagnostics.statistics.pendingRequests}`);

  if (diagnostics.errorHistory.length > 0) {
    console.log();
    log(
      'warning',
      `${colors.bright}Error History (last ${diagnostics.errorHistory.length} errors):${colors.reset}`
    );
    diagnostics.errorHistory.forEach((error, index) => {
      log('warning', `  ${index + 1}. [${error.timestamp}] ${error.type}: ${error.message}`);
    });
  }

  const suggestions = client.getTroubleshootingSuggestions();
  if (suggestions.length > 0) {
    console.log();
    log('info', `${colors.bright}Additional Troubleshooting:${colors.reset}`);
    suggestions.forEach((suggestion) => {
      console.log(`  ${colors.yellow}→ ${suggestion}${colors.reset}`);
    });
  }

  // Disconnect
  client.disconnect();

  console.log();
  log('info', '='.repeat(50));

  if (client.isConnected) {
    log('success', 'Connection test completed successfully!');
    return true;
  } else {
    log('warning', 'Connection test completed with issues');
    return false;
  }
}

// Run the test
testConnection()
  .then((success) => {
    process.exit(success ? 0 : 1);
  })
  .catch((error) => {
    log('error', `Unexpected error: ${error.message}`);
    if (options.verbose) {
      console.error(error.stack);
    }
    process.exit(1);
  });
