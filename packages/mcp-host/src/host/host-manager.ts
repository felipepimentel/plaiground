import { McpError, McpErrorCode, ServerCapabilities, ServerInfo } from '@plaiground/common';
import { HttpSseTransportConfig } from '@plaiground/mcp-client';
import EventEmitter from 'eventemitter3';
import { ClientContext, ClientManager, ClientManagerEvents } from '../client-manager/client-manager';
import { SessionManager, SessionManagerEvents } from '../session/session-manager';
import { UserSession } from '../session/user-session';
import { ToolManager } from '../tools/tool-manager';
import { DEFAULT_HOST_CONFIG, HostConfig } from './host-config';

/**
 * Host manager events
 */
export interface HostManagerEvents extends ClientManagerEvents, SessionManagerEvents {
    hostStarted: [];
    hostStopped: [];
    error: [Error];
}

/**
 * Options for connecting to a server
 */
export interface ConnectServerOptions {
    /**
     * Custom client ID
     */
    clientId?: string;

    /**
     * Client metadata
     */
    metadata?: Record<string, unknown>;

    /**
     * Automatically create a session if not provided
     */
    autoCreateSession?: boolean;

    /**
     * Session ID to associate with this client
     */
    sessionId?: string;

    /**
     * User ID for the session (if auto-creating)
     */
    userId?: string;
}

/**
 * Manages the MCP host, clients, and sessions
 */
export class HostManager extends EventEmitter<HostManagerEvents> {
    private readonly clientManager: ClientManager;
    private readonly sessionManager: SessionManager;
    private readonly toolManager: ToolManager;
    private readonly config: HostConfig;
    private _isRunning = false;
    private clientSessions: Map<string, string> = new Map();

    constructor(config: Partial<HostConfig> = {}) {
        super();
        this.config = { ...DEFAULT_HOST_CONFIG, ...config };

        // Create managers
        this.clientManager = new ClientManager();
        this.sessionManager = new SessionManager();
        
        // Create tool manager with session manager reference
        this.toolManager = new ToolManager({
            sessionManager: this.sessionManager,
            logging: {
                rpcCalls: this.config.logging?.requests || false,
                toolCalls: this.config.logging?.requests || false,
            }
        });

        // Forward client manager events
        this.clientManager.on('clientAdded', (client) => {
            this.emit('clientAdded', client);
            this.logEvent('connections', `Client added: ${client.id}`);
        });

        this.clientManager.on('clientRemoved', (client) => {
            this.emit('clientRemoved', client);
            this.logEvent('connections', `Client removed: ${client.id}`);

            // Remove client-session association
            this.clientSessions.delete(client.id);
        });

        this.clientManager.on('clientStatusChanged', (client, status, error) => {
            this.emit('clientStatusChanged', client, status, error);
            this.logEvent('connections', `Client ${client.id} status changed to ${status}`);

            if (error) {
                this.emit('error', error);
            }
        });

        // Forward session manager events
        this.sessionManager.on('sessionCreated', (session) => {
            this.emit('sessionCreated', session);
            this.logEvent('sessions', `Session created: ${session.id} for user ${session.userId}`);
        });

        this.sessionManager.on('sessionRemoved', (session) => {
            this.emit('sessionRemoved', session);
            this.logEvent('sessions', `Session removed: ${session.id}`);
        });

        this.sessionManager.on('permissionGranted', (session, permission) => {
            this.emit('permissionGranted', session, permission);
            this.logEvent('permissions', `Permission granted to ${session.id}: ${permission.resource}`);
        });

        this.sessionManager.on('permissionRevoked', (session, resource) => {
            this.emit('permissionRevoked', session, resource);
            this.logEvent('permissions', `Permission revoked from ${session.id}: ${resource}`);
        });
        
        // Forward tool manager errors
        this.toolManager.on('error', (error) => {
            this.emit('error', error);
        });
    }

    /**
     * Start the host
     */
    public start(): void {
        if (this._isRunning) {
            return;
        }

        this._isRunning = true;
        this.emit('hostStarted');
        this.logEvent('connections', 'Host started');
    }

    /**
     * Stop the host and disconnect all clients
     */
    public async stop(): Promise<void> {
        if (!this._isRunning) {
            return;
        }

        // Disconnect all clients
        await this.clientManager.disconnectAllClients();

        // Clear all sessions
        this.sessionManager.clearAllSessions();

        this._isRunning = false;
        this.emit('hostStopped');
        this.logEvent('connections', 'Host stopped');
    }

    /**
     * Get the host configuration
     */
    public getConfig(): HostConfig {
        return { ...this.config };
    }

    /**
     * Get the client manager
     */
    public getClientManager(): ClientManager {
        return this.clientManager;
    }

    /**
     * Get the session manager
     */
    public getSessionManager(): SessionManager {
        return this.sessionManager;
    }
    
    /**
     * Get the tool manager
     */
    public getToolManager(): ToolManager {
        return this.toolManager;
    }

    /**
     * Connect to an MCP server using HTTP/SSE transport
     */
    public async connectServer(
        config: HttpSseTransportConfig,
        options: ConnectServerOptions = {}
    ): Promise<ClientContext> {
        this.ensureRunning();

        // Validate options
        if (options.sessionId && !this.sessionManager.getSession(options.sessionId)) {
            throw new McpError(
                McpErrorCode.InternalError,
                `Session with ID ${options.sessionId} not found`
            );
        }

        // Check if we need to create a session
        let sessionId = options.sessionId;
        if (!sessionId && (options.autoCreateSession !== false)) {
            const userId = options.userId || this.config.defaultUserId || 'anonymous';
            const session = this.sessionManager.createSession(userId);
            sessionId = session.id;
        }

        // Connect client
        const client = await this.clientManager.connectClientHttpSse(config, {
            id: options.clientId,
            metadata: options.metadata,
        });

        // Associate client with session if we have one
        if (sessionId) {
            this.clientSessions.set(client.id, sessionId);
        }

        return client;
    }

    /**
     * Get the session associated with a client
     */
    public getClientSession(clientId: string): UserSession | undefined {
        const sessionId = this.clientSessions.get(clientId);
        if (sessionId) {
            return this.sessionManager.getSession(sessionId);
        }
        return undefined;
    }

    /**
     * Associate a client with a session
     */
    public setClientSession(clientId: string, sessionId: string): void {
        const client = this.clientManager.getClient(clientId);
        if (!client) {
            throw new McpError(
                McpErrorCode.InternalError,
                `Client with ID ${clientId} not found`
            );
        }

        const session = this.sessionManager.getSession(sessionId);
        if (!session) {
            throw new McpError(
                McpErrorCode.InternalError,
                `Session with ID ${sessionId} not found`
            );
        }

        this.clientSessions.set(clientId, sessionId);
    }

    /**
     * Handle a JSON-RPC request from a client
     */
    public async handleRpcRequest(
        request: Record<string, any>,
        clientId: string
    ): Promise<Record<string, any>> {
        if (!request.method) {
            throw new McpError(
                McpErrorCode.InvalidRequest,
                'Missing method in request'
            );
        }

        // Get client and session
        const client = this.clientManager.getClient(clientId);
        if (!client) {
            throw new McpError(
                McpErrorCode.InternalError,
                `Client with ID ${clientId} not found`
            );
        }

        const session = this.getClientSession(clientId);

        // Log request if enabled
        if (this.config.logging?.requests) {
            this.logEvent('requests', `RPC request from ${clientId}: ${request.method}`);
        }

        // Handle tool-related methods
        if (request.method.startsWith('tools.')) {
            return await this.toolManager.handleRpcRequest(request, client, session);
        }

        // Handle other methods (to be implemented in other PRs)
        // For now, respond with method not found
        return {
            jsonrpc: '2.0',
            id: request.id,
            error: {
                code: McpErrorCode.MethodNotFound,
                message: `Method '${request.method}' not found or not implemented`,
            },
        };
    }

    /**
     * Check if the host is running
     */
    public isRunning(): boolean {
        return this._isRunning;
    }

    /**
     * Get host information
     */
    public getHostInfo(): ServerInfo {
        return {
            name: this.config.name,
            version: this.config.version,
            description: this.config.description,
        };
    }

    /**
     * Get host capabilities
     */
    public getHostCapabilities(): ServerCapabilities {
        return {
            resources: true,
            tools: true,
            prompts: true,
            sampling: true,
            logging: true,
        };
    }

    /**
     * Log an event if enabled in config
     */
    private logEvent(category: keyof NonNullable<HostConfig['logging']>, message: string): void {
        if (this.config.logging?.[category]) {
            console.log(`[MCP Host] [${category}] ${message}`);
        }
    }

    /**
     * Ensure the host is running
     */
    private ensureRunning(): void {
        if (!this._isRunning) {
            throw new McpError(
                McpErrorCode.InternalError,
                'Host is not running'
            );
        }
    }
} 