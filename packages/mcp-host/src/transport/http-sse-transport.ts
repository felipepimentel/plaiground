import { McpError, McpErrorCode, Message } from '@plaiground/common';
import EventEmitter from 'eventemitter3';
import { ClientContext } from '../client-manager/client-context';

/**
 * HTTP/SSE transport events
 */
export interface HttpSseTransportEvents {
    connection: [ClientContext];
    message: [ClientContext, Message];
    disconnect: [ClientContext];
    error: [Error];
}

/**
 * HTTP/SSE transport configuration
 */
export interface HttpSseTransportConfig {
    /**
     * Port to listen on
     */
    port: number;

    /**
     * Host to bind to
     */
    host?: string;

    /**
     * Path to listen on
     */
    path?: string;

    /**
     * CORS options
     */
    cors?: {
        origin?: string | string[];
        methods?: string[];
        allowedHeaders?: string[];
        exposedHeaders?: string[];
        credentials?: boolean;
        maxAge?: number;
    };

    /**
     * Whether to use HTTP/2
     */
    http2?: boolean;

    /**
     * SSL options for HTTPS
     */
    ssl?: {
        key: string;
        cert: string;
    };
}

/**
 * Default HTTP/SSE transport configuration
 */
export const DEFAULT_HTTP_SSE_TRANSPORT_CONFIG: HttpSseTransportConfig = {
    port: 8080,
    host: 'localhost',
    path: '/mcp',
    cors: {
        origin: '*',
        methods: ['GET', 'POST'],
        allowedHeaders: ['Content-Type', 'X-Client-ID', 'X-Session-ID'],
        credentials: true,
    },
};

/**
 * HTTP/SSE transport for the MCP host
 */
export class HttpSseTransport extends EventEmitter<HttpSseTransportEvents> {
    private readonly config: HttpSseTransportConfig;
    private server: any = null; // Using any as a placeholder for http.Server or http2.Server
    private _isRunning: boolean = false;
    private clientEventSources: Map<string, any> = new Map(); // Map of client ID to event source (response object)

    constructor(config: Partial<HttpSseTransportConfig> = {}) {
        super();
        this.config = { ...DEFAULT_HTTP_SSE_TRANSPORT_CONFIG, ...config };
    }

    /**
     * Start the HTTP/SSE server
     */
    public async start(): Promise<void> {
        // NOTE: This is a placeholder for the actual implementation
        // In a real implementation, we would:
        // 1. Create an HTTP/S server
        // 2. Set up routes for SSE connections and message posting
        // 3. Handle client connections, disconnections, and messages

        if (this._isRunning) {
            return;
        }

        try {
            // Log that this is a placeholder
            console.log('[HTTP/SSE Transport] NOTE: This is a placeholder implementation');
            console.log(`[HTTP/SSE Transport] Would start server on ${this.config.host}:${this.config.port}${this.config.path}`);

            // In a real implementation, we would:
            // this.server = createServer();
            // this.server.listen(this.config.port, this.config.host);

            this._isRunning = true;
        } catch (error) {
            this.emit('error', error instanceof Error ? error : new Error(String(error)));
            throw error;
        }
    }

    /**
     * Stop the HTTP/SSE server
     */
    public async stop(): Promise<void> {
        if (!this._isRunning) {
            return;
        }

        try {
            // Close all client connections
            this.clientEventSources.clear();

            // Close the server
            if (this.server) {
                // In a real implementation:
                // await new Promise<void>((resolve, reject) => {
                //   this.server.close((err) => {
                //     if (err) reject(err);
                //     else resolve();
                //   });
                // });
                this.server = null;
            }

            this._isRunning = false;
        } catch (error) {
            this.emit('error', error instanceof Error ? error : new Error(String(error)));
            throw error;
        }
    }

    /**
     * Check if the transport is running
     */
    public isRunning(): boolean {
        return this._isRunning;
    }

    /**
     * Send a message to a client
     */
    public sendMessage(clientId: string, message: Message): void {
        if (!this._isRunning) {
            throw new McpError(
                McpErrorCode.InternalError,
                'Transport is not running'
            );
        }

        const eventSource = this.clientEventSources.get(clientId);
        if (!eventSource) {
            throw new McpError(
                McpErrorCode.NotFoundError,
                `Client with ID ${clientId} not connected`
            );
        }

        try {
            // In a real implementation:
            // eventSource.write(`data: ${JSON.stringify(message)}\n\n`);
            console.log(`[HTTP/SSE Transport] Would send message to client ${clientId}: ${JSON.stringify(message)}`);
        } catch (error) {
            this.emit('error', error instanceof Error ? error : new Error(String(error)));
            throw error;
        }
    }

    /**
     * Disconnect a client
     */
    public disconnectClient(clientId: string): void {
        if (!this._isRunning) {
            return;
        }

        const eventSource = this.clientEventSources.get(clientId);
        if (eventSource) {
            try {
                // In a real implementation:
                // eventSource.end();
                this.clientEventSources.delete(clientId);
                console.log(`[HTTP/SSE Transport] Would disconnect client ${clientId}`);
            } catch (error) {
                this.emit('error', error instanceof Error ? error : new Error(String(error)));
            }
        }
    }

    /**
     * Get the transport configuration
     */
    public getConfig(): HttpSseTransportConfig {
        return { ...this.config };
    }
} 