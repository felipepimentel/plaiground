import { MCPServer, MCPTool } from 'mcp-framework';

class CalculatorTool extends MCPTool {
    name = 'calculator';
    description = 'A simple calculator tool';

    schema = {
        operation: {
            type: 'string',
            description: 'Operation to perform (add, subtract, multiply, divide)',
            enum: ['add', 'subtract', 'multiply', 'divide']
        },
        a: {
            type: 'number',
            description: 'First number'
        },
        b: {
            type: 'number',
            description: 'Second number'
        }
    };

    async execute({ operation, a, b }) {
        switch (operation) {
            case 'add':
                return a + b;
            case 'subtract':
                return a - b;
            case 'multiply':
                return a * b;
            case 'divide':
                if (b === 0) throw new Error('Division by zero');
                return a / b;
            default:
                throw new Error(`Unsupported operation: ${operation}`);
        }
    }
}

const server = new MCPServer();
server.registerTool(new CalculatorTool());

await server.start();
console.log('Example2 MCP server started!'); 