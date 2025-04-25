import { EventEmitter } from 'events';
import { v4 as uuid } from 'uuid';

/**
 * Client-side function parameter definition
 */
export interface FunctionParameter {
    name: string;
    type: 'string' | 'number' | 'boolean' | 'object' | 'array' | 'any';
    description?: string;
    required?: boolean;
    default?: any;
}

/**
 * Client-side function definition
 */
export interface ClientFunction {
    name: string;
    description?: string;
    parameters: FunctionParameter[];
    handler: (params: any) => Promise<any>;
}

/**
 * Function call request from the server
 */
export interface FunctionCallRequest {
    requestId: string;
    function: string;
    parameters: any;
    timestamp: number;
}

/**
 * Function call response to the server
 */
export interface FunctionCallResponse {
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
 * Options for function caller
 */
export interface FunctionCallerOptions {
    allowUnregistered?: boolean;
    defaultTimeout?: number;
    validateParams?: boolean;
}

/**
 * Manages client-side functions that can be called by the server
 */
export class FunctionCaller extends EventEmitter {
    private functions: Map<string, ClientFunction> = new Map();
    private options: FunctionCallerOptions;
    private pendingCalls: Map<string, {
        resolve: (value: any) => void;
        reject: (error: any) => void;
        timeout: NodeJS.Timeout;
    }> = new Map();

    constructor(options: FunctionCallerOptions = {}) {
        super();

        this.options = {
            allowUnregistered: false,
            defaultTimeout: 30000, // 30 seconds
            validateParams: true,
            ...options,
        };
    }

    /**
     * Register a client-side function
     */
    registerFunction(fn: ClientFunction): void {
        this.functions.set(fn.name, fn);
    }

    /**
     * Unregister a client-side function
     */
    unregisterFunction(name: string): boolean {
        return this.functions.delete(name);
    }

    /**
     * List all registered functions
     */
    listFunctions(): ClientFunction[] {
        return Array.from(this.functions.values()).map(fn => ({
            ...fn,
            handler: undefined, // Don't include handler in the list
        })) as any;
    }

    /**
     * Check if a function is registered
     */
    hasFunction(name: string): boolean {
        return this.functions.has(name);
    }

    /**
     * Process a function call request from the server
     */
    async processCall(request: FunctionCallRequest): Promise<FunctionCallResponse> {
        const { requestId, function: fnName, parameters } = request;

        try {
            // Check if function exists
            const fn = this.functions.get(fnName);
            if (!fn) {
                if (!this.options.allowUnregistered) {
                    throw new Error(`Function not found: ${fnName}`);
                }

                // Emit event for unregistered function
                this.emit('unregistered', {
                    name: fnName,
                    parameters,
                    requestId
                });

                throw new Error(`Function not found: ${fnName}`);
            }

            // Validate parameters if needed
            if (this.options.validateParams) {
                this.validateParameters(fn, parameters);
            }

            // Call the function handler
            const result = await fn.handler(parameters);

            // Return successful response
            return {
                requestId,
                result,
                timestamp: Date.now(),
            };

        } catch (error: any) {
            // Return error response
            return {
                requestId,
                error: {
                    message: error.message || 'Unknown error',
                    code: error.code || 'FUNCTION_ERROR',
                    details: error.details || {},
                },
                timestamp: Date.now(),
            };
        }
    }

    /**
     * Make a call to a server function
     */
    async callServerFunction(fnName: string, parameters: any, timeout?: number): Promise<any> {
        const requestId = uuid();

        return new Promise((resolve, reject) => {
            // Set up timeout
            const timeoutId = setTimeout(() => {
                const pendingCall = this.pendingCalls.get(requestId);
                if (pendingCall) {
                    pendingCall.reject(new Error(`Function call timed out: ${fnName}`));
                    this.pendingCalls.delete(requestId);
                }
            }, timeout || this.options.defaultTimeout);

            // Store pending call
            this.pendingCalls.set(requestId, {
                resolve,
                reject,
                timeout: timeoutId,
            });

            // Emit the call request
            this.emit('call', {
                requestId,
                function: fnName,
                parameters,
                timestamp: Date.now(),
            });
        });
    }

    /**
     * Handle a function call response from the server
     */
    handleResponse(response: FunctionCallResponse): void {
        const { requestId, result, error } = response;

        // Check if there is a pending call
        const pendingCall = this.pendingCalls.get(requestId);
        if (!pendingCall) {
            console.warn(`Received response for unknown request: ${requestId}`);
            return;
        }

        // Clear timeout
        clearTimeout(pendingCall.timeout);

        // Resolve or reject the promise
        if (error) {
            pendingCall.reject(error);
        } else {
            pendingCall.resolve(result);
        }

        // Remove from pending calls
        this.pendingCalls.delete(requestId);
    }

    /**
     * Validate function parameters
     */
    private validateParameters(fn: ClientFunction, params: any): void {
        // Check required parameters
        for (const param of fn.parameters) {
            if (param.required && (params[param.name] === undefined || params[param.name] === null)) {
                throw new Error(`Missing required parameter: ${param.name}`);
            }

            // Check parameter type
            if (params[param.name] !== undefined && params[param.name] !== null) {
                const paramValue = params[param.name];

                switch (param.type) {
                    case 'string':
                        if (typeof paramValue !== 'string') {
                            throw new Error(`Parameter ${param.name} must be a string`);
                        }
                        break;

                    case 'number':
                        if (typeof paramValue !== 'number') {
                            throw new Error(`Parameter ${param.name} must be a number`);
                        }
                        break;

                    case 'boolean':
                        if (typeof paramValue !== 'boolean') {
                            throw new Error(`Parameter ${param.name} must be a boolean`);
                        }
                        break;

                    case 'object':
                        if (typeof paramValue !== 'object' || Array.isArray(paramValue)) {
                            throw new Error(`Parameter ${param.name} must be an object`);
                        }
                        break;

                    case 'array':
                        if (!Array.isArray(paramValue)) {
                            throw new Error(`Parameter ${param.name} must be an array`);
                        }
                        break;

                    // 'any' type doesn't need validation
                }
            }
        }
    }

    /**
     * Clean up resources
     */
    dispose(): void {
        // Clear all pending calls
        for (const [requestId, pendingCall] of this.pendingCalls.entries()) {
            clearTimeout(pendingCall.timeout);
            pendingCall.reject(new Error('Function caller disposed'));
            this.pendingCalls.delete(requestId);
        }

        // Clear all listeners
        this.removeAllListeners();
    }
} 