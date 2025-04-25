import { ErrorCode, ErrorSeverity, McpError } from '@plaiground/common';
import { v4 as uuid } from 'uuid';

// Configuration for session isolation
export interface SessionSandboxConfig {
    memoryLimitMB?: number;    // Memory limit per session
    maxExecutionTimeMs?: number; // Maximum execution time for operations
    maxResourcesPerSession?: number; // Maximum number of resources per session
    isolationMode?: 'process' | 'vm' | 'none'; // Isolation mechanism
    enableNetworkAccess?: boolean; // Whether the session has network access
    allowedModules?: string[]; // List of Node.js modules allowed in the session
    debugMode?: boolean; // Enable debug mode for additional logging
}

// Context passed to sandboxed operations
export interface SandboxContext {
    sessionId: string;
    clientId?: string;
    userId?: string;
    resources: Set<string>; // Resource IDs associated with this session
    createdAt: Date;
    metadata: Record<string, any>; // Additional metadata
}

// Operations permitted within a session
export interface SessionSandboxOperations {
    executeCode(code: string, params?: any): Promise<any>; // Execute arbitrary code
    executeFile(filePath: string, params?: any): Promise<any>; // Execute a file
    callFunction(functionName: string, params?: any): Promise<any>; // Call a function
}

/**
 * SessionSandbox - provides isolated execution environment for sessions
 */
export class SessionSandbox {
    private config: SessionSandboxConfig;
    private context: SandboxContext;
    private operations: SessionSandboxOperations | null = null;

    constructor(config: SessionSandboxConfig = {}, sessionId?: string) {
        this.config = {
            memoryLimitMB: 128,
            maxExecutionTimeMs: 10000,
            maxResourcesPerSession: 100,
            isolationMode: 'vm',
            enableNetworkAccess: false,
            allowedModules: ['path', 'fs', 'util', 'crypto'],
            debugMode: false,
            ...config,
        };

        this.context = {
            sessionId: sessionId || uuid(),
            resources: new Set<string>(),
            createdAt: new Date(),
            metadata: {},
        };
    }

    /**
     * Initialize the sandbox environment
     */
    async initialize(): Promise<void> {
        try {
            // Create isolated environment based on configuration
            switch (this.config.isolationMode) {
                case 'process':
                    this.operations = await this.createProcessIsolation();
                    break;
                case 'vm':
                    this.operations = await this.createVmIsolation();
                    break;
                case 'none':
                    this.operations = this.createNoIsolation();
                    break;
                default:
                    throw new Error(`Unsupported isolation mode: ${this.config.isolationMode}`);
            }

            if (this.config.debugMode) {
                console.log(`Session sandbox initialized: ${this.context.sessionId}`);
                console.log(`Isolation mode: ${this.config.isolationMode}`);
            }
        } catch (error) {
            throw new McpError({
                code: ErrorCode.SESSION_CREATION_FAILED,
                message: `Failed to initialize session sandbox: ${error.message}`,
                severity: ErrorSeverity.ERROR,
                details: { error, config: this.config },
                contextId: this.context.sessionId,
                source: 'session-sandbox',
            });
        }
    }

    /**
     * Execute code within the sandbox
     */
    async execute(code: string, params: any = {}): Promise<any> {
        if (!this.operations) {
            throw new Error('Session sandbox not initialized');
        }

        const startTime = Date.now();

        try {
            // Set up execution timeout
            const timeoutPromise = new Promise((_, reject) => {
                const timeoutId = setTimeout(() => {
                    reject(new McpError({
                        code: ErrorCode.TIMEOUT,
                        message: `Execution timed out after ${this.config.maxExecutionTimeMs}ms`,
                        severity: ErrorSeverity.ERROR,
                        contextId: this.context.sessionId,
                        source: 'session-sandbox',
                    }));
                }, this.config.maxExecutionTimeMs);

                // Ensure the timeout is cleared if the promise is resolved
                params._timeoutId = timeoutId;
            });

            // Execute the code with timeout
            const executionPromise = this.operations.executeCode(code, {
                ...params,
                _context: this.context,
            });

            const result = await Promise.race([executionPromise, timeoutPromise]);

            // Clear timeout if set
            if (params._timeoutId) {
                clearTimeout(params._timeoutId);
            }

            return result;
        } catch (error) {
            // Convert to standardized error
            if (error instanceof McpError) {
                throw error;
            }

            throw new McpError({
                code: ErrorCode.TOOL_EXECUTION_FAILED,
                message: error.message || 'Execution failed',
                severity: ErrorSeverity.ERROR,
                details: { error, code: code.substring(0, 100) + '...' },
                contextId: this.context.sessionId,
                source: 'session-sandbox',
            });
        } finally {
            const duration = Date.now() - startTime;
            if (this.config.debugMode) {
                console.log(`Execution completed in ${duration}ms for session ${this.context.sessionId}`);
            }
        }
    }

    /**
     * Associate a resource with this session
     */
    addResource(resourceId: string): void {
        if (this.context.resources.size >= this.config.maxResourcesPerSession) {
            throw new McpError({
                code: ErrorCode.RESOURCE_CREATION_FAILED,
                message: `Maximum number of resources (${this.config.maxResourcesPerSession}) reached for session`,
                severity: ErrorSeverity.ERROR,
                contextId: this.context.sessionId,
                source: 'session-sandbox',
            });
        }

        this.context.resources.add(resourceId);
    }

    /**
     * Remove a resource association from this session
     */
    removeResource(resourceId: string): void {
        this.context.resources.delete(resourceId);
    }

    /**
     * Set metadata for the session
     */
    setMetadata(key: string, value: any): void {
        this.context.metadata[key] = value;
    }

    /**
     * Get metadata from the session
     */
    getMetadata(key: string): any {
        return this.context.metadata[key];
    }

    /**
     * Get the session ID
     */
    getSessionId(): string {
        return this.context.sessionId;
    }

    /**
     * Get all resources associated with this session
     */
    getResources(): string[] {
        return [...this.context.resources];
    }

    /**
     * Set the client ID for this session
     */
    setClientId(clientId: string): void {
        this.context.clientId = clientId;
    }

    /**
     * Set the user ID for this session
     */
    setUserId(userId: string): void {
        this.context.userId = userId;
    }

    /**
     * Get the session context
     */
    getContext(): SandboxContext {
        return { ...this.context };
    }

    /**
     * Cleanup and release resources
     */
    async dispose(): Promise<void> {
        // Implementation depends on isolation mode
        // For process isolation, this would terminate the process
        // For VM isolation, this would destroy the VM context

        if (this.config.debugMode) {
            console.log(`Session sandbox disposed: ${this.context.sessionId}`);
        }
    }

    // Implementation of isolation strategies

    /**
     * Create process-based isolation
     * Spawns a new Node.js process for each session
     */
    private async createProcessIsolation(): Promise<SessionSandboxOperations> {
        // This is a placeholder implementation
        // In a real implementation, this would spawn a child process
        // with appropriate resource limits

        console.log('Process isolation not fully implemented');

        return {
            executeCode: async (code, params) => {
                throw new Error('Process isolation not implemented');
            },
            executeFile: async (filePath, params) => {
                throw new Error('Process isolation not implemented');
            },
            callFunction: async (functionName, params) => {
                throw new Error('Process isolation not implemented');
            },
        };
    }

    /**
     * Create VM-based isolation using Node.js VM module
     * Executes code in a separate V8 context
     */
    private async createVmIsolation(): Promise<SessionSandboxOperations> {
        // This is a placeholder implementation
        // In a real implementation, this would use the Node.js VM module

        console.log('VM isolation not fully implemented');

        return {
            executeCode: async (code, params) => {
                // Simple implementation without actual VM isolation
                // Just as a demo of the concept
                const sandboxEnv = {
                    params,
                    console: {
                        log: (...args: any[]) => {
                            if (this.config.debugMode) {
                                console.log(`[Sandbox:${this.context.sessionId}]`, ...args);
                            }
                        },
                        error: (...args: any[]) => {
                            console.error(`[Sandbox:${this.context.sessionId}]`, ...args);
                        },
                    },
                };

                // In a real implementation, this would use vm.runInNewContext
                return eval(`
          (function() {
            with (sandboxEnv) {
              ${code}
            }
          })();
        `);
            },
            executeFile: async (filePath, params) => {
                throw new Error('VM file execution not implemented');
            },
            callFunction: async (functionName, params) => {
                throw new Error('VM function calling not implemented');
            },
        };
    }

    /**
     * Create no isolation - executes in the same context
     * Only for development/testing!
     */
    private createNoIsolation(): SessionSandboxOperations {
        return {
            executeCode: async (code, params) => {
                // WARNING: This is extremely unsafe for production!
                // Only for development/testing
                const sandboxEnv = { params };

                // Create a function from the code and execute it
                const func = new Function('sandboxEnv', `
          with (sandboxEnv) {
            ${code}
          }
        `);

                return func(sandboxEnv);
            },
            executeFile: async (filePath, params) => {
                throw new Error('No isolation file execution not implemented');
            },
            callFunction: async (functionName, params) => {
                throw new Error('No isolation function calling not implemented');
            },
        };
    }
} 