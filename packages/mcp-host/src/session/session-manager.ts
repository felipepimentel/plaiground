import { McpError, McpErrorCode } from '@plaiground/common';
import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { Session, SessionOptions } from './session';

/**
 * Session manager events
 */
export interface SessionManagerEvents {
    /**
     * Emitted when a session is created
     */
    sessionCreated: (session: Session) => void;

    /**
     * Emitted when a session is started
     */
    sessionStarted: (session: Session) => void;

    /**
     * Emitted when a session is stopped
     */
    sessionStopped: (session: Session) => void;

    /**
     * Emitted when a session is removed
     */
    sessionRemoved: (sessionId: string) => void;
}

/**
 * Session manager configuration
 */
export interface SessionManagerOptions {
    /**
     * Maximum number of sessions allowed
     * @default unlimited
     */
    maxSessions?: number;

    /**
     * Default options for newly created sessions
     */
    defaultSessionOptions?: SessionOptions;

    /**
     * Cleanup interval in milliseconds
     * @default 0 (disabled)
     */
    cleanupInterval?: number;
}

/**
 * Manages multiple MCP sessions
 */
export class SessionManager extends EventEmitter<SessionManagerEvents> {
    /**
     * Map of active sessions
     */
    private sessions: Map<string, Session> = new Map();

    /**
     * Session manager options
     */
    private options: Required<SessionManagerOptions>;

    private cleanupTimer?: NodeJS.Timeout;

    /**
     * Creates a new session manager
     */
    constructor(options: SessionManagerOptions = {}) {
        super();

        this.options = {
            maxSessions: Infinity,
            defaultSessionOptions: {
                autoStart: true,
                autoAcceptClients: true,
            },
            cleanupInterval: 0, // 0 = disabled
            ...options,
        };

        // Start cleanup timer if enabled
        if (this.options.cleanupInterval && this.options.cleanupInterval > 0) {
            this.startCleanupTimer();
        }
    }

    /**
     * Creates a new session
     */
    public createSession(options: SessionOptions = {}): Session {
        if (this.sessions.size >= (this.options.maxSessions ?? Infinity)) {
            throw new McpError({
                code: McpErrorCode.RESOURCE_LIMIT_EXCEEDED,
                message: `Maximum number of sessions reached: ${this.options.maxSessions}`,
            });
        }

        // Generate a unique session ID
        const sessionId = uuidv4();

        // Merge default options with provided options
        const sessionOptions = {
            ...this.options.defaultSessionOptions,
            ...options,
        };

        // Create the session
        const session = new Session(sessionId, sessionOptions);

        // Set up event forwarding
        session.on('statusChange', (status) => {
            if (status === 'started') {
                this.emit('sessionStarted', session);
            } else if (status === 'stopped') {
                this.emit('sessionStopped', session);
            }
        });

        // Store the session
        this.sessions.set(sessionId, session);

        // Emit creation event
        this.emit('sessionCreated', session);

        return session;
    }

    /**
     * Destroys a session
     */
    public async destroySession(sessionId: string): Promise<boolean> {
        const session = this.getSession(sessionId);

        if (!session) {
            return false;
        }

        // Stop the session if it's running
        if (session.status === 'started') {
            await session.stop();
        }

        // Remove the session
        this.sessions.delete(sessionId);

        // Emit destruction event
        this.emit('sessionRemoved', sessionId);

        return true;
    }

    /**
     * Gets a session by ID
     */
    public getSession(sessionId: string): Session | undefined {
        return this.sessions.get(sessionId);
    }

    /**
     * Gets all sessions
     */
    public getAllSessions(): Session[] {
        return Array.from(this.sessions.values());
    }

    /**
     * Gets all session IDs
     */
    public getSessionIds(): string[] {
        return Array.from(this.sessions.keys());
    }

    /**
     * Stops all sessions
     */
    public async stopAllSessions(): Promise<void> {
        const stopPromises = Array.from(this.sessions.values())
            .filter((session) => session.status === 'started')
            .map((session) => session.stop());

        await Promise.all(stopPromises);
    }

    /**
     * Destroys all sessions
     */
    public async destroyAllSessions(): Promise<void> {
        const destroyPromises = Array.from(this.sessions.keys())
            .map((sessionId) => this.destroySession(sessionId));

        await Promise.all(destroyPromises);
    }

    /**
     * Starts cleanup timer
     */
    private startCleanupTimer(): void {
        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer);
        }

        this.cleanupTimer = setInterval(() => {
            this.cleanup();
        }, this.options.cleanupInterval);
    }

    /**
     * Cleans up stale sessions
     */
    private cleanup(): void {
        const now = Date.now();

        for (const session of this.sessions.values()) {
            // Skip sessions that don't have a timeout
            if (!session.options.timeout) continue;

            // Check if session has timed out
            if (session.status === 'started' && session.startTime) {
                const elapsedTime = now - session.startTime;
                if (elapsedTime > session.options.timeout) {
                    // Stop and remove timed out session
                    session.stop().catch(err => console.error(`Error stopping session ${session.id}:`, err));
                }
            }
        }
    }

    /**
     * Stops cleanup timer and all sessions
     */
    async dispose(): Promise<void> {
        // Stop cleanup timer
        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer);
            this.cleanupTimer = undefined;
        }

        // Stop and remove all sessions
        await this.destroyAllSessions();

        // Remove all listeners
        this.removeAllListeners();
    }
} 