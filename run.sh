#!/bin/bash

# Build both backend and filesystem server first
cd ./mcp-lab/backend && npm run build
cd ../../mcp-servers/filesystem-server && npm run build
cd ../.. # Go back to project root

# Run concurrently, adding DEBUG env var for backend
npx concurrently "DEBUG=@modelcontextprotocol/*,mcp* npm start --prefix mcp-lab/backend" "npm run dev --prefix mcp-lab/frontend"