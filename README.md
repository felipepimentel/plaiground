# MCP Lab

MCP Lab is a development environment for working with Model Context Protocol (MCP) servers.

## Features

- 🔌 Connect to multiple MCP servers simultaneously
- 🔎 Browse server resources, tools, and prompts
- 🔄 Test tools and interact with server capabilities
- 🧩 Auto-discovery of MCP servers
- 🔥 Hot-reload for dynamic server updates
- 🔄 Auto-connect to servers on startup or discovery
- 📁 Server categorization for better organization
- 📝 Server templates for quick creation

## Auto-Discovery

MCP Lab supports automatic discovery of servers in configured directories. This feature eliminates the need to manually configure each server in the `mcp-lab-config.json` file.

### Configuration

```json
{
  "mcpServers": {
    // Manually configured servers
  },
  "autoDiscovery": {
    "enabled": true,
    "directories": [
      "./mcp-lab/servers"
    ],
    "conventions": {
      "lookFor": ["index.js", "dist/index.js", "server.py"],
      "packageSignatures": ["mcp-framework", "@modelcontextprotocol"]
    },
    "hotReload": {
      "enabled": true,
      "watchFiles": true,
      "debounceMs": 1000
    },
    "defaultCategory": "Custom"
  }
}
```

### How Auto-Discovery Works

The system scans the specified directories for:

1. Node.js projects with `mcp-framework` or `@modelcontextprotocol` in their dependencies
2. Entry point files matching the `lookFor` patterns
3. Python servers with appropriate entry points

Discovered servers are automatically added to the available servers list in the UI.

## Hot Reload

The hot reload feature allows you to:

- Modify server code and have changes automatically detected
- Restart affected servers without manual intervention
- See server updates in real-time

You can also manually refresh the server list using the refresh button in the UI.

## Auto-Connect

Auto-connect automatically establishes connections to specified MCP servers:

```json
"connection": {
  "autoConnect": {
    "enabled": true,
    "servers": ["example1", "example2"],
    "onStartup": true,
    "onDiscovery": true
  },
  "reconnect": {
    "enabled": true,
    "maxAttempts": 3,
    "delayMs": 2000
  }
}
```

- **onStartup**: Connect to servers when MCP Lab starts
- **onDiscovery**: Connect to newly discovered servers automatically
- **reconnect**: Automatically reconnect servers after errors

## Server Categories

You can organize servers into categories for better management:

```json
"categories": {
  "order": ["Official", "Development", "Examples", "Custom"],
  "icons": {
    "Official": "fa-check-circle",
    "Development": "fa-code",
    "Examples": "fa-flask",
    "Custom": "fa-cog"
  }
}
```

Assign categories to servers:

```json
"ExampleServer1": {
  "type": "stdio",
  "command": "node",
  "args": ["server.js"],
  "description": "Example server",
  "category": "Examples"
}
```

## Server Templates

MCP Lab includes templates for quickly creating new servers:

```bash
# Create a new server from a template
node mcp-lab/create-server.js
```

Available templates:
- **typescript-basic**: Basic TypeScript MCP server
- **python-basic**: Basic Python MCP server

## Example Servers

The project includes example servers in the `mcp-lab/servers` directory:

- `example1`: A simple hello world server
- `example2`: A calculator server

These servers demonstrate how to create custom MCP servers that can be automatically discovered.

## Usage

1. Start the MCP Lab using `./run.sh`
2. Access the web interface at `http://localhost:3000`
3. Use the refresh button to scan for new servers
4. Connect to your MCP servers and explore their capabilities
5. Create new servers from templates using `node mcp-lab/create-server.js`
