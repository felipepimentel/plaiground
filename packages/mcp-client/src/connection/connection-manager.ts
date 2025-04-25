import { JsonRpcNotification, JsonRpcRequest, JsonRpcResponse, McpError, McpErrorCode, ServerCapabilities, ServerInfo } from '@plaiground/common';
import { v4 as uuidv4 } from 'uuid';
import { HttpSseTransport, HttpSseTransportConfig } from './http-sse-transport';
import { McpAuthCredentials, McpTransport, McpTransportEvent } from './transport';
import { WsTransport, WsTransportConfig } from './ws-transport';

// Connection status types
export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'authenticating' | 'error';

// Authentication status
export type AuthStatus = 'none' | 'required' | 'in_progress' | 'authenticated' | 'failed';

// Connection events
export type ConnectionEvent =
    | { type: 'status'; status: ConnectionStatus; error?: Error }
    | { type: 'response'; id: string; result: unknown; error?: unknown }
    | { type: 'notification'; method: string; params: unknown }
    | { type: 'auth_status'; status: AuthStatus; error?: Error; authTypes?: string[] };

// Connection event handler
export type ConnectionEventHandler = (event: ConnectionEvent) => void;

// Request options
export interface RequestOptions {
    timeout?: number;
}

// Pending request tracking
interface PendingRequest {
    id: string;
    method: string;
    params?: Record<string, unknown>;
    resolve: (result: unknown) => void;
    reject: (error: Error) => void;
    timeout: NodeJS.Timeout | null;
}

/**
 * ConnectionManager handles the connection to an MCP server
 * and provides methods for sending requests and receiving responses.
 */
export class ConnectionManager {
    private transport: McpTransport | null = null;
    private status: ConnectionStatus = 'disconnected';
    private authStatus: AuthStatus = 'none';
    private pendingRequests: Map<string, PendingRequest> = new Map();
    private eventHandlers: ConnectionEventHandler[] = [];
    private serverInfo: ServerInfo | null = null;
    private serverCapabilities: ServerCapabilities | null = null;
    private defaultRequestTimeout = 10000; // 10 seconds
    private supportedAuthTypes: string[] = [];

    /**
     * Get the current connection status
     */
    public getStatus(): ConnectionStatus {
        return this.status;
    }

    /**
     * Get the current authentication status
     */
    public getAuthStatus(): AuthStatus {
        return this.authStatus;
    }

    /**
     * Get the supported authentication types
     */
    public getSupportedAuthTypes(): string[] {
        return this.supportedAuthTypes;
    }

    /**
     * Get server information (if connected)
     */
    public getServerInfo(): ServerInfo | null {
        return this.serverInfo;
    }

    /**
     * Get server capabilities (if connected)
     */
    public getServerCapabilities(): ServerCapabilities | null {
        return this.serverCapabilities;
    }

    /**
     * Connect to an MCP server using HTTP/SSE transport
     */
    public async connectHttpSse(config: HttpSseTransportConfig): Promise<void> {
        await this.disconnect();

        try {
            this.setStatus('connecting');
            this.transport = new HttpSseTransport(config);
            this.transport.addEventListener(this.handleTransportEvent);
            await this.transport.connect();

            // If the connection was successful but auth is required, the auth_required
            // event will be handled by the event handler and auth status updated

            // Only proceed with server info if we're authenticated or auth not required
            if (this.authStatus !== 'required') {
                // After connection, request server info and capabilities
                await this.requestServerInfo();
                await this.requestServerCapabilities();
                this.setStatus('connected');
            }
        } catch (err) {
            const error = err instanceof Error ? err : new Error(String(err));
            this.setStatus('error', error);
            throw error;
        }
    }

    /**
     * Connect to an MCP server using WebSocket transport
     */
    public async connectWebSocket(config: WsTransportConfig): Promise<void> {
        await this.disconnect();

        try {
            this.setStatus('connecting');
            this.transport = new WsTransport(config);
            this.transport.addEventListener(this.handleTransportEvent);
            await this.transport.connect();

            // If the connection was successful but auth is required, the auth_required
            // event will be handled by the event handler and auth status updated

            // Only proceed with server info if we're authenticated or auth not required
            if (this.authStatus !== 'required') {
                // After connection, request server info and capabilities
                await this.requestServerInfo();
                await this.requestServerCapabilities();
                this.setStatus('connected');
            }
        } catch (err) {
            const error = err instanceof Error ? err : new Error(String(err));
            this.setStatus('error', error);
            throw error;
        }
    }

    /**
     * Authenticate with the server
     */
    public async authenticate(credentials: McpAuthCredentials): Promise<void> {
        if (!this.transport) {
            throw new McpError(
                McpErrorCode.InternalError,
                'Cannot authenticate: not connected to a server'
            );
        }

        if (!this.transport.authenticate) {
            throw new McpError(
                McpErrorCode.InternalError,
                'Current transport does not support authentication'
            );
        }

        if (this.authStatus === 'authenticated') {
            // Already authenticated, no need to do it again
            return;
        }

        try {
            this.setAuthStatus('in_progress');
            this.setStatus('authenticating');

            // Call the transport's authenticate method
            await this.transport.authenticate(credentials);

            // If we get here, authentication was successful
            // The auth_success event will have already been processed by the event handler

            // After authentication, request server info and capabilities
            await this.requestServerInfo();
            await this.requestServerCapabilities();

            this.setStatus('connected');
        } catch (err) {
            const error = err instanceof Error ? err : new Error(String(err));
            this.setAuthStatus('failed', error);
            this.setStatus('error', error);
            throw error;
        }
    }

    /**
     * Disconnect from the MCP server
     */
    public async disconnect(): Promise<void> {
        if (this.transport) {
            // First clear pending requests
            this.cancelAllRequests('Connection closed');

            // Then disconnect the transport
            try {
                await this.transport.disconnect();
            } catch (err) {
                console.error('Error disconnecting transport:', err);
            }

            this.transport.removeEventListener(this.handleTransportEvent);
            this.transport = null;
        }

        this.serverInfo = null;
        this.serverCapabilities = null;
        this.authStatus = 'none';
        this.supportedAuthTypes = [];
        this.setStatus('disconnected');
    }

    /**
     * Send a request to the MCP server
     */
    public async sendRequest<T = unknown>(
        method: string,
        params?: Record<string, unknown>,
        options: RequestOptions = {}
    ): Promise<T> {
        if (!this.transport) {
            throw new McpError(
                McpErrorCode.InternalError,
                'Cannot send request: not connected'
            );
        }

        if (this.status !== 'connected' && !(method.startsWith('auth.'))) {
            throw new McpError(
                McpErrorCode.InternalError,
                `Cannot send request: connection status is ${this.status}`
            );
        }

        if (this.authStatus === 'required' && !method.startsWith('auth.')) {
            throw new McpError(
                McpErrorCode.AuthenticationRequired,
                'Authentication required before sending requests'
            );
        }

        const id = uuidv4();
        const request: JsonRpcRequest = {
            jsonrpc: '2.0',
            id,
            method,
            params,
        };

        return new Promise<T>((resolve, reject) => {
            // Set up timeout
            const timeout = setTimeout(() => {
                const pendingRequest = this.pendingRequests.get(id);
                if (pendingRequest) {
                    this.pendingRequests.delete(id);
                    reject(new McpError(
                        McpErrorCode.InternalError,
                        `Request timed out after ${options.timeout || this.defaultRequestTimeout}ms: ${method}`
                    ));
                }
            }, options.timeout || this.defaultRequestTimeout);

            // Store pending request
            this.pendingRequests.set(id, {
                id,
                method,
                params,
                resolve: (result) => resolve(result as T),
                reject,
                timeout,
            });

            // Send the request
            this.transport!.sendRequest(request)
                .catch((err) => {
                    // If sending fails, clean up and reject
                    const pendingRequest = this.pendingRequests.get(id);
                    if (pendingRequest) {
                        this.pendingRequests.delete(id);
                        if (pendingRequest.timeout) {
                            clearTimeout(pendingRequest.timeout);
                        }
                        reject(err);
                    }
                });
        });
    }

    /**
     * Add an event handler
     */
    public addEventListener(handler: ConnectionEventHandler): void {
        this.eventHandlers.push(handler);
    }

    /**
     * Remove an event handler
     */
    public removeEventListener(handler: ConnectionEventHandler): void {
        this.eventHandlers = this.eventHandlers.filter((h) => h !== handler);
    }

    /**
     * Set connection status and emit event
     */
    private setStatus(status: ConnectionStatus, error?: Error): void {
        this.status = status;
        this.emitEvent({ type: 'status', status, error });
    }

    /**
     * Set authentication status and emit event
     */
    private setAuthStatus(status: AuthStatus, error?: Error, authTypes?: string[]): void {
        this.authStatus = status;
        if (authTypes) {
            this.supportedAuthTypes = authTypes;
        }
        this.emitEvent({ type: 'auth_status', status, error, authTypes });
    }

    /**
     * Emit an event to all handlers
     */
    private emitEvent(event: ConnectionEvent): void {
        for (const handler of this.eventHandlers) {
            try {
                handler(event);
            } catch (err) {
                console.error('Error in connection event handler:', err);
            }
        }
    }

    /**
     * Handle transport events
     */
    private handleTransportEvent = (event: McpTransportEvent): void => {
        switch (event.type) {
            case 'connected':
                // The actual connected state is set after getting server info and capabilities
                break;

            case 'disconnected':
                this.cancelAllRequests(event.reason || 'Connection closed');
                this.setStatus('disconnected');
                break;

            case 'error':
                this.setStatus('error', event.error);
                break;

            case 'response':
                this.handleResponse(event.response);
                break;

            case 'notification':
                this.handleNotification(event.notification);
                break;

            case 'auth_required':
                this.setAuthStatus('required', undefined, event.authTypes);
                break;

            case 'auth_success':
                this.setAuthStatus('authenticated');
                break;

            case 'auth_failure':
                this.setAuthStatus('failed', event.error);
                break;
        }
    };

    /**
     * Handle a response from the server
     */
    private handleResponse(response: JsonRpcResponse): void {
        const id = response.id;
        const pendingRequest = this.pendingRequests.get(id);

        if (pendingRequest) {
            this.pendingRequests.delete(id);

            if (pendingRequest.timeout) {
                clearTimeout(pendingRequest.timeout);
                pendingRequest.timeout = null;
            }

            if (response.error) {
                // Convert JSON-RPC error to McpError
                const error = new McpError(
                    response.error.code as McpErrorCode,
                    response.error.message,
                    response.error.data
                );

                // Check for authentication errors
                if (response.error.code === -32001) { // Authentication required
                    this.setAuthStatus('required', error, response.error.data?.authTypes);
                } else if (response.error.code === -32002) { // Authentication failed
                    this.setAuthStatus('failed', error);
                }

                pendingRequest.reject(error);
            } else {
                pendingRequest.resolve(response.result);
            }
        }

        // Also emit as an event
        this.emitEvent({
            type: 'response',
            id,
            result: response.result,
            error: response.error,
        });
    }

    /**
     * Handle a notification from the server
     */
    private handleNotification(notification: JsonRpcNotification): void {
        // Check for auth-related notifications
        if (notification.method === 'server.auth_required') {
            this.setAuthStatus('required', undefined, notification.params?.authTypes as string[]);
            return;
        } else if (notification.method === 'server.auth_success') {
            this.setAuthStatus('authenticated');
            return;
        } else if (notification.method === 'server.auth_failure') {
            const error = new McpError(
                McpErrorCode.AuthenticationFailed,
                'Authentication failed',
                notification.params
            );
            this.setAuthStatus('failed', error);
            return;
        }

        // Emit regular notifications
        this.emitEvent({
            type: 'notification',
            method: notification.method,
            params: notification.params,
        });
    }

    /**
     * Cancel all pending requests
     */
    private cancelAllRequests(reason: string): void {
        for (const [id, request] of this.pendingRequests.entries()) {
            if (request.timeout) {
                clearTimeout(request.timeout);
                request.timeout = null;
            }

            request.reject(new McpError(
                McpErrorCode.InternalError,
                `Request cancelled: ${reason}`
            ));
        }

        this.pendingRequests.clear();
    }

    /**
     * Request server information
     */
    private async requestServerInfo(): Promise<void> {
        try {
            this.serverInfo = await this.sendRequest<ServerInfo>('server.info');
        } catch (err) {
            console.error('Failed to get server info:', err);
            this.serverInfo = null;
        }
    }

    /**
     * Request server capabilities
     */
    private async requestServerCapabilities(): Promise<void> {
        try {
            this.serverCapabilities = await this.sendRequest<ServerCapabilities>('server.capabilities');
        } catch (err) {
            console.error('Failed to get server capabilities:', err);
            this.serverCapabilities = null;
        }
    }
} 