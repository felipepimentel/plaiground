#!/bin/bash

# Define the WebSocket Port
WS_PORT=8080

# Build backend
cd ./mcp-lab/backend && npm run build
cd ../.. # Go back to project root

# Run concurrently, passing the defined port and using cross-env for DEBUG
npx concurrently \
  "npx cross-env DEBUG='@modelcontextprotocol/*,mcp*' WS_PORT=$WS_PORT npm start --prefix mcp-lab/backend" \
  "npx cross-env VITE_WS_PORT=$WS_PORT npm run dev --prefix mcp-lab/frontend"