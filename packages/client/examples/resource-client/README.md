# Plaiground MCP - Resource Client Demo

This is a simple demonstration web application that showcases the resource management capabilities of the Plaiground MCP platform. The demo allows you to:

- Connect to a Plaiground MCP server
- Create, read, update, and delete resources
- View a list of all resources
- Preview different resource types (text, JSON, images, etc.)

## Getting Started

### Prerequisites

- A running Plaiground MCP server
- Modern web browser (Chrome, Firefox, Safari, or Edge)

### Running the Demo

1. Start your Plaiground MCP server
2. Open the `index.html` file in your web browser, or serve it using a local web server:

```bash
# Using python simple server
python -m http.server 8080

# Or using npx
npx serve
```

3. Access the application at `http://localhost:8080` (or whatever port your server is using)

## Usage

### Connecting to the Server

1. Enter the URL of your MCP server (default: `http://localhost:3000`)
2. Optionally enter a specific session ID, or leave blank to generate a new one
3. Click the "Connect" button

### Creating Resources

1. Fill in the resource type and name
2. Optionally provide tags (comma-separated)
3. Select the content type (text, JSON, image, or file)
4. Enter or upload the content based on the selected type
5. Click "Create Resource"

### Managing Resources

- Click on any resource in the left panel to view its details
- Use the "Update" button to modify the selected resource
- Use the "Delete" button to remove the selected resource
- Click "Refresh" to update the list of resources

## Resource Types

The demo supports various resource types:

- **Text**: Plain text, HTML, Markdown, etc.
- **JSON**: Structured data in JSON format
- **Images**: PNG, JPEG, GIF, etc.
- **Files**: Any binary file

## Implementation Details

The demo uses the Plaiground MCP client to communicate with the server:

```javascript
import { McpClient } from '../../../src/client.js';

// Create client instance
const client = new McpClient({
    url: serverUrl,
    transport: 'websocket', // or 'sse'
});

// Initialize and create session
await client.initialize();
const session = await client.createSession({ sessionId });

// Call resource management tools
const result = await client.callTool('listResources', {});
```

## License

This demo is part of the Plaiground MCP project and is licensed under the same terms as the main project. 