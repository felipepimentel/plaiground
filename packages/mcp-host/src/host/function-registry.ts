import { ErrorCode, ErrorSeverity, McpError } from '@plaiground/common';
import { EventEmitter } from 'events';
import { v4 as uuid } from 'uuid';
import { ClientManager } from '../client-manager/client-manager';

/**
 * Function call parameters to client
 */
export interface ClientFunctionCall {
    requestId: string;
    function: string;
    parameters: any;
    timestamp: number;
    timeout?: number;
}

/**
 * Function call response from client
 */
export interface ClientFunctionResponse {
    requestId: string;
    result?: any;
    error?: {
        message: string;
        code?: string;
        details?: any;
    };
    timestamp: number;
}

/**
 * Function discovery options
 */
export interface FunctionDiscoveryOptions {
    clientId: string;
    requestId?: string;
    timeout?: number;
}

/**
 * Registry for server-side function calling
 */
export class FunctionRegistry extends EventEmitter {
    private clientManager: ClientManager;
    private pendingCalls: Map<string, {
        resolve: (result: any) => void;
        reject: (error: Error) => void;
        timeout: NodeJS.Timeout;
    }> = new Map();
    private defaultTimeout: number = 30000; // 30 seconds
    private clientFunctions: Map<string, Set<string>> = new Map();

    constructor(clientManager: ClientManager, options: { defaultTimeout?: number } = {}) {
        super();
        this.clientManager = clientManager;

        if (options.defaultTimeout) {
            this.defaultTimeout = options.defaultTimeout;
        }

        // Listen for client disconnections
        this.clientManager.on('clientDisconnected', (clientId: string) => {
            this.handleClientDisconnect(clientId);
        });
    }

    /**
     * Call a function on a specific client
     */
    async callClientFunction(
        clientId: string,
        functionName: string,
        parameters: any,
        timeout?: number
    ): Promise<any> {
        // Check if client exists
        const client = this.clientManager.getClient(clientId);
        if (!client) {
            throw new McpError({
                code: ErrorCode.RESOURCE_NOT_FOUND,
                message: `Client not found: ${clientId}`,
                severity: ErrorSeverity.ERROR,
                contextId: clientId,
                source: 'function-registry',
            });
        }

        // Generate a request ID
        const requestId = uuid();

        // Create the function call message
        const callRequest: ClientFunctionCall = {
            requestId,
            function: functionName,
            parameters,
            timestamp: Date.now(),
            timeout: timeout || this.defaultTimeout,
        };

        // Create a promise to wait for the response
        const responsePromise = new Promise<any>((resolve, reject) => {
            // Set a timeout
            const timeoutId = setTimeout(() => {
                const pendingCall = this.pendingCalls.get(requestId);
                if (pendingCall) {
                    pendingCall.reject(new McpError({
                        code: ErrorCode.TIMEOUT,
                        message: `Function call timed out: ${functionName}`,
                        severity: ErrorSeverity.ERROR,
                        contextId: clientId,
                        source: 'function-registry',
                    }));
                    this.pendingCalls.delete(requestId);
                }
            }, timeout || this.defaultTimeout);

            // Store the pending call
            this.pendingCalls.set(requestId, {
                resolve,
                reject,
                timeout: timeoutId,
            });
        });

        // Send the function call to the client
        try {
            await client.sendMessage({
                type: 'function_call',
                ...callRequest,
            });
        } catch (error) {
            // Clean up the pending call
            const pendingCall = this.pendingCalls.get(requestId);
            if (pendingCall) {
                clearTimeout(pendingCall.timeout);
                this.pendingCalls.delete(requestId);
            }

            throw new McpError({
                code: ErrorCode.CONNECTION_FAILED,
                message: `Failed to send function call to client: ${error.message}`,
                severity: ErrorSeverity.ERROR,
                details: { error },
                contextId: clientId,
                source: 'function-registry',
            });
        }

        // Wait for the response
        return responsePromise;
    }

    /**
     * Handle a function call response from a client
     */
    handleFunctionResponse(clientId: string, response: ClientFunctionResponse): void {
        const { requestId, result, error } = response;

        // Check if there is a pending call
        const pendingCall = this.pendingCalls.get(requestId);
        if (!pendingCall) {
            console.warn(`Received response for unknown request: ${requestId}`);
            return;
        }

        // Clear the timeout
        clearTimeout(pendingCall.timeout);

        // Resolve or reject the promise
        if (error) {
            pendingCall.reject(new McpError({
                code: ErrorCode.TOOL_EXECUTION_FAILED,
                message: error.message,
                severity: ErrorSeverity.ERROR,
                details: error.details,
                contextId: clientId,
                source: 'function-registry',
            }));
        } else {
            pendingCall.resolve(result);
        }

        // Remove the pending call
        this.pendingCalls.delete(requestId);
    }

    /**
     * Discover available functions on a client
     */
    async discoverClientFunctions(options: FunctionDiscoveryOptions): Promise<string[]> {
        const { clientId, timeout } = options;

        try {
            // Call a special function to get the list of available functions
            const result = await this.callClientFunction(
                clientId,
                '__list_functions',
                {},
                timeout
            );

            // Store the list of functions
            if (Array.isArray(result)) {
                const functionNames = result.map(fn => fn.name).filter(Boolean);
                this.clientFunctions.set(clientId, new Set(functionNames));
                return functionNames;
            }

            return [];
        } catch (error) {
            console.warn(`Failed to discover functions for client ${clientId}:`, error.message);
            return [];
        }
    }

    /**
     * Check if a client supports a specific function
     */
    clientSupportsFunction(clientId: string, functionName: string): boolean {
        const functions = this.clientFunctions.get(clientId);
        if (!functions) {
            return false;
        }

        return functions.has(functionName);
    }

    /**
     * Handle client disconnection
     */
    private handleClientDisconnect(clientId: string): void {
        // Clean up pending calls for this client
        for (const [requestId, pendingCall] of this.pendingCalls.entries()) {
            // Check if this call belongs to the disconnected client
            // We don't have a direct way to know, so we'll have to reject all pending calls
            // that match a timeout when client disconnects
            clearTimeout(pendingCall.timeout);
            pendingCall.reject(new McpError({
                code: ErrorCode.CONNECTION_CLOSED,
                message: `Client disconnected: ${clientId}`,
                severity: ErrorSeverity.WARNING,
                contextId: clientId,
                source: 'function-registry',
            }));
            this.pendingCalls.delete(requestId);
        }

        // Remove client functions
        this.clientFunctions.delete(clientId);
    }

    /**
     * Cancel all pending function calls
     */
    cancelAllPendingCalls(): void {
        for (const [requestId, pendingCall] of this.pendingCalls.entries()) {
            clearTimeout(pendingCall.timeout);
            pendingCall.reject(new McpError({
                code: ErrorCode.UNKNOWN,
                message: 'Function registry shutting down',
                severity: ErrorSeverity.WARNING,
                source: 'function-registry',
            }));
            this.pendingCalls.delete(requestId);
        }
    }

    /**
     * Clean up resources
     */
    dispose(): void {
        this.cancelAllPendingCalls();
        this.removeAllListeners();
    }
} 