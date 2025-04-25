import { JsonRpcNotification, JsonRpcRequest, JsonRpcResponse } from '@plaiground/common';

/**
 * Authentication credentials for MCP transport
 */
export interface McpAuthCredentials {
    /**
     * Authentication type
     */
    type: 'token' | 'apikey' | 'basic' | 'oauth2' | string;

    /**
     * Authentication token or key
     */
    token?: string;

    /**
     * Username for basic authentication
     */
    username?: string;

    /**
     * Password for basic authentication
     */
    password?: string;

    /**
     * Additional authentication parameters
     */
    params?: Record<string, unknown>;
}

/**
 * Configuration for MCP transport
 */
export interface McpTransportConfig {
    /**
     * Authentication credentials
     */
    auth?: McpAuthCredentials;

    /**
     * HTTP headers to include with requests
     */
    headers?: Record<string, string>;
}

/**
 * Events emitted by MCP transports
 */
export type McpTransportEvent =
    | { type: 'connected' }
    | { type: 'disconnected'; reason?: string }
    | { type: 'error'; error: Error }
    | { type: 'response'; response: JsonRpcResponse }
    | { type: 'notification'; notification: JsonRpcNotification }
    | { type: 'auth_required'; authTypes: string[] }
    | { type: 'auth_success' }
    | { type: 'auth_failure'; error: Error };

/**
 * Handler for transport events
 */
export type McpTransportEventHandler = (event: McpTransportEvent) => void;

/**
 * Interface for MCP transports
 */
export interface McpTransport {
    /**
     * Transport type identifier
     */
    readonly type: string;

    /**
     * Whether the transport is currently connected
     */
    readonly isConnected: boolean;

    /**
     * Connect to the server
     */
    connect(): Promise<void>;

    /**
     * Disconnect from the server
     */
    disconnect(): Promise<void>;

    /**
     * Send a request to the server
     */
    sendRequest(request: JsonRpcRequest): Promise<void>;

    /**
     * Authenticate with the server using provided credentials
     */
    authenticate?(credentials: McpAuthCredentials): Promise<void>;

    /**
     * Add an event handler
     */
    addEventListener(handler: McpTransportEventHandler): void;

    /**
     * Remove an event handler
     */
    removeEventListener(handler: McpTransportEventHandler): void;
} 