import { McpError, McpErrorCode, Message } from '@plaiground/common';
import EventEmitter from 'eventemitter3';
import * as fs from 'fs';
import * as http from 'http';
import * as https from 'https';
import * as url from 'url';
import { v4 as uuidv4 } from 'uuid';
import { ServerOptions, WebSocket, WebSocketServer } from 'ws';
import * as zlib from 'zlib';
import { ClientContext } from '../client-manager/client-context';

/**
 * WebSocket transport events
 */
export interface WebSocketTransportEvents {
    connection: [ClientContext];
    message: [ClientContext, Message];
    disconnect: [ClientContext];
    error: [Error];
}

/**
 * WebSocket transport configuration
 */
export interface WebSocketTransportConfig {
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
     * SSL options for HTTPS
     */
    ssl?: {
        key: string;
        cert: string;
    };

    /**
     * Maximum payload size in bytes
     */
    maxPayloadSize?: number;

    /**
     * Ping interval in ms
     */
    pingInterval?: number;

    /**
     * Ping timeout in ms
     */
    pingTimeout?: number;

    /**
     * Enable compression
     */
    compression?: boolean;

    /**
     * Compression options
     */
    compressionOptions?: {
        /**
         * Compression threshold in bytes
         * Messages smaller than this will not be compressed
         */
        threshold?: number;

        /**
         * Compression level (0-9)
         * 0 = no compression, 9 = best compression
         */
        level?: number;
    };
}

/**
 * Default WebSocket transport configuration
 */
export const DEFAULT_WEBSOCKET_TRANSPORT_CONFIG: WebSocketTransportConfig = {
    port: 8081,
    host: 'localhost',
    path: '/mcp',
    cors: {
        origin: '*',
        methods: ['GET', 'POST'],
        allowedHeaders: ['Content-Type', 'Authorization'],
        credentials: true,
    },
    maxPayloadSize: 1024 * 1024, // 1MB
    pingInterval: 25000, // 25s
    pingTimeout: 5000, // 5s
    compression: true,
    compressionOptions: {
        threshold: 1024, // Only compress messages larger than 1KB
        level: 6, // Default compression level
    }
};

/**
 * Client connection metadata
 */
interface ClientConnection {
    ws: WebSocket;
    context: ClientContext;
    isAlive: boolean;
    authenticated: boolean;
    supportsCompression: boolean;
}

/**
 * WebSocket transport for the MCP host
 */
export class WebSocketTransport extends EventEmitter<WebSocketTransportEvents> {
    private readonly config: WebSocketTransportConfig;
    private server: WebSocketServer | null = null;
    private httpServer: http.Server | https.Server | null = null;
    private _isRunning: boolean = false;
    private clients: Map<string, ClientConnection> = new Map();
    private pingInterval: NodeJS.Timeout | null = null;

    constructor(config: Partial<WebSocketTransportConfig> = {}) {
        super();
        this.config = { ...DEFAULT_WEBSOCKET_TRANSPORT_CONFIG, ...config };
    }

    /**
     * Start the WebSocket server
     */
    public async start(): Promise<void> {
        if (this._isRunning) {
            return;
        }

        try {
            console.log(`[WebSocket Transport] Starting server on ${this.config.host}:${this.config.port}${this.config.path}`);

            // Create HTTP(S) server if needed
            if (this.config.ssl) {
                const sslOptions = {
                    key: fs.readFileSync(this.config.ssl.key),
                    cert: fs.readFileSync(this.config.ssl.cert)
                };
                this.httpServer = https.createServer(sslOptions);
            } else {
                this.httpServer = http.createServer();
            }

            // Configure WebSocket server
            const serverOptions: ServerOptions = {
                server: this.httpServer,
                path: this.config.path,
                maxPayload: this.config.maxPayloadSize,
                perMessageDeflate: this.config.compression ? {
                    zlibDeflateOptions: {
                        level: this.config.compressionOptions?.level ?? 6
                    },
                    serverNoContextTakeover: false,
                    clientNoContextTakeover: false
                } : false
            };

            // Create the WebSocket server
            this.server = new WebSocketServer(serverOptions);

            // Set up event handlers
            this.server.on('connection', this.handleConnection.bind(this));
            this.server.on('error', (error) => this.emit('error', error));

            // Start HTTP server
            await new Promise<void>((resolve) => {
                this.httpServer!.listen(this.config.port, this.config.host, () => {
                    resolve();
                });
            });

            // Set up ping interval to keep connections alive
            this.setupPingInterval();

            this._isRunning = true;
            console.log(`[WebSocket Transport] Server started on ${this.config.host}:${this.config.port}${this.config.path}${this.config.compression ? ' with compression' : ''}`);
        } catch (error) {
            this.emit('error', error instanceof Error ? error : new Error(String(error)));
            throw error;
        }
    }

    /**
     * Stop the WebSocket server
     */
    public async stop(): Promise<void> {
        if (!this._isRunning) {
            return;
        }

        try {
            // Clear ping interval
            if (this.pingInterval) {
                clearInterval(this.pingInterval);
                this.pingInterval = null;
            }

            // Close all client connections
            for (const client of this.clients.values()) {
                try {
                    client.ws.terminate();
                } catch (err) {
                    console.error('Error terminating client connection:', err);
                }
            }
            this.clients.clear();

            // Close the WebSocket server
            if (this.server) {
                await new Promise<void>((resolve, reject) => {
                    this.server!.close((err) => {
                        if (err) reject(err);
                        else resolve();
                    });
                });
                this.server = null;
            }

            // Close the HTTP server
            if (this.httpServer) {
                await new Promise<void>((resolve, reject) => {
                    this.httpServer!.close((err) => {
                        if (err) reject(err);
                        else resolve();
                    });
                });
                this.httpServer = null;
            }

            this._isRunning = false;
            console.log('[WebSocket Transport] Server stopped');
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

        const client = this.clients.get(clientId);
        if (!client) {
            throw new McpError(
                McpErrorCode.NotFoundError,
                `Client with ID ${clientId} not connected`
            );
        }

        try {
            const messageStr = JSON.stringify(message);

            // Check if we should use compression
            if (this.config.compression &&
                client.supportsCompression &&
                messageStr.length > (this.config.compressionOptions?.threshold || 1024)) {

                // For very large messages, we can use manual compression
                // The WebSocket library also has built-in compression (perMessageDeflate)
                // but we can apply additional compression for really large payloads
                this.sendCompressedMessage(client.ws, message, messageStr);
            } else {
                // Send uncompressed
                client.ws.send(messageStr);
            }
        } catch (error) {
            this.emit('error', error instanceof Error ? error : new Error(String(error)));
            throw new McpError(
                McpErrorCode.InternalError,
                `Failed to send message to client ${clientId}`,
                error
            );
        }
    }

    /**
     * Send a compressed message to a client
     */
    private sendCompressedMessage(ws: WebSocket, message: Message, messageStr: string): void {
        try {
            // For large messages, use explicit compression
            // Note: This is different from the built-in WebSocket compression
            // We use this for very large messages as an additional optimization
            if (messageStr.length > 100000) { // Only for very large messages (>100KB)
                // Create a compressed message wrapper
                const compressed = zlib.deflateSync(Buffer.from(messageStr), {
                    level: this.config.compressionOptions?.level ?? 6
                });

                const wrapper = {
                    __compressed: true,
                    data: compressed.toString('base64')
                };

                ws.send(JSON.stringify(wrapper));
            } else {
                // Use regular WebSocket compression (perMessageDeflate)
                ws.send(messageStr);
            }
        } catch (error) {
            throw new McpError(
                McpErrorCode.InternalError,
                'Failed to compress message',
                error
            );
        }
    }

    /**
     * Disconnect a client
     */
    public disconnectClient(clientId: string): void {
        if (!this._isRunning) {
            return;
        }

        const client = this.clients.get(clientId);
        if (client) {
            try {
                client.ws.close(1000, 'Disconnected by server');
                this.clients.delete(clientId);
                this.emit('disconnect', client.context);
                console.log(`[WebSocket Transport] Disconnected client ${clientId}`);
            } catch (error) {
                this.emit('error', error instanceof Error ? error : new Error(String(error)));
            }
        }
    }

    /**
     * Get the transport configuration
     */
    public getConfig(): WebSocketTransportConfig {
        return { ...this.config };
    }

    /**
     * Handle a new WebSocket connection
     */
    private handleConnection(ws: WebSocket, req: http.IncomingMessage): void {
        try {
            // Generate a unique client ID
            const clientId = uuidv4();

            // Parse query parameters
            const parsedUrl = url.parse(req.url || '', true);
            const queryParams = parsedUrl.query || {};

            // Check for auth token in query parameters
            const authToken = queryParams.auth_token as string;
            const authenticated = Boolean(authToken);

            // Check if compression is supported
            const supportsCompression = this.config.compression &&
                (ws as any)._extensions &&
                (ws as any)._extensions.length > 0;

            // Create client context with connection info
            const clientContext = new ClientContext(clientId, {
                ip: req.socket.remoteAddress || 'unknown',
                userAgent: req.headers['user-agent'] || 'unknown',
                authToken: authToken || undefined,
                transport: 'websocket',
                compression: supportsCompression
            });

            // Store client connection
            const clientConnection: ClientConnection = {
                ws,
                context: clientContext,
                isAlive: true,
                authenticated,
                supportsCompression
            };

            this.clients.set(clientId, clientConnection);

            // Set up event handlers
            ws.on('message', (data) => this.handleMessage(clientId, data));
            ws.on('close', () => this.handleDisconnect(clientId));
            ws.on('error', (error) => this.handleError(clientId, error));
            ws.on('pong', () => this.handlePong(clientId));

            // Emit connection event
            this.emit('connection', clientContext);
            console.log(`[WebSocket Transport] Client ${clientId} connected${supportsCompression ? ' with compression' : ''}`);

            // If not authenticated, send auth required message
            if (!authenticated) {
                ws.send(JSON.stringify({
                    type: 'auth_required',
                    authTypes: ['token', 'basic']
                }));
            }
        } catch (error) {
            this.emit('error', error instanceof Error ? error : new Error(String(error)));
            try {
                ws.close(1011, 'Internal server error');
            } catch (closeError) {
                console.error('Error closing connection after error:', closeError);
            }
        }
    }

    /**
     * Handle an incoming message from a client
     */
    private handleMessage(clientId: string, data: WebSocket.Data): void {
        try {
            const client = this.clients.get(clientId);
            if (!client) return;

            // Parse message
            let messageText = data.toString();
            let message;

            try {
                message = JSON.parse(messageText);

                // Check if the message is compressed
                if (message.__compressed && message.data) {
                    // Decompress the message
                    const compressedData = Buffer.from(message.data, 'base64');
                    const decompressedData = zlib.inflateSync(compressedData);
                    messageText = decompressedData.toString();
                    message = JSON.parse(messageText);
                }
            } catch (err) {
                throw new Error('Invalid JSON message');
            }

            // Check for authentication message
            if (message.type === 'authenticate') {
                this.handleAuthentication(clientId, message);
                return;
            }

            // Check if client is authenticated for regular messages
            if (!client.authenticated) {
                client.ws.send(JSON.stringify({
                    type: 'auth_required',
                    authTypes: ['token', 'basic']
                }));
                return;
            }

            // Emit message event
            this.emit('message', client.context, message);
        } catch (error) {
            this.handleError(clientId, error instanceof Error ? error : new Error('Invalid message'));
        }
    }

    /**
     * Handle authentication message
     */
    private handleAuthentication(clientId: string, message: any): void {
        const client = this.clients.get(clientId);
        if (!client) return;

        try {
            // Validate auth message
            if (!message.auth_type) {
                throw new Error('Missing auth_type in authentication message');
            }

            // In a real implementation, validate credentials
            // This is a simplified example
            const authSuccessful = (
                (message.auth_type === 'token' && message.token) ||
                (message.auth_type === 'basic' && message.username && message.password)
            );

            if (authSuccessful) {
                // Update client context with auth info
                client.context.addData({
                    authType: message.auth_type,
                    authToken: message.token || undefined,
                    authenticated: true,
                });

                // Mark client as authenticated
                client.authenticated = true;

                // Send success response
                const response: any = {
                    type: 'auth_success'
                };

                // For token auth, include a token that can be used for reconnection
                if (message.auth_type === 'basic' && message.username) {
                    // In a real implementation, generate a real token
                    response.token = `token-${Date.now()}-${clientId}`;
                    client.context.addData({ authToken: response.token });
                }

                client.ws.send(JSON.stringify(response));
                console.log(`[WebSocket Transport] Client ${clientId} authenticated with ${message.auth_type}`);
            } else {
                // Auth failed
                client.ws.send(JSON.stringify({
                    type: 'auth_failure',
                    message: 'Invalid credentials'
                }));
                console.log(`[WebSocket Transport] Client ${clientId} authentication failed`);
            }
        } catch (error) {
            client.ws.send(JSON.stringify({
                type: 'auth_failure',
                message: error instanceof Error ? error.message : 'Authentication error'
            }));
            this.handleError(clientId, error instanceof Error ? error : new Error('Authentication error'));
        }
    }

    /**
     * Handle client disconnection
     */
    private handleDisconnect(clientId: string): void {
        const client = this.clients.get(clientId);
        if (client) {
            this.clients.delete(clientId);
            this.emit('disconnect', client.context);
            console.log(`[WebSocket Transport] Client ${clientId} disconnected`);
        }
    }

    /**
     * Handle client error
     */
    private handleError(clientId: string, error: Error): void {
        console.error(`[WebSocket Transport] Error for client ${clientId}:`, error);
        this.emit('error', error);
    }

    /**
     * Handle pong from client (used for keepalive)
     */
    private handlePong(clientId: string): void {
        const client = this.clients.get(clientId);
        if (client) {
            client.isAlive = true;
        }
    }

    /**
     * Set up ping interval to keep connections alive
     */
    private setupPingInterval(): void {
        if (this.pingInterval) {
            clearInterval(this.pingInterval);
        }

        this.pingInterval = setInterval(() => {
            for (const [clientId, client] of this.clients.entries()) {
                if (!client.isAlive) {
                    // Client didn't respond to ping, terminate connection
                    console.log(`[WebSocket Transport] Client ${clientId} failed ping, terminating`);
                    client.ws.terminate();
                    this.clients.delete(clientId);
                    this.emit('disconnect', client.context);
                    continue;
                }

                // Mark as not alive, will be set to true when pong received
                client.isAlive = false;

                try {
                    client.ws.ping();
                } catch (error) {
                    // Error during ping, terminate connection
                    console.error(`[WebSocket Transport] Error pinging client ${clientId}:`, error);
                    client.ws.terminate();
                    this.clients.delete(clientId);
                    this.emit('disconnect', client.context);
                }
            }
        }, this.config.pingInterval);
    }
} 