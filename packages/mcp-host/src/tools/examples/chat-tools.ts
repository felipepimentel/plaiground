import { SandboxedToolRegistry } from '../sandboxed-tool-registry';

// Simple in-memory chat rooms
const chatRooms: Record<string, {
    participants: Set<string>;
    messages: Array<{
        sender: string;
        content: string;
        timestamp: number;
    }>;
}> = {};

/**
 * Register chat tools to the registry
 */
export function registerChatTools(registry: SandboxedToolRegistry): void {
    // Create a chat room if it doesn't exist
    const ensureChatRoom = (roomId: string) => {
        if (!chatRooms[roomId]) {
            chatRooms[roomId] = {
                participants: new Set<string>(),
                messages: [],
            };
        }
        return chatRooms[roomId];
    };

    // Join a chat room
    registry.registerTool({
        name: 'chat.joinRoom',
        description: 'Join a chat room',
        parameters: {
            type: 'object',
            properties: {
                roomId: { type: 'string', description: 'ID of the room to join' },
            },
            required: ['roomId'],
        },
        execute: async (params, context) => {
            const { roomId } = params;
            const clientId = context.clientId;

            if (!clientId) {
                throw new Error('Client ID is required to join a chat room');
            }

            const room = ensureChatRoom(roomId);
            room.participants.add(clientId);

            // Notify all participants about the new member
            const systemMessage = {
                type: 'chat',
                roomId,
                sender: 'System',
                content: `${clientId} has joined the room`,
                timestamp: Date.now(),
            };

            for (const participantId of room.participants) {
                context.sendMessage(participantId, systemMessage);
            }

            return { success: true, roomId, participantCount: room.participants.size };
        },
    });

    // Leave a chat room
    registry.registerTool({
        name: 'chat.leaveRoom',
        description: 'Leave a chat room',
        parameters: {
            type: 'object',
            properties: {
                roomId: { type: 'string', description: 'ID of the room to leave' },
            },
            required: ['roomId'],
        },
        execute: async (params, context) => {
            const { roomId } = params;
            const clientId = context.clientId;

            if (!clientId) {
                throw new Error('Client ID is required to leave a chat room');
            }

            const room = chatRooms[roomId];
            if (!room) {
                return { success: false, error: 'Room not found' };
            }

            room.participants.delete(clientId);

            // Notify all participants about the member leaving
            const systemMessage = {
                type: 'chat',
                roomId,
                sender: 'System',
                content: `${clientId} has left the room`,
                timestamp: Date.now(),
            };

            for (const participantId of room.participants) {
                context.sendMessage(participantId, systemMessage);
            }

            // Clean up empty rooms
            if (room.participants.size === 0) {
                delete chatRooms[roomId];
            }

            return { success: true };
        },
    });

    // Send a message to a chat room
    registry.registerTool({
        name: 'chat.sendMessage',
        description: 'Send a message to a chat room',
        parameters: {
            type: 'object',
            properties: {
                roomId: { type: 'string', description: 'ID of the room to send the message to' },
                content: { type: 'string', description: 'Message content' },
            },
            required: ['roomId', 'content'],
        },
        execute: async (params, context) => {
            const { roomId, content } = params;
            const clientId = context.clientId;

            if (!clientId) {
                throw new Error('Client ID is required to send a message');
            }

            const room = chatRooms[roomId];
            if (!room) {
                return { success: false, error: 'Room not found' };
            }

            if (!room.participants.has(clientId)) {
                return { success: false, error: 'You must join the room first' };
            }

            const message = {
                sender: clientId,
                content,
                timestamp: Date.now(),
            };

            // Store the message
            room.messages.push(message);

            // Forward the message to all participants
            const chatMessage = {
                type: 'chat',
                roomId,
                ...message,
            };

            for (const participantId of room.participants) {
                context.sendMessage(participantId, chatMessage);
            }

            return { success: true };
        },
    });

    // Get messages from a chat room
    registry.registerTool({
        name: 'chat.getMessages',
        description: 'Get messages from a chat room',
        parameters: {
            type: 'object',
            properties: {
                roomId: { type: 'string', description: 'ID of the room' },
                limit: { type: 'number', description: 'Maximum number of messages to return' },
            },
            required: ['roomId'],
        },
        execute: async (params, context) => {
            const { roomId, limit = 50 } = params;
            const clientId = context.clientId;

            if (!clientId) {
                throw new Error('Client ID is required');
            }

            const room = chatRooms[roomId];
            if (!room) {
                return { success: false, error: 'Room not found' };
            }

            if (!room.participants.has(clientId)) {
                return { success: false, error: 'You must join the room first' };
            }

            // Return the most recent messages
            const messages = room.messages
                .slice(-limit)
                .map(msg => ({
                    sender: msg.sender,
                    content: msg.content,
                    timestamp: msg.timestamp,
                }));

            return {
                success: true,
                messages,
                participantCount: room.participants.size,
            };
        },
    });

    // List available chat rooms
    registry.registerTool({
        name: 'chat.listRooms',
        description: 'List available chat rooms',
        parameters: {
            type: 'object',
            properties: {},
        },
        execute: async (params, context) => {
            const rooms = Object.entries(chatRooms).map(([roomId, room]) => ({
                roomId,
                participantCount: room.participants.size,
                messageCount: room.messages.length,
            }));

            return { success: true, rooms };
        },
    });
}

/**
 * Example of setting up and using chat tools
 */
async function chatToolsExample() {
    console.log('Setting up chat tools...');

    // Create a sandboxed tool registry
    const toolRegistry = new SandboxedToolRegistry({
        sandboxAllTools: false, // Chat tools don't need sandboxing
    });

    // Register chat tools
    registerChatTools(toolRegistry);

    console.log('Chat tools registered:');
    console.log(toolRegistry.listTools().map(tool => tool.name));
}

// Run the example if this script is executed directly
if (require.main === module) {
    chatToolsExample().catch(error => {
        console.error('Example failed:', error);
        process.exit(1);
    });
} 