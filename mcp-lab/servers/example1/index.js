import { MCPServer, MCPTool } from 'mcp-framework';

class HelloTool extends MCPTool {
    name = 'hello_world';
    description = 'A simple hello world tool';

    schema = {
        name: {
            type: 'string',
            description: 'Your name',
        },
    };

    async execute({ name }) {
        return `Hello, ${name || 'World'}!`;
    }
}

const server = new MCPServer();
server.registerTool(new HelloTool());

await server.start();
console.log('Example1 MCP server started!'); 