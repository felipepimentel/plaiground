import { SandboxedToolRegistry } from '../sandboxed-tool-registry';
import { ToolManager } from '../tool-manager';

// Define user roles and permissions
enum UserRole {
    ANONYMOUS = 'anonymous',
    USER = 'user',
    ADMIN = 'admin',
}

// Sample user database
const users: Record<string, {
    id: string;
    role: UserRole;
    permissions: string[];
}> = {
    'anonymous': {
        id: 'anonymous',
        role: UserRole.ANONYMOUS,
        permissions: ['tools.list', 'text.read'],
    },
    'user1': {
        id: 'user1',
        role: UserRole.USER,
        permissions: ['tools.list', 'text.*', 'weather.get', 'weather.locations'],
    },
    'admin': {
        id: 'admin',
        role: UserRole.ADMIN,
        permissions: ['*'], // All permissions
    },
};

/**
 * Simple permission checker function
 */
function hasPermission(userId: string, permission: string): boolean {
    const user = users[userId] || users.anonymous;

    // Admin has all permissions
    if (user.role === UserRole.ADMIN) {
        return true;
    }

    // Check if user has the exact permission
    if (user.permissions.includes(permission)) {
        return true;
    }

    // Check for wildcard permissions like 'text.*'
    const permissionNamespace = permission.split('.')[0];
    if (user.permissions.includes(`${permissionNamespace}.*`)) {
        return true;
    }

    // Check for global wildcard
    if (user.permissions.includes('*')) {
        return true;
    }

    return false;
}

/**
 * Example demonstrating access control with MCP tools
 */
async function accessControlExample() {
    console.log('Starting access control example...');

    // Create a sandboxed tool registry
    const toolRegistry = new SandboxedToolRegistry({
        sandboxAllTools: true,
        executionHook: async (toolName, params, context) => {
            // Get the user ID from the context
            const userId = context.clientId || 'anonymous';

            // Check if the user has permission to execute this tool
            if (!hasPermission(userId, toolName)) {
                throw new Error(`Access denied: User ${userId} does not have permission to use ${toolName}`);
            }

            // Log the access attempt
            console.log(`ACCESS: User ${userId} executed ${toolName}`);

            // Tool execution will proceed if we don't throw an error
            return { allowed: true, userId };
        }
    });

    // Create tool manager with the access-controlled registry
    const toolManager = new ToolManager({
        toolRegistry,
        logging: {
            rpcCalls: true,
            toolCalls: true,
        },
    });

    // Register some example tools
    toolRegistry.registerTool({
        name: 'text.read',
        description: 'Read text from a source',
        parameters: {
            type: 'object',
            properties: {
                source: { type: 'string' },
            },
            required: ['source'],
        },
        execute: async (params) => {
            return { content: `Content from ${params.source}` };
        },
    });

    toolRegistry.registerTool({
        name: 'text.write',
        description: 'Write text to a destination',
        parameters: {
            type: 'object',
            properties: {
                destination: { type: 'string' },
                content: { type: 'string' },
            },
            required: ['destination', 'content'],
        },
        execute: async (params) => {
            return { success: true, destination: params.destination };
        },
    });

    toolRegistry.registerTool({
        name: 'admin.deleteUser',
        description: 'Delete a user (admin only)',
        parameters: {
            type: 'object',
            properties: {
                userId: { type: 'string' },
            },
            required: ['userId'],
        },
        execute: async (params) => {
            return { success: true, deleted: params.userId };
        },
    });

    // Test different user access scenarios
    console.log('\nTesting access control:');

    // Create mock client contexts
    const createContext = (clientId: string) => ({
        clientId,
        sessionId: `session_${clientId}`,
        sendMessage: () => Promise.resolve(),
    });

    const anonymousContext = createContext('anonymous');
    const userContext = createContext('user1');
    const adminContext = createContext('admin');

    // Test anonymous access
    console.log('\n=== Anonymous User ===');
    try {
        await toolRegistry.executeTool('text.read', { source: 'public-data' }, anonymousContext);
        console.log('✅ Anonymous can read text');
    } catch (error) {
        console.log(`❌ Error: ${error.message}`);
    }

    try {
        await toolRegistry.executeTool('text.write', { destination: 'public-file', content: 'test' }, anonymousContext);
        console.log('✅ Anonymous can write text');
    } catch (error) {
        console.log(`❌ Error: ${error.message}`);
    }

    // Test regular user access
    console.log('\n=== Regular User ===');
    try {
        await toolRegistry.executeTool('text.read', { source: 'user-data' }, userContext);
        console.log('✅ User can read text');
    } catch (error) {
        console.log(`❌ Error: ${error.message}`);
    }

    try {
        await toolRegistry.executeTool('text.write', { destination: 'user-file', content: 'test' }, userContext);
        console.log('✅ User can write text');
    } catch (error) {
        console.log(`❌ Error: ${error.message}`);
    }

    try {
        await toolRegistry.executeTool('admin.deleteUser', { userId: 'test-user' }, userContext);
        console.log('✅ User can delete users');
    } catch (error) {
        console.log(`❌ Error: ${error.message}`);
    }

    // Test admin access
    console.log('\n=== Admin User ===');
    try {
        await toolRegistry.executeTool('text.read', { source: 'system-data' }, adminContext);
        console.log('✅ Admin can read text');
    } catch (error) {
        console.log(`❌ Error: ${error.message}`);
    }

    try {
        await toolRegistry.executeTool('admin.deleteUser', { userId: 'test-user' }, adminContext);
        console.log('✅ Admin can delete users');
    } catch (error) {
        console.log(`❌ Error: ${error.message}`);
    }
}

// Run the example if this script is executed directly
if (require.main === module) {
    accessControlExample().catch(error => {
        console.error('Example failed:', error);
        process.exit(1);
    });
} 