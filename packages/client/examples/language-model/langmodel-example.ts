import { McpClient } from '@plaiground/mcp-client';
import * as readline from 'readline';

// Mock language model function (in a real implementation, this would call an actual LLM API)
async function callLanguageModel(prompt: string, tools: any[] = []): Promise<any> {
    console.log(`[LLM] Processing prompt: ${prompt.substring(0, 50)}...`);

    // Simulate API call delay
    await new Promise(resolve => setTimeout(resolve, 500));

    // Simple response generation based on the prompt
    let response = '';

    if (prompt.toLowerCase().includes('hello') || prompt.toLowerCase().includes('hi')) {
        response = 'Hello! How can I help you today?';
    } else if (prompt.toLowerCase().includes('weather')) {
        // Example of tool use - if tools are available, "use" the weather tool
        if (tools.some(t => t.name === 'weather.get')) {
            return {
                type: 'tool_call',
                tool: 'weather.get',
                params: {
                    location: prompt.includes('London') ? 'London' :
                        prompt.includes('New York') ? 'New York' : 'São Paulo',
                }
            };
        } else {
            response = 'I would check the weather for you, but I don\'t have access to that information right now.';
        }
    } else if (prompt.toLowerCase().includes('time')) {
        response = `The current time is ${new Date().toLocaleTimeString()}.`;
    } else if (prompt.toLowerCase().includes('thank')) {
        response = 'You\'re welcome! Is there anything else I can help with?';
    } else {
        response = 'I\'m not sure how to respond to that. Could you ask something else?';
    }

    return {
        type: 'completion',
        text: response
    };
}

/**
 * Example demonstrating integration with a language model
 */
async function languageModelExample() {
    console.log('Starting language model integration example...');

    // Create readline interface
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    // Create MCP client
    const client = new McpClient({
        transport: {
            type: 'http',
            endpoint: 'http://localhost:3000/api/mcp',
        },
        autoReconnect: true,
    });

    try {
        // Connect to MCP server
        await client.connect();
        console.log('Connected to MCP server');

        // Get available tools
        const availableTools = await client.listTools();
        console.log(`Available tools: ${availableTools.length}`);

        // Filter tools we want to expose to the language model
        const llmTools = availableTools.filter(tool =>
            tool.name.startsWith('text.') ||
            tool.name.startsWith('weather.') ||
            tool.name.startsWith('math.')
        );

        console.log(`Tools available to language model: ${llmTools.length}`);
        llmTools.forEach(tool => console.log(`- ${tool.name}: ${tool.description}`));

        console.log('\n=== Language Model Assistant ===');
        console.log('Type your questions (or /exit to quit)\n');

        // Start conversation loop
        const promptUser = async () => {
            rl.question('> ', async (input) => {
                if (input.trim().toLowerCase() === '/exit') {
                    await client.disconnect();
                    rl.close();
                    console.log('Goodbye!');
                    return;
                }

                try {
                    // Call language model with user input
                    const llmResponse = await callLanguageModel(input, llmTools);

                    // Handle different response types
                    if (llmResponse.type === 'completion') {
                        // Simple text completion
                        console.log(`Assistant: ${llmResponse.text}`);
                    }
                    else if (llmResponse.type === 'tool_call') {
                        // Tool call request from the LLM
                        console.log(`Assistant: Let me check that for you...`);

                        try {
                            // Call the requested tool through MCP
                            const toolResult = await client.callTool(
                                llmResponse.tool,
                                llmResponse.params
                            );

                            // Format the result nicely depending on the tool
                            if (llmResponse.tool === 'weather.get') {
                                console.log(`Assistant: The weather in ${llmResponse.params.location} is ${toolResult.temperature}°C, ${toolResult.condition}.`);
                            } else {
                                // For other tools, provide a generic response
                                console.log(`Assistant: I got this result: ${JSON.stringify(toolResult)}`);
                            }
                        } catch (toolError) {
                            console.log(`Assistant: I tried to get that information but encountered an error: ${toolError.message}`);
                        }
                    }
                } catch (error) {
                    console.error('Error processing your request:', error);
                    console.log('Assistant: Sorry, I encountered an error processing your request.');
                }

                // Continue the conversation
                promptUser();
            });
        };

        // Start the conversation
        promptUser();

    } catch (error) {
        console.error('Error in language model example:', error);
        rl.close();
        await client.disconnect();
    }
}

// Run the example if this script is executed directly
if (require.main === module) {
    languageModelExample().catch(error => {
        console.error('Language model example failed:', error);
        process.exit(1);
    });
} 