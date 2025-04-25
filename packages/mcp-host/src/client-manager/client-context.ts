import { ServerCapabilities, ServerInfo } from '@plaiground/common';
import { ConnectionStatus, McpClient } from '@plaiground/mcp-client';
import EventEmitter from 'eventemitter3';
import { v4 as uuidv4 } from 'uuid';

/**
 * Client context events
 */
export interface ClientContextEvents {
    statusChanged: [ConnectionStatus, Error | undefined];
    dataReceived: [unknown];
    disconnected: [];
}

/**
 * Client context properties
 */
export interface ClientContextProps {
    /**
     * Client's IP address
     */
    ip?: string;

    /**
     * Client's user agent
     */
    userAgent?: string;

    /**
     * Custom client metadata
     */
    metadata?: Record<string, any>;

    /**
     * Connection timestamp
     */
    connectedAt?: Date;
}

/**
 * Represents the context for a single MCP client connection
 */
export class ClientContext extends EventEmitter<ClientContextEvents> {
    private readonly _id: string;
    private readonly _client: McpClient;
    private _status: ConnectionStatus = 'disconnected';
    private _serverInfo: ServerInfo | null = null;
    private _serverCapabilities: ServerCapabilities | null = null;
    private _metadata: Record<string, unknown> = {};
    private _createdAt: Date;
    private data: Map<string, any> = new Map();

    /**
     * Create a new client context
     */
    constructor(client: McpClient, id?: string, props: ClientContextProps = {}) {
        super();
        this._id = id || uuidv4();
        this._client = client;
        this._createdAt = new Date();

        // Listen for status changes
        client.addEventListener((event) => {
            if (event.type === 'status') {
                this._status = event.status;
                this.emit('statusChanged', event.status, event.error);

                if (event.status === 'connected') {
                    this._serverInfo = client.getServerInfo();
                    this._serverCapabilities = client.getServerCapabilities();
                } else if (event.status === 'disconnected') {
                    this.emit('disconnected');
                }
            }
        });

        this.props = {
            ...props,
            connectedAt: props.connectedAt || new Date(),
        };
    }

    /**
     * Get the client ID
     */
    public get id(): string {
        return this._id;
    }

    /**
     * Get the MCP client
     */
    public get client(): McpClient {
        return this._client;
    }

    /**
     * Get the connection status
     */
    public get status(): ConnectionStatus {
        return this._status;
    }

    /**
     * Get the server info
     */
    public get serverInfo(): ServerInfo | null {
        return this._serverInfo;
    }

    /**
     * Get the server capabilities
     */
    public get serverCapabilities(): ServerCapabilities | null {
        return this._serverCapabilities;
    }

    /**
     * Get client metadata
     */
    public get metadata(): Record<string, unknown> {
        return { ...this._metadata };
    }

    /**
     * Set client metadata
     */
    public setMetadata(key: string, value: unknown): void {
        this._metadata[key] = value;
    }

    /**
     * Get creation timestamp
     */
    public get createdAt(): Date {
        return this._createdAt;
    }

    /**
     * Get client properties
     */
    public get props(): ClientContextProps {
        return {
            ip: this.ip,
            userAgent: this.userAgent,
            metadata: this.metadata,
            connectedAt: this.connectedAt,
        };
    }

    /**
     * Get a data value
     */
    public getData<T>(key: string): T | undefined {
        return this.data.get(key) as T | undefined;
    }

    /**
     * Set a data value
     */
    public setData<T>(key: string, value: T): void {
        this.data.set(key, value);
    }

    /**
     * Check if data exists
     */
    public hasData(key: string): boolean {
        return this.data.has(key);
    }

    /**
     * Delete data
     */
    public deleteData(key: string): boolean {
        return this.data.delete(key);
    }

    /**
     * Clear all data
     */
    public clearData(): void {
        this.data.clear();
    }

    /**
     * Get time connected in milliseconds
     */
    public getConnectionDuration(): number {
        return Date.now() - (this.props.connectedAt?.getTime() || Date.now());
    }

    /**
     * Serialize the client context to a plain object
     */
    public toJSON(): Record<string, any> {
        const dataObj: Record<string, any> = {};
        this.data.forEach((value, key) => {
            dataObj[key] = value;
        });

        return {
            id: this.id,
            props: this.props,
            data: dataObj,
        };
    }

    /**
     * Disconnect the client
     */
    public async disconnect(): Promise<void> {
        await this._client.disconnect();
    }
} 