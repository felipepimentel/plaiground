import { McpClient } from '@plaiground/mcp-client';
import * as readline from 'readline';

/**
 * Simple chat application demo using MCP
 */
async function chatDemo() {
    console.log('Starting MCP Chat Demo...');
    console.log('=======================');

    // Create a unique user ID and room
    const userId = `user_${Math.floor(Math.random() * 10000)}`;
    const roomId = 'demo-chat-room';

    // Setup readline interface for user input
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    // Create MCP client
    const client = new McpClient({
        transport: {
            type: 'websocket',
            endpoint: 'ws://localhost:3000/api/mcp/ws',
        },
        autoReconnect: true,
        clientId: userId,
    });

    // Track chat messages
    const messages: { sender: string; content: string; timestamp: string }[] = [];

    // Function to display chat history
    const displayChatHistory = () => {
        console.clear();
        console.log('MCP Chat Demo - Room: ' + roomId);
        console.log('=======================');
        messages.forEach(msg => {
            console.log(`[${msg.timestamp}] ${msg.sender}: ${msg.content}`);
        });
        console.log('=======================');
        console.log('Type your message and press Enter (type /exit to quit)');
    };

    // Event handler for receiving chat messages
    const onChatMessage = (message: any) => {
        if (message.type === 'chat' && message.roomId === roomId) {
            messages.push({
                sender: message.sender,
                content: message.content,
                timestamp: new Date(message.timestamp).toLocaleTimeString(),
            });
            displayChatHistory();
        }
    };

    try {
        // Connect to MCP server
        await client.connect();
        console.log(`Connected to MCP server as ${userId}`);

        // Join chat room using custom tool
        await client.callTool('chat.joinRoom', { roomId });
        console.log(`Joined chat room: ${roomId}`);

        // Subscribe to chat messages
        client.on('message', onChatMessage);

        // System message about joining
        messages.push({
            sender: 'System',
            content: `You have joined the chat as ${userId}`,
            timestamp: new Date().toLocaleTimeString(),
        });
        displayChatHistory();

        // Handle user input
        const promptUser = () => {
            rl.question('', async (input) => {
                if (input.trim() === '/exit') {
                    await client.callTool('chat.leaveRoom', { roomId });
                    await client.disconnect();
                    rl.close();
                    console.log('Disconnected from chat. Goodbye!');
                    return;
                }

                // Send message to room
                await client.callTool('chat.sendMessage', {
                    roomId,
                    content: input,
                });

                promptUser();
            });
        };

        promptUser();

    } catch (error) {
        console.error('Error in chat demo:', error);
        rl.close();
        await client.disconnect();
    }
}

// Run the demo if this script is executed directly
if (require.main === module) {
    chatDemo().catch(error => {
        console.error('Chat demo failed:', error);
        process.exit(1);
    });
} 