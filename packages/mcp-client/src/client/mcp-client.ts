import { McpError, McpErrorCode, PromptResult, PromptTemplate, Resource, ResourceContent, ServerCapabilities, ServerInfo, ToolCallResult } from '@plaiground/common';
import { AuthStatus, ConnectionEvent, ConnectionManager, ConnectionStatus } from '../connection/connection-manager';
import { HttpSseTransportConfig } from '../connection/http-sse-transport';
import { McpAuthCredentials } from '../connection/transport';
import { WsTransportConfig } from '../connection/ws-transport';

// Resource subscription callback
export type ResourceSubscriptionCallback = (content: ResourceContent) => void;

// Resource subscription handle
export interface ResourceSubscription {
    unsubscribe: () => Promise<void>;
}

/**
 * Main MCP client class that provides high-level APIs for MCP operations
 */
export class McpClient {
    private connectionManager: ConnectionManager;
    private resourceSubscriptions: Map<string, Set<ResourceSubscriptionCallback>> = new Map();

    constructor() {
        this.connectionManager = new ConnectionManager();
        this.connectionManager.addEventListener(this.handleConnectionEvent);
    }

    /**
     * Connect to an MCP server using HTTP/SSE transport
     */
    public async connectHttpSse(config: HttpSseTransportConfig): Promise<void> {
        await this.connectionManager.connectHttpSse(config);
    }

    /**
     * Connect to an MCP server using WebSocket transport
     */
    public async connectWebSocket(config: WsTransportConfig): Promise<void> {
        await this.connectionManager.connectWebSocket(config);
    }

    /**
     * Disconnect from the MCP server
     */
    public async disconnect(): Promise<void> {
        await this.connectionManager.disconnect();
    }

    /**
     * Get the current connection status
     */
    public getStatus(): ConnectionStatus {
        return this.connectionManager.getStatus();
    }

    /**
     * Get the current authentication status
     */
    public getAuthStatus(): AuthStatus {
        return this.connectionManager.getAuthStatus();
    }

    /**
     * Check if authentication is required
     */
    public isAuthRequired(): boolean {
        return this.connectionManager.getAuthStatus() === 'required';
    }

    /**
     * Check if the client is authenticated
     */
    public isAuthenticated(): boolean {
        return this.connectionManager.getAuthStatus() === 'authenticated';
    }

    /**
     * Get the list of supported authentication types
     */
    public getSupportedAuthTypes(): string[] {
        return this.connectionManager.getSupportedAuthTypes();
    }

    /**
     * Authenticate with the server
     */
    public async authenticate(credentials: McpAuthCredentials): Promise<void> {
        await this.connectionManager.authenticate(credentials);
    }

    /**
     * Get server information
     */
    public getServerInfo(): ServerInfo | null {
        return this.connectionManager.getServerInfo();
    }

    /**
     * Get server capabilities
     */
    public getServerCapabilities(): ServerCapabilities | null {
        return this.connectionManager.getServerCapabilities();
    }

    /**
     * Check if a capability is supported
     */
    public hasCapability(capability: keyof ServerCapabilities): boolean {
        const capabilities = this.connectionManager.getServerCapabilities();
        return capabilities ? !!capabilities[capability] : false;
    }

    /**
     * List available resources
     */
    public async listResources(): Promise<Resource[]> {
        this.assertCapability('resources');

        try {
            return await this.connectionManager.sendRequest<Resource[]>('resources.list');
        } catch (err) {
            throw McpError.internalError('Failed to list resources', err);
        }
    }

    /**
     * Read a resource
     */
    public async readResource(uri: string): Promise<ResourceContent> {
        this.assertCapability('resources');

        try {
            return await this.connectionManager.sendRequest<ResourceContent>('resources.read', { uri });
        } catch (err) {
            if (err instanceof McpError && err.code === McpErrorCode.ResourceNotFound) {
                throw McpError.resourceNotFound(uri, err);
            }
            throw McpError.internalError(`Failed to read resource: ${uri}`, err);
        }
    }

    /**
     * Subscribe to a resource
     */
    public async subscribeToResource(
        uri: string,
        callback: ResourceSubscriptionCallback
    ): Promise<ResourceSubscription> {
        this.assertCapability('resources');

        // Add callback to subscription map
        let callbacks = this.resourceSubscriptions.get(uri);
        if (!callbacks) {
            callbacks = new Set();
            this.resourceSubscriptions.set(uri, callbacks);

            // If this is the first subscriber, subscribe on the server
            try {
                await this.connectionManager.sendRequest('resources.subscribe', { uri });
            } catch (err) {
                this.resourceSubscriptions.delete(uri);
                throw McpError.internalError(`Failed to subscribe to resource: ${uri}`, err);
            }
        }

        callbacks.add(callback);

        // Initial read of the resource
        try {
            const content = await this.readResource(uri);
            callback(content);
        } catch (err) {
            console.error(`Error in initial resource read for ${uri}:`, err);
        }

        // Return an object with an unsubscribe method
        return {
            unsubscribe: async () => {
                const callbacks = this.resourceSubscriptions.get(uri);
                if (callbacks) {
                    callbacks.delete(callback);

                    // If there are no more subscribers, unsubscribe on the server
                    if (callbacks.size === 0) {
                        this.resourceSubscriptions.delete(uri);
                        try {
                            await this.connectionManager.sendRequest('resources.unsubscribe', { uri });
                        } catch (err) {
                            console.error(`Error unsubscribing from resource ${uri}:`, err);
                        }
                    }
                }
            },
        };
    }

    /**
     * List available tools
     */
    public async listTools(): Promise<Record<string, unknown>[]> {
        this.assertCapability('tools');

        try {
            return await this.connectionManager.sendRequest<Record<string, unknown>[]>('tools.list');
        } catch (err) {
            throw McpError.internalError('Failed to list tools', err);
        }
    }

    /**
     * Call a tool
     */
    public async callTool(
        name: string,
        args: Record<string, unknown> = {}
    ): Promise<unknown> {
        this.assertCapability('tools');

        try {
            const result = await this.connectionManager.sendRequest<ToolCallResult>(
                'tools.call',
                { name, args }
            );

            if (result.error) {
                throw McpError.toolExecutionError(name, result.error);
            }

            return result.result;
        } catch (err) {
            if (err instanceof McpError && err.code === McpErrorCode.ToolNotFound) {
                throw McpError.toolNotFound(name, err);
            }

            if (err instanceof McpError && err.code === McpErrorCode.ToolExecutionError) {
                throw err;
            }

            throw McpError.internalError(`Failed to call tool: ${name}`, err);
        }
    }

    /**
     * List available prompts
     */
    public async listPrompts(): Promise<PromptTemplate[]> {
        this.assertCapability('prompts');

        try {
            return await this.connectionManager.sendRequest<PromptTemplate[]>('prompts.list');
        } catch (err) {
            throw McpError.internalError('Failed to list prompts', err);
        }
    }

    /**
     * Render a prompt
     */
    public async renderPrompt(
        id: string,
        args: Record<string, unknown> = {}
    ): Promise<PromptResult> {
        this.assertCapability('prompts');

        try {
            return await this.connectionManager.sendRequest<PromptResult>(
                'prompts.render',
                { id, args }
            );
        } catch (err) {
            if (err instanceof McpError && err.code === McpErrorCode.PromptNotFound) {
                throw McpError.promptNotFound(id, err);
            }

            throw McpError.internalError(`Failed to render prompt: ${id}`, err);
        }
    }

    /**
     * Set the client's capabilities
     */
    public async setClientCapabilities(capabilities: Partial<ServerCapabilities>): Promise<void> {
        try {
            await this.connectionManager.sendRequest(
                'client.capabilities',
                capabilities
            );
        } catch (err) {
            throw McpError.internalError('Failed to set client capabilities', err);
        }
    }

    /**
     * Handle connection events
     */
    private handleConnectionEvent = (event: ConnectionEvent): void => {
        if (event.type === 'notification') {
            // Handle resource update notifications
            if (event.method === 'resources.update' && typeof event.params === 'object') {
                this.handleResourceUpdate(event.params as Record<string, unknown>);
            }
        }
    };

    /**
     * Handle resource update notifications
     */
    private handleResourceUpdate(params: Record<string, unknown>): void {
        const uri = params.uri as string;
        const content = params.content;
        const mimeType = params.mimeType as string;
        const encoding = params.encoding as string | undefined;

        if (!uri || content === undefined || !mimeType) {
            console.error('Invalid resource update notification:', params);
            return;
        }

        const callbacks = this.resourceSubscriptions.get(uri);
        if (callbacks) {
            const resourceContent: ResourceContent = {
                uri,
                content: content as string | Uint8Array,
                mimeType,
                encoding,
            };

            for (const callback of callbacks) {
                try {
                    callback(resourceContent);
                } catch (err) {
                    console.error(`Error in resource subscription callback for ${uri}:`, err);
                }
            }
        }
    }

    /**
     * Assert that a capability is supported
     */
    private assertCapability(capability: keyof ServerCapabilities): void {
        if (!this.hasCapability(capability)) {
            throw new McpError(
                McpErrorCode.InternalError,
                `Server does not support ${capability}`
            );
        }
    }
} 