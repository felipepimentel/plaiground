import { McpError, McpErrorCode } from '@plaiground/common';
import { EventEmitter } from 'eventemitter3';
import { ClientContext } from '../client-manager/client-context';
import { ClientManager } from '../client-manager/client-manager';

/**
 * Session events
 */
export interface SessionEvents {
    /**
     * Emitted when the session status changes
     */
    statusChange: (status: SessionStatus) => void;

    /**
     * Emitted when an error occurs
     */
    error: (error: Error) => void;

    /**
     * Emitted when the session is started
     */
    started: [];

    /**
     * Emitted when the session is stopped
     */
    stopped: [];

    /**
     * Emitted when a client joins the session
     */
    clientJoined: [ClientContext];

    /**
     * Emitted when a client leaves the session
     */
    clientLeft: [ClientContext];
}

/**
 * Session configuration options
 */
export interface SessionOptions {
    /**
     * Maximum number of clients allowed in the session
     * @default unlimited
     */
    maxClients?: number;

    /**
     * Auto-start the session on creation
     * @default true
     */
    autoStart?: boolean;

    /**
     * Auto-accept clients when they try to join
     * @default true
     */
    autoAcceptClients?: boolean;

    /**
     * Session timeout in milliseconds
     */
    timeout?: number;

    /**
     * Session metadata
     */
    metadata?: Record<string, any>;
}

/**
 * Session status
 */
export type SessionStatus = 'created' | 'starting' | 'started' | 'stopping' | 'stopped';

/**
 * Represents a communication session between clients
 */
export class Session extends EventEmitter<SessionEvents> {
    /**
     * Unique session ID
     */
    public readonly id: string;

    /**
     * Client manager instance
     */
    private clientManager: ClientManager;

    /**
     * Session status
     */
    private _status: SessionStatus = 'created';

    /**
     * Session options
     */
    private _options: Required<SessionOptions>;

    /**
     * Session metadata
     */
    private metadata: Record<string, any> = {};

    /**
     * Session creation timestamp
     */
    public readonly createdAt: Date;

    /**
     * Session start timestamp
     */
    private _startTime?: number;

    /**
     * Session stop timestamp
     */
    private _stopTime?: number;

    /**
     * Creates a new session
     */
    constructor(id: string, options: SessionOptions = {}) {
        super();

        this.id = id;
        this.createdAt = new Date();
        this.clientManager = new ClientManager();

        // Set default options
        this._options = {
            maxClients: Infinity,
            autoStart: true,
            autoAcceptClients: true,
            ...options,
        };

        // Set up client manager event listeners
        this.clientManager.on('clientConnected', (client) => {
            this.emit('clientJoined', client);
        });

        this.clientManager.on('clientDisconnected', (client) => {
            this.emit('clientLeft', client);
        });

        // Auto-start if enabled
        if (this._options.autoStart) {
            this.start().catch((err) => {
                console.error(`Error auto-starting session ${this.id}:`, err);
            });
        }
    }

    /**
     * Gets the session status
     */
    public get status(): SessionStatus {
        return this._status;
    }

    /**
     * Gets the session options
     */
    public get options(): SessionOptions {
        return this._options;
    }

    /**
     * Gets the session start timestamp
     */
    public get startTime(): number | undefined {
        return this._startTime;
    }

    /**
     * Gets the session stop timestamp
     */
    public get stopTime(): number | undefined {
        return this._stopTime;
    }

    /**
     * Gets session duration in milliseconds
     */
    public get duration(): number | undefined {
        if (!this._startTime) return undefined;
        const endTime = this._stopTime || Date.now();
        return endTime - this._startTime;
    }

    /**
     * Gets session metadata
     */
    public get metadata(): Record<string, any> | undefined {
        return this._options.metadata;
    }

    /**
     * Starts the session
     */
    public async start(): Promise<void> {
        if (this._status !== 'created' && this._status !== 'stopped') {
            throw new McpError({
                code: McpErrorCode.INVALID_STATE,
                message: `Cannot start session in state: ${this._status}`,
            });
        }

        this._setStatus('starting');

        try {
            // Setup session state
            this._startTime = Date.now();
            this._stopTime = undefined;
            this._status = 'started';

            this.emit('started');
        } catch (error) {
            this._setStatus('stopped');
            this.emit('error', error instanceof Error ? error : new Error(String(error)));
            throw error;
        }
    }

    /**
     * Stops the session
     */
    public async stop(): Promise<void> {
        if (this._status !== 'started') {
            throw new McpError({
                code: McpErrorCode.INVALID_STATE,
                message: `Cannot stop session in state: ${this._status}`,
            });
        }

        this._setStatus('stopping');

        try {
            // Disconnect all clients
            await this.clientManager.disconnectAllClients();

            // Update session state
            this._stopTime = Date.now();
            this._status = 'stopped';

            this.emit('stopped');
        } catch (error) {
            this.emit('error', error instanceof Error ? error : new Error(String(error)));
            throw error;
        }
    }

    /**
     * Adds a client to the session
     */
    public addClient(client: ClientContext): void {
        if (this._status !== 'started') {
            throw new McpError({
                code: McpErrorCode.INVALID_STATE,
                message: `Cannot add client to session in state: ${this._status}`,
            });
        }

        const clientCount = this.clientManager.getClientCount();
        if (clientCount >= this._options.maxClients) {
            throw new McpError({
                code: McpErrorCode.SESSION_FULL,
                message: `Session has reached max clients: ${this._options.maxClients}`,
            });
        }

        this.clientManager.addClient(client);
    }

    /**
     * Removes a client from the session
     */
    public removeClient(clientId: string): boolean {
        return this.clientManager.removeClient(clientId);
    }

    /**
     * Gets a client by ID
     */
    public getClient(clientId: string): ClientContext | undefined {
        return this.clientManager.getClient(clientId);
    }

    /**
     * Gets all clients in the session
     */
    public getClients(): ClientContext[] {
        return this.clientManager.getAllClients();
    }

    /**
     * Gets the number of clients in the session
     */
    public getClientCount(): number {
        return this.clientManager.getClientCount();
    }

    /**
     * Sets a metadata value
     */
    public setMetadata(key: string, value: any): void {
        this.metadata[key] = value;
    }

    /**
     * Gets a metadata value
     */
    public getMetadata<T = any>(key: string): T | undefined {
        return this.metadata[key];
    }

    /**
     * Gets all metadata
     */
    public getAllMetadata(): Record<string, any> {
        return { ...this.metadata };
    }

    /**
     * Serializes the session to a plain object
     */
    public toJSON(): Record<string, any> {
        return {
            id: this.id,
            status: this.status,
            createdAt: this.createdAt.toISOString(),
            startTime: this.startTime,
            stopTime: this.stopTime,
            duration: this.duration,
            clientCount: this.getClientCount(),
            metadata: this.metadata,
        };
    }

    private _setStatus(status: SessionStatus): void {
        this._status = status;
        this.emit('statusChange', status);
    }
} 