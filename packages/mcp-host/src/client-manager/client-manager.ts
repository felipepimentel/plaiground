import { McpError, McpErrorCode } from '@plaiground/common';
import { HttpSseTransportConfig, McpClient } from '@plaiground/mcp-client';
import EventEmitter from 'eventemitter3';
import { ClientContext, ClientContextProps } from './client-context';

/**
 * Client manager events
 */
export interface ClientManagerEvents {
    /**
     * Emitted when a client connects
     */
    clientConnected: [ClientContext];

    /**
     * Emitted when a client disconnects
     */
    clientDisconnected: [ClientContext];

    /**
     * Emitted when a client is removed from the manager
     */
    clientRemoved: [string];
}

/**
 * Options for connecting a new client
 */
export interface ConnectClientOptions {
    /**
     * Custom ID for the client
     */
    id?: string;

    /**
     * Initial metadata for the client
     */
    metadata?: Record<string, unknown>;
}

/**
 * Manages connected client contexts
 */
export class ClientManager extends EventEmitter<ClientManagerEvents> {
    /**
     * Map of client contexts indexed by their ID
     */
    private clients: Map<string, ClientContext> = new Map();

    /**
     * Creates a new client manager
     */
    constructor() {
        super();
    }

    /**
     * Adds a client to the manager
     */
    public addClient(client: ClientContext): void {
        if (this.clients.has(client.id)) {
            throw new McpError({
                code: McpErrorCode.DUPLICATE_CLIENT_ID,
                message: `Client with ID ${client.id} already exists`,
            });
        }

        this.clients.set(client.id, client);

        // Listen for client disconnection
        client.on('disconnected', () => {
            this.emit('clientDisconnected', client);
        });

        // Emit client connected event
        this.emit('clientConnected', client);
    }

    /**
     * Creates and adds a new client with the given props
     */
    public createClient(id: string, props: ClientContextProps = {}): ClientContext {
        if (this.clients.has(id)) {
            throw new McpError({
                code: McpErrorCode.DUPLICATE_CLIENT_ID,
                message: `Client with ID ${id} already exists`,
            });
        }

        const client = new ClientContext(id, props);
        this.addClient(client);
        return client;
    }

    /**
     * Gets a client by ID
     */
    public getClient(id: string): ClientContext | undefined {
        return this.clients.get(id);
    }

    /**
     * Gets all clients
     */
    public getAllClients(): ClientContext[] {
        return Array.from(this.clients.values());
    }

    /**
     * Removes a client from the manager
     */
    public removeClient(id: string): boolean {
        const client = this.clients.get(id);
        if (client) {
            this.clients.delete(id);
            this.emit('clientRemoved', id);
            return true;
        }
        return false;
    }

    /**
     * Checks if a client exists
     */
    public hasClient(id: string): boolean {
        return this.clients.has(id);
    }

    /**
     * Gets the number of connected clients
     */
    public getClientCount(): number {
        return this.clients.size;
    }

    /**
     * Disconnects all clients
     */
    public async disconnectAllClients(): Promise<void> {
        for (const client of this.clients.values()) {
            await client.disconnect();
        }
    }

    /**
     * Disconnects and removes all clients
     */
    public async removeAllClients(): Promise<void> {
        await this.disconnectAllClients();
        this.clients.clear();
    }

    /**
     * Connect a new client to an MCP server using HTTP/SSE transport
     */
    public async connectClientHttpSse(
        config: HttpSseTransportConfig,
        options: ConnectClientOptions = {}
    ): Promise<ClientContext> {
        // Create client and context
        const client = new McpClient();
        const context = new ClientContext(client, options.id);

        // Set initial metadata if provided
        if (options.metadata) {
            for (const [key, value] of Object.entries(options.metadata)) {
                context.setMetadata(key, value);
            }
        }

        // Add client before connecting
        this.addClient(context);

        try {
            // Connect to the server
            await client.connectHttpSse(config);
            return context;
        } catch (err) {
            // If connection fails, remove the client
            this.removeClient(context.id);

            throw new McpError(
                McpErrorCode.InternalError,
                'Failed to connect client',
                err
            );
        }
    }
} 