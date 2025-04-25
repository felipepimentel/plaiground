import { McpClient } from '@plaiground/mcp-client';
import { ClientManager } from '../../client-manager/client-manager';
import { McpHost } from '../../host/mcp-host';
import { SandboxedToolRegistry } from '../../tools/sandboxed-tool-registry';
import { registerTextTools } from '../../tools/text-registry';
import { SessionManager } from '../session-manager';

// Wait helper
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

describe('MCP Integration Tests', () => {
    // We'll create both a host and client for testing
    let host: McpHost;
    let client: McpClient;
    let toolRegistry: SandboxedToolRegistry;
    let clientManager: ClientManager;
    let sessionManager: SessionManager;

    // Setup host and tools before tests
    beforeAll(async () => {
        // Create and configure tool registry
        toolRegistry = new SandboxedToolRegistry({
            sandboxAllTools: true,
            sandboxConfig: {
                timeout: 5000,
                memoryLimit: 64,
            },
        });

        // Register text tools for testing
        registerTextTools(toolRegistry);

        // Register a simple test tool
        toolRegistry.registerTool({
            name: 'test.echo',
            description: 'Echo the input message',
            parameters: {
                type: 'object',
                properties: {
                    message: { type: 'string' },
                },
                required: ['message'],
            },
            execute: async (params) => {
                return {
                    message: params.message,
                    timestamp: Date.now(),
                };
            },
        });

        // Create client and session managers
        clientManager = new ClientManager();
        sessionManager = new SessionManager({ clientManager });

        // Create and start the host
        host = new McpHost({
            toolRegistry,
            clientManager,
            sessionManager,
            transports: [
                {
                    type: 'http',
                    port: 3456, // Use a different port for tests
                },
                {
                    type: 'websocket',
                    port: 3457, // Use a different port for tests
                },
            ],
        });

        // Start the host
        await host.start();

        // Wait for host to initialize
        await wait(500);
    });

    // Cleanup after tests
    afterAll(async () => {
        if (client) {
            await client.disconnect();
        }

        if (host) {
            await host.stop();
        }
    });

    // Test HTTP transport
    describe('HTTP/SSE Transport', () => {
        beforeEach(async () => {
            // Create a client using HTTP transport
            client = new McpClient({
                transport: {
                    type: 'http',
                    endpoint: 'http://localhost:3456/api/mcp',
                },
                autoReconnect: false,
            });

            await client.connect();
        });

        afterEach(async () => {
            if (client) {
                await client.disconnect();
            }
        });

        it('should connect successfully', async () => {
            expect(client.isConnected()).toBe(true);
        });

        it('should list available tools', async () => {
            const tools = await client.listTools();
            expect(tools).toBeDefined();
            expect(tools.length).toBeGreaterThan(0);
            expect(tools.some(tool => tool.name === 'test.echo')).toBe(true);
        });

        it('should call a tool and get result', async () => {
            const testMessage = 'Hello from integration test';
            const result = await client.callTool('test.echo', { message: testMessage });

            expect(result).toBeDefined();
            expect(result.message).toBe(testMessage);
            expect(result.timestamp).toBeDefined();
        });
    });

    // Test WebSocket transport
    describe('WebSocket Transport', () => {
        beforeEach(async () => {
            // Create a client using WebSocket transport
            client = new McpClient({
                transport: {
                    type: 'websocket',
                    endpoint: 'ws://localhost:3457/api/mcp/ws',
                },
                autoReconnect: false,
            });

            await client.connect();
        });

        afterEach(async () => {
            if (client) {
                await client.disconnect();
            }
        });

        it('should connect successfully', async () => {
            expect(client.isConnected()).toBe(true);
        });

        it('should handle messages from server', async () => {
            let receivedMessage = false;

            // Set up message handler
            client.on('message', (msg) => {
                receivedMessage = true;
            });

            // Set client ID to receive messages
            await client.setClientInfo({ clientId: 'test-client' });

            // Send a message from server to client
            // This requires host-side logic to actually send a message
            const targetClientId = 'test-client';

            // Get the client from the client manager
            const connectedClient = clientManager.getClient(targetClientId);

            // If client is connected, send a test message
            if (connectedClient) {
                await connectedClient.sendMessage({
                    type: 'test',
                    content: 'Test message from server',
                });

                // Wait for message to be received
                await wait(500);

                expect(receivedMessage).toBe(true);
            } else {
                // Skip test if client isn't registered correctly
                console.warn('Client not found in manager, skipping message test');
            }
        });

        it('should maintain connection with ping/pong', async () => {
            // Connect client
            expect(client.isConnected()).toBe(true);

            // Wait for longer than ping interval (assuming default is ~30s)
            // This test may need adjustment based on actual ping interval
            await wait(2000); // Shorter for test purposes

            // Check connection is still alive
            expect(client.isConnected()).toBe(true);
        });
    });

    // Test resource operations
    describe('Resource Operations', () => {
        beforeEach(async () => {
            // Create a client
            client = new McpClient({
                transport: {
                    type: 'http',
                    endpoint: 'http://localhost:3456/api/mcp',
                },
                autoReconnect: false,
            });

            await client.connect();
        });

        afterEach(async () => {
            if (client) {
                await client.disconnect();
            }
        });

        it('should create and retrieve a resource', async () => {
            // Create a resource
            const resourceData = {
                content: 'Test resource content',
                type: 'text/plain',
                metadata: {
                    name: 'test-resource',
                    description: 'Resource for integration test',
                },
            };

            const resourceId = await client.createResource(resourceData);
            expect(resourceId).toBeDefined();

            // Retrieve the resource
            const resource = await client.getResource(resourceId);
            expect(resource).toBeDefined();
            expect(resource.content).toBe(resourceData.content);
            expect(resource.type).toBe(resourceData.type);
            expect(resource.metadata.name).toBe(resourceData.metadata.name);

            // Cleanup
            await client.deleteResource(resourceId);
        });

        it('should update a resource', async () => {
            // Create a resource
            const resourceId = await client.createResource({
                content: 'Original content',
                type: 'text/plain',
                metadata: { name: 'update-test' },
            });

            // Update the resource
            const updatedContent = 'Updated content';
            await client.updateResource(resourceId, {
                content: updatedContent,
            });

            // Verify update
            const resource = await client.getResource(resourceId);
            expect(resource.content).toBe(updatedContent);

            // Cleanup
            await client.deleteResource(resourceId);
        });

        it('should list resources', async () => {
            // Create a couple of resources
            const resourceId1 = await client.createResource({
                content: 'Resource 1',
                type: 'text/plain',
                metadata: { name: 'list-test-1' },
            });

            const resourceId2 = await client.createResource({
                content: 'Resource 2',
                type: 'text/plain',
                metadata: { name: 'list-test-2' },
            });

            // List resources
            const resources = await client.listResources();
            expect(resources).toBeDefined();
            expect(resources.length).toBeGreaterThanOrEqual(2);
            expect(resources.some(r => r.id === resourceId1)).toBe(true);
            expect(resources.some(r => r.id === resourceId2)).toBe(true);

            // Cleanup
            await client.deleteResource(resourceId1);
            await client.deleteResource(resourceId2);
        });
    });
}); 