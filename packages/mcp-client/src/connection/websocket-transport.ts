import { JsonRpcNotification, JsonRpcRequest, JsonRpcResponse, McpError, McpErrorCode } from '@plaiground/common';
import { McpTransport, McpTransportEvent, McpTransportEventHandler } from './transport';

/**
 * Configuration for WebSocket transport
 */
export interface WebSocketTransportConfig {
    /**
     * WebSocket URL for the MCP server
     */
    url: string;

    /**
     * HTTP headers to include with the initial request
     */
    headers?: Record<string, string>;

    /**
     * Reconnect timeout in milliseconds
     */
    reconnectTimeout?: number;

    /**
     * Ping interval in milliseconds
     */
    pingInterval?: number;

    /**
     * Ping timeout in milliseconds
     */
    pingTimeout?: number;
}

/**
 * Implementation of MCP transport using WebSockets
 */
export class WebSocketTransport implements McpTransport {
    public readonly type = 'websocket';
    private _isConnected = false;
    private socket: WebSocket | null = null;
    private eventHandlers: McpTransportEventHandler[] = [];
    private readonly config: WebSocketTransportConfig;
    private reconnectTimer: NodeJS.Timeout | null = null;
    private pingTimer: NodeJS.Timeout | null = null;
    private pongReceived = false;

    constructor(config: WebSocketTransportConfig) {
        this.config = {
            reconnectTimeout: 3000,
            pingInterval: 25000,
            pingTimeout: 5000,
            ...config,
        };
    }

    public get isConnected(): boolean {
        return this._isConnected;
    }

    public async connect(): Promise<void> {
        if (this._isConnected) {
            return;
        }

        try {
            // Close any existing connection
            await this.disconnect();

            // Create a new WebSocket connection
            this.socket = new WebSocket(this.config.url);

            // Set up event handlers
            this.socket.onopen = this.handleOpen.bind(this);
            this.socket.onclose = this.handleClose.bind(this);
            this.socket.onerror = this.handleError.bind(this);
            this.socket.onmessage = this.handleMessage.bind(this);

            // Wait for connection to be established
            await new Promise<void>((resolve, reject) => {
                const onOpen = () => {
                    if (this.socket) {
                        this.socket.removeEventListener('open', onOpen);
                        this.socket.removeEventListener('error', onError);
                    }
                    resolve();
                };

                const onError = (event: Event) => {
                    if (this.socket) {
                        this.socket.removeEventListener('open', onOpen);
                        this.socket.removeEventListener('error', onError);
                    }
                    reject(new Error('Failed to connect to WebSocket: ' + event));
                };

                if (this.socket) {
                    this.socket.addEventListener('open', onOpen);
                    this.socket.addEventListener('error', onError);
                } else {
                    reject(new Error('WebSocket not initialized'));
                }
            });

            // Start ping-pong for keepalive
            this.startPingPong();
        } catch (err) {
            // Clean up
            this.disconnect();
            throw new McpError(
                McpErrorCode.InternalError,
                'Failed to establish WebSocket connection',
                err
            );
        }
    }

    public async disconnect(): Promise<void> {
        // Stop ping-pong
        this.stopPingPong();

        // Stop any pending reconnect
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }

        // Close the socket
        if (this.socket) {
            const socket = this.socket;
            this.socket = null;

            try {
                if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
                    socket.close();
                }
            } catch (err) {
                console.error('Error closing WebSocket:', err);
            }
        }

        // Update state if connected
        if (this._isConnected) {
            this._isConnected = false;
            this.emitEvent({ type: 'disconnected', reason: 'Disconnected by client' });
        }
    }

    public async sendRequest(request: JsonRpcRequest): Promise<void> {
        if (!this._isConnected || !this.socket) {
            throw new McpError(
                McpErrorCode.InternalError,
                'Cannot send request: WebSocket not connected'
            );
        }

        try {
            const data = JSON.stringify(request);
            this.socket.send(data);
        } catch (err) {
            throw new McpError(
                McpErrorCode.InternalError,
                'Failed to send request via WebSocket',
                err
            );
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

    private handleOpen(): void {
        this._isConnected = true;
        this.emitEvent({ type: 'connected' });
    }

    private handleClose(event: CloseEvent): void {
        const wasConnected = this._isConnected;
        this._isConnected = false;
        this.stopPingPong();

        if (wasConnected) {
            this.emitEvent({
                type: 'disconnected',
                reason: event.reason || 'WebSocket connection closed',
            });
        }

        // Attempt to reconnect
        this.attemptReconnect();
    }

    private handleError(event: Event): void {
        const error = new McpError(
            McpErrorCode.InternalError,
            'WebSocket error',
            event
        );
        this.emitEvent({ type: 'error', error });

        // If we were connected, emit disconnected
        if (this._isConnected) {
            this._isConnected = false;
            this.emitEvent({ type: 'disconnected', reason: 'WebSocket error' });
        }

        // Attempt to reconnect
        this.attemptReconnect();
    }

    private handleMessage(event: MessageEvent): void {
        try {
            // Check if it's a ping-pong message
            if (event.data === 'pong') {
                this.pongReceived = true;
                return;
            }

            // Parse the message
            const data = JSON.parse(event.data);

            // Handle responses and notifications
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
    }

    private attemptReconnect(): void {
        // Only attempt to reconnect if not already trying
        if (this.reconnectTimer) {
            return;
        }

        this.reconnectTimer = setTimeout(async () => {
            this.reconnectTimer = null;
            try {
                await this.connect();
            } catch (err) {
                // If reconnect fails, try again
                this.attemptReconnect();
            }
        }, this.config.reconnectTimeout);
    }

    private startPingPong(): void {
        // Start ping interval
        this.pingTimer = setInterval(() => {
            if (!this._isConnected || !this.socket) {
                this.stopPingPong();
                return;
            }

            try {
                // Reset pong flag
                this.pongReceived = false;

                // Send ping
                this.socket.send('ping');

                // Set timeout to check for pong
                setTimeout(() => {
                    if (!this.pongReceived && this.socket) {
                        // No pong received, connection might be dead
                        this.socket.close();
                    }
                }, this.config.pingTimeout);
            } catch (err) {
                console.error('Error sending ping:', err);
            }
        }, this.config.pingInterval);
    }

    private stopPingPong(): void {
        if (this.pingTimer) {
            clearInterval(this.pingTimer);
            this.pingTimer = null;
        }
    }
} 