#!/bin/bash

# Define the WebSocket Port
WS_PORT=8080

# Install and build shared package first (since it's used by both backend and frontend)
echo "Installing and building shared package..."
cd ./shared && npm install && npm run build
cd .. # Go back to project root

# Install and build backend
echo "Installing and building backend..."
cd ./mcp-lab/backend && npm install && npm run build
cd ../.. # Go back to project root

# Install frontend dependencies
echo "Installing frontend dependencies..."
cd ./mcp-lab/frontend && npm install
cd ../.. # Go back to project root

# Run concurrently, passing the defined port and using cross-env for DEBUG
echo "Starting servers..."
npx concurrently \
  "npx cross-env DEBUG='@modelcontextprotocol/*,mcp*' WS_PORT=$WS_PORT npm start --prefix mcp-lab/backend" \
  "npx cross-env VITE_WS_PORT=$WS_PORT npm run dev --prefix mcp-lab/frontend"