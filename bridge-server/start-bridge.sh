#!/bin/bash

# FoundryVTT REST API Bridge Server Startup Script
# This script helps configure and start the bridge server

set -e  # Exit on error

echo "🚀 FoundryVTT REST API Bridge Server"
echo "===================================="

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Error: Node.js is not installed"
    echo "Please install Node.js 16+ from https://nodejs.org/"
    exit 1
fi

# Check Node.js version
NODE_VERSION=$(node --version | cut -d'v' -f2)
NODE_MAJOR=$(echo $NODE_VERSION | cut -d'.' -f1)

if [ "$NODE_MAJOR" -lt 16 ]; then
    echo "❌ Error: Node.js version $NODE_VERSION is too old"
    echo "Please upgrade to Node.js 16+ from https://nodejs.org/"
    exit 1
fi

echo "✅ Node.js version: $NODE_VERSION"

# Check if we're in the bridge-server directory
if [ ! -f "package.json" ]; then
    echo "❌ Error: package.json not found"
    echo "Please run this script from the bridge-server directory"
    exit 1
fi

# Install dependencies if node_modules doesn't exist
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
    echo "✅ Dependencies installed"
fi

# Check if .env file exists
if [ ! -f ".env" ]; then
    echo "⚠️  No .env file found, creating from template..."
    cp .env.example .env
    echo "✅ Created .env file from template"
    echo ""
    echo "🔧 IMPORTANT: Please edit .env file with your settings:"
    echo "   - Set FOUNDRY_URL to your FoundryVTT server URL"
    echo "   - Set API_KEY to your FoundryVTT API key"
    echo ""
    echo "Press Enter to continue when ready, or Ctrl+C to exit..."
    read
fi

# Load environment variables
if [ -f ".env" ]; then
    export $(cat .env | grep -v '^#' | xargs)
fi

# Check required environment variables
if [ -z "$API_KEY" ]; then
    echo "❌ Error: API_KEY not set in .env file"
    echo "Please set API_KEY in .env file and try again"
    exit 1
fi

echo "🔧 Configuration:"
echo "   FoundryVTT URL: ${FOUNDRY_URL:-http://localhost:30000}"
echo "   Bridge Port: ${API_PORT:-3030}"
echo "   Request Timeout: ${REQUEST_TIMEOUT:-5000}ms"
echo "   API Key: ${API_KEY:0:8}***"
echo ""

# Check if FoundryVTT is accessible
echo "🔍 Checking FoundryVTT connection..."
FOUNDRY_URL_CHECK=${FOUNDRY_URL:-http://localhost:30000}

if curl -s --connect-timeout 5 "$FOUNDRY_URL_CHECK" > /dev/null; then
    echo "✅ FoundryVTT is accessible at $FOUNDRY_URL_CHECK"
else
    echo "⚠️  Warning: Cannot reach FoundryVTT at $FOUNDRY_URL_CHECK"
    echo "   Make sure FoundryVTT is running and accessible"
    echo "   The bridge server will attempt to connect anyway..."
fi

echo ""
echo "🚀 Starting bridge server..."
echo "   Press Ctrl+C to stop"
echo ""

# Start the server
if [ "$1" = "--dev" ]; then
    echo "🔧 Starting in development mode with auto-reload..."
    npm run dev
else
    npm start
fi