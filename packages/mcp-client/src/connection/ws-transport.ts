import { JsonRpcNotification, JsonRpcRequest, JsonRpcResponse, McpError, McpErrorCode } from '@plaiground/common';
import { WebSocket as WS } from 'ws';
import * as zlib from 'zlib';
import { McpAuthCredentials, McpTransport, McpTransportConfig, McpTransportEvent, McpTransportEventHandler } from './transport';

/**
 * Configuration for WebSocket transport
 */
export interface WsTransportConfig extends McpTransportConfig {
    /**
     * Base URL for the MCP server
     */
    baseUrl: string;

    /**
     * Reconnect timeout in milliseconds
     */
    reconnectTimeout?: number;
    
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
 * Implementation of MCP transport using WebSockets
 */
export class WsTransport implements McpTransport {
    public readonly type = 'websocket';
    private _isConnected = false;
    private ws: WS | null = null;
    private eventHandlers: McpTransportEventHandler[] = [];
    private readonly config: WsTransportConfig;
    private authToken: string | null = null;
    private supportsCompression = false;

    constructor(config: WsTransportConfig) {
        this.config = {
            reconnectTimeout: 3000,
            compression: true,
            compressionOptions: {
                threshold: 1024, // 1KB
                level: 6,
            },
            ...config,
        };

        // Apply initial auth if provided
        if (this.config.auth?.token) {
            this.authToken = this.config.auth.token;
        }
    }

    public get isConnected(): boolean {
        return this._isConnected;
    }

    public async connect(): Promise<void> {
        if (this._isConnected) {
            return;
        }

        try {
            // Create WebSocket connection
            const wsUrl = this.config.baseUrl.replace(/^http/, 'ws');

            // Add auth token to URL if available
            const url = new URL(wsUrl);
            if (this.authToken) {
                url.searchParams.append('auth_token', this.authToken);
            }

            // Add headers through connection options
            const options: WS.ClientOptions = {
                headers: this.config.headers || {},
                perMessageDeflate: this.config.compression ? {
                    zlibDeflateOptions: {
                        level: this.config.compressionOptions?.level ?? 6
                    }
                } : false
            };

            this.ws = new WS(url.toString(), options);

            // Set up event handlers
            this.ws.onopen = () => {
                this._isConnected = true;
                
                // Check if compression is supported
                this.supportsCompression = this.config.compression && 
                    (this.ws as any)._extensions && 
                    (this.ws as any)._extensions.length > 0;
                
                console.log(`[WebSocket Transport] Connected${this.supportsCompression ? ' with compression' : ''}`);
                this.emitEvent({ type: 'connected' });
            };

            this.ws.onclose = (event) => {
                this._isConnected = false;
                // Check if close was due to auth error
                if (event.code === 1008) {
                    this.emitEvent({
                        type: 'auth_required',
                        authTypes: ['token', 'basic']
                    });
                } else {
                    this.emitEvent({
                        type: 'disconnected',
                        reason: `WebSocket closed: ${event.code} ${event.reason}`,
                    });
                }
            };

            this.ws.onerror = (err) => {
                const error = new McpError(
                    McpErrorCode.InternalError,
                    'WebSocket error',
                    err
                );
                this.emitEvent({ type: 'error', error });
            };

            this.ws.onmessage = (event) => {
                try {
                    let messageData = event.data.toString();
                    let data = JSON.parse(messageData);
                    
                    // Check if the message is compressed
                    if (data.__compressed && data.data) {
                        try {
                            // Decompress the message
                            const compressedData = Buffer.from(data.data, 'base64');
                            const decompressedData = zlib.inflateSync(compressedData);
                            messageData = decompressedData.toString();
                            data = JSON.parse(messageData);
                        } catch (err) {
                            console.error('Failed to decompress message:', err);
                            // Continue with the compressed data as a fallback
                        }
                    }

                    // Check for authentication messages
                    if (data.type === 'auth_required') {
                        this.emitEvent({
                            type: 'auth_required',
                            authTypes: data.authTypes || ['token', 'basic'],
                        });
                        return;
                    } else if (data.type === 'auth_success') {
                        this.emitEvent({ type: 'auth_success' });
                        if (data.token) {
                            this.authToken = data.token;
                        }
                        return;
                    } else if (data.type === 'auth_failure') {
                        const error = new McpError(
                            McpErrorCode.AuthenticationFailed,
                            data.message || 'Authentication failed',
                            data.error
                        );
                        this.emitEvent({ type: 'auth_failure', error });
                        return;
                    }

                    // Handle regular JSON-RPC messages
                    if ('id' in data) {
                        this.emitEvent({
                            type: 'response',
                            response: data as JsonRpcResponse,
                        });
                    } else if ('method' in data) {
                        this.emitEvent({
                            type: 'notification',
                            notification: data as JsonRpcNotification,
                        });
                    }
                } catch (err) {
                    const error = new McpError(
                        McpErrorCode.ParseError,
                        'Failed to parse WebSocket message',
                        err
                    );
                    this.emitEvent({ type: 'error', error });
                }
            };

            // Wait for the connection to be established
            await new Promise<void>((resolve, reject) => {
                let handled = false;

                const onOpen = () => {
                    if (handled) return;
                    handled = true;

                    if (this.ws) {
                        this.ws.removeEventListener('open', onOpen);
                        this.ws.removeEventListener('error', onError);
                        this.ws.removeEventListener('close', onClose);
                    }

                    resolve();
                };

                const onError = (err: Event) => {
                    if (handled) return;
                    handled = true;

                    if (this.ws) {
                        this.ws.removeEventListener('open', onOpen);
                        this.ws.removeEventListener('error', onError);
                        this.ws.removeEventListener('close', onClose);
                    }

                    reject(new Error('Failed to connect: ' + err));
                };

                const onClose = (event: CloseEvent) => {
                    if (handled) return;
                    handled = true;

                    if (this.ws) {
                        this.ws.removeEventListener('open', onOpen);
                        this.ws.removeEventListener('error', onError);
                        this.ws.removeEventListener('close', onClose);
                    }

                    reject(new Error(`Connection closed before established: ${event.code} ${event.reason}`));
                };

                if (this.ws) {
                    this.ws.addEventListener('open', onOpen);
                    this.ws.addEventListener('error', onError as EventListener);
                    this.ws.addEventListener('close', onClose as unknown as EventListener);
                }

                // Handle already connected websocket
                if (this.ws?.readyState === WS.OPEN) {
                    onOpen();
                }
            });
        } catch (err) {
            // Clean up any partial connection
            this.disconnect();
            throw new McpError(
                McpErrorCode.InternalError,
                'Failed to establish connection',
                err
            );
        }
    }

    public async disconnect(): Promise<void> {
        if (this.ws) {
            try {
                // Normal closure
                this.ws.close(1000, 'Client disconnecting');
            } catch (err) {
                // Ignore errors closing the connection
            }
            this.ws = null;
        }

        if (this._isConnected) {
            this._isConnected = false;
            this.emitEvent({ type: 'disconnected', reason: 'Disconnected by client' });
        }
    }

    public async sendRequest(request: JsonRpcRequest): Promise<void> {
        if (!this._isConnected || !this.ws) {
            throw new McpError(
                McpErrorCode.InternalError,
                'Cannot send request: not connected'
            );
        }

        try {
            const messageStr = JSON.stringify(request);
            
            // Check if we should use compression
            if (this.config.compression && 
                this.supportsCompression && 
                messageStr.length > (this.config.compressionOptions?.threshold || 1024) &&
                messageStr.length > 100000) { // Only for very large messages (>100KB)
                
                // For very large messages, use explicit compression
                const compressed = zlib.deflateSync(Buffer.from(messageStr), {
                    level: this.config.compressionOptions?.level ?? 6
                });
                
                const wrapper = {
                    __compressed: true,
                    data: compressed.toString('base64')
                };
                
                this.ws.send(JSON.stringify(wrapper));
            } else {
                // Use built-in WebSocket compression or no compression
                this.ws.send(messageStr);
            }
        } catch (err) {
            throw new McpError(
                McpErrorCode.InternalError,
                'Failed to send request',
                err
            );
        }
    }

    public async authenticate(credentials: McpAuthCredentials): Promise<void> {
        if (!this._isConnected || !this.ws) {
            await this.connect();
        }

        if (!this._isConnected || !this.ws) {
            throw new McpError(
                McpErrorCode.InternalError,
                'Cannot authenticate: not connected'
            );
        }

        try {
            const authMessage = {
                type: 'authenticate',
                auth_type: credentials.type,
                ...credentials,
            };

            // Set up promise to wait for auth response
            const authPromise = new Promise<void>((resolve, reject) => {
                const onAuthEvent = (event: McpTransportEvent) => {
                    if (event.type === 'auth_success') {
                        cleanup();
                        resolve();
                    } else if (event.type === 'auth_failure') {
                        cleanup();
                        reject(event.error);
                    }
                };

                // Set a timeout for authentication
                const timeout = setTimeout(() => {
                    cleanup();
                    reject(new McpError(
                        McpErrorCode.TimeoutError,
                        'Authentication timed out'
                    ));
                }, 10000); // 10s timeout

                // Cleanup function to remove listener
                const cleanup = () => {
                    clearTimeout(timeout);
                    this.removeEventListener(onAuthEvent);
                };

                // Add listener for auth events
                this.addEventListener(onAuthEvent);
            });

            // Send auth message
            this.ws.send(JSON.stringify(authMessage));

            // Wait for auth response
            await authPromise;

            // If token is in credentials, store it
            if (credentials.token) {
                this.authToken = credentials.token;
            }
        } catch (err) {
            if (!(err instanceof McpError)) {
                throw new McpError(
                    McpErrorCode.AuthenticationFailed,
                    'Authentication failed',
                    err
                );
            }
            throw err;
        }
    }

    public addEventListener(handler: McpTransportEventHandler): void {
        this.eventHandlers.push(handler);
    }

    public removeEventListener(handler: McpTransportEventHandler): void {
        this.eventHandlers = this.eventHandlers.filter((h) => h !== handler);
    }

    private emitEvent(event: McpTransportEvent): void {
        for (const handler of this.eventHandlers) {
            try {
                handler(event);
            } catch (err) {
                console.error('Error in event handler:', err);
            }
        }
    }
} 