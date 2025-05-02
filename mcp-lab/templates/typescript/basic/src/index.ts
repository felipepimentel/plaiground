import { MCPServer, MCPTool } from 'mcp-framework';

/**
 * A sample tool that demonstrates how to implement an MCP tool
 */
class SampleTool extends MCPTool {
    name = '{{toolName}}';
    description = '{{toolDescription}}';

    schema = {
        input: {
            type: 'string',
            description: 'Input for the tool',
        },
    };

    async execute({ input }) {
        return `Processed: ${input || 'No input provided'}`;
    }
}

/**
 * Initialize and start the MCP server
 */
async function main() {
    const server = new MCPServer({
        name: '{{name}}',
        version: '1.0.0',
    });

    // Register your tools here
    server.registerTool(new SampleTool());

    // Start the server
    await server.start();
    console.log('{{name}} MCP server started!');
}

main().catch(error => {
    console.error('Error starting MCP server:', error);
    process.exit(1);
}); 