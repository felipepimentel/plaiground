import { McpError, McpErrorCode, Tool, ToolCallResult } from '@plaiground/common';
import EventEmitter from 'eventemitter3';

/**
 * Type definition for tool execution function
 */
export type ToolExecutionFn = (
    args: Record<string, unknown>,
    context?: ToolExecutionContext
) => Promise<unknown>;

/**
 * Context information for tool execution
 */
export interface ToolExecutionContext {
    /**
     * Session ID for the request
     */
    sessionId?: string;

    /**
     * Client ID for the request
     */
    clientId?: string;

    /**
     * User ID associated with the session
     */
    userId?: string;

    /**
     * Additional metadata for execution
     */
    metadata?: Record<string, unknown>;
}

/**
 * Tool registry events
 */
export interface ToolRegistryEvents {
    /**
     * Emitted when a tool is registered
     */
    toolRegistered: [Tool];

    /**
     * Emitted when a tool is unregistered
     */
    toolUnregistered: [string];

    /**
     * Emitted when a tool is executed
     */
    toolExecuted: [string, ToolCallResult, ToolExecutionContext?];

    /**
     * Emitted when an error occurs
     */
    error: [Error];
}

/**
 * Tool information including execution function
 */
export interface RegisteredTool {
    /**
     * Tool metadata
     */
    definition: Tool;

    /**
     * Execution function
     */
    execute: ToolExecutionFn;

    /**
     * Tool permissions (if applicable)
     */
    permissions?: string[];

    /**
     * Whether the tool is enabled
     */
    enabled: boolean;
}

/**
 * Tool registry configuration
 */
export interface ToolRegistryConfig {
    /**
     * Default timeout for tool execution in milliseconds
     */
    defaultTimeout?: number;

    /**
     * Whether to validate parameters against JSON schema
     */
    validateParameters?: boolean;

    /**
     * Whether to enable all tools by default
     */
    enableToolsByDefault?: boolean;

    /**
     * Logging options
     */
    logging?: {
        /**
         * Log tool registrations
         */
        registrations?: boolean;

        /**
         * Log tool executions
         */
        executions?: boolean;

        /**
         * Log errors
         */
        errors?: boolean;
    };
}

/**
 * Default configuration for tool registry
 */
const DEFAULT_TOOL_REGISTRY_CONFIG: ToolRegistryConfig = {
    defaultTimeout: 30000, // 30 seconds
    validateParameters: true,
    enableToolsByDefault: true,
    logging: {
        registrations: true,
        executions: true,
        errors: true,
    },
};

/**
 * Registry for managing and executing tools
 */
export class ToolRegistry extends EventEmitter<ToolRegistryEvents> {
    private tools: Map<string, RegisteredTool> = new Map();
    protected readonly config: ToolRegistryConfig;

    constructor(config: Partial<ToolRegistryConfig> = {}) {
        super();
        this.config = { ...DEFAULT_TOOL_REGISTRY_CONFIG, ...config };
    }

    /**
     * Register a new tool
     */
    public registerTool(
        definition: Tool,
        executeFn: ToolExecutionFn,
        permissions?: string[]
    ): void {
        // Validate tool name
        if (!definition.name) {
            throw new McpError(
                McpErrorCode.InvalidParams,
                'Tool must have a name'
            );
        }

        if (this.tools.has(definition.name)) {
            throw new McpError(
                McpErrorCode.InvalidParams,
                `Tool with name '${definition.name}' is already registered`
            );
        }

        // Register the tool
        const tool: RegisteredTool = {
            definition,
            execute: executeFn,
            permissions,
            enabled: this.config.enableToolsByDefault ?? true,
        };

        this.tools.set(definition.name, tool);

        // Log registration if enabled
        if (this.config.logging?.registrations) {
            console.log(`[ToolRegistry] Registered tool: ${definition.name}`);
        }

        // Emit event
        this.emit('toolRegistered', definition);
    }

    /**
     * Unregister a tool
     */
    public unregisterTool(name: string): boolean {
        const exists = this.tools.has(name);
        if (exists) {
            this.tools.delete(name);

            // Log unregistration if enabled
            if (this.config.logging?.registrations) {
                console.log(`[ToolRegistry] Unregistered tool: ${name}`);
            }

            // Emit event
            this.emit('toolUnregistered', name);
        }
        return exists;
    }

    /**
     * Get a tool by name
     */
    public getTool(name: string): Tool | undefined {
        const tool = this.tools.get(name);
        return tool?.enabled ? tool.definition : undefined;
    }

    /**
     * Get the internal tool implementation
     */
    protected getToolImplementation(name: string): RegisteredTool | undefined {
        return this.tools.get(name);
    }

    /**
     * List all registered tools
     */
    public listTools(): Tool[] {
        return Array.from(this.tools.values())
            .filter(tool => tool.enabled)
            .map(tool => tool.definition);
    }

    /**
     * Check if a tool exists
     */
    public hasTool(name: string): boolean {
        const tool = this.tools.get(name);
        return Boolean(tool?.enabled);
    }

    /**
     * Enable or disable a tool
     */
    public setToolEnabled(name: string, enabled: boolean): boolean {
        const tool = this.tools.get(name);
        if (tool) {
            tool.enabled = enabled;
            return true;
        }
        return false;
    }

    /**
     * Execute a tool with the given arguments
     */
    public async executeTool(
        name: string,
        args: Record<string, unknown> = {},
        context?: ToolExecutionContext
    ): Promise<ToolCallResult> {
        // Get the tool
        const tool = this.tools.get(name);
        if (!tool) {
            throw new McpError(
                McpErrorCode.ToolNotFound,
                `Tool '${name}' not found`
            );
        }

        if (!tool.enabled) {
            throw new McpError(
                McpErrorCode.ToolExecutionError,
                `Tool '${name}' is disabled`
            );
        }

        // Check permissions if applicable
        if (tool.permissions?.length && context?.sessionId) {
            // TODO: Implement permission checking
            // For now, we'll just log a warning
            console.warn(`[ToolRegistry] Tool ${name} requires permissions, but permission checking is not implemented yet`);
        }

        // Validate parameters if enabled
        if (this.config.validateParameters && tool.definition.parameters) {
            this.validateParameters(args, tool.definition);
        }

        // Log execution if enabled
        if (this.config.logging?.executions) {
            console.log(`[ToolRegistry] Executing tool: ${name}`);
        }

        try {
            // Execute the tool with timeout
            const result = await this.executeWithTimeout(
                tool.execute,
                args,
                context,
                this.config.defaultTimeout
            );

            // Create result object
            const toolResult: ToolCallResult = {
                result
            };

            // Emit execution event
            this.emit('toolExecuted', name, toolResult, context);

            return toolResult;
        } catch (error) {
            // Log error if enabled
            if (this.config.logging?.errors) {
                console.error(`[ToolRegistry] Error executing tool ${name}:`, error);
            }

            // Convert error to McpError if needed
            const mcpError = error instanceof McpError
                ? error
                : new McpError(
                    McpErrorCode.ToolExecutionError,
                    error instanceof Error ? error.message : String(error),
                    error
                );

            // Create error result
            const errorResult: ToolCallResult = {
                result: null,
                error: mcpError.message
            };

            // Emit execution event with error
            this.emit('toolExecuted', name, errorResult, context);

            // Also emit error event
            this.emit('error', mcpError);

            return errorResult;
        }
    }

    /**
     * Execute a function with timeout
     */
    private async executeWithTimeout<T>(
        fn: ToolExecutionFn,
        args: Record<string, unknown>,
        context?: ToolExecutionContext,
        timeout?: number
    ): Promise<T> {
        if (!timeout) {
            return fn(args, context) as Promise<T>;
        }

        return new Promise<T>((resolve, reject) => {
            let timeoutId: NodeJS.Timeout;
            let completed = false;

            // Create timeout
            timeoutId = setTimeout(() => {
                if (!completed) {
                    completed = true;
                    reject(new McpError(
                        McpErrorCode.ToolExecutionError,
                        `Tool execution timed out after ${timeout}ms`
                    ));
                }
            }, timeout);

            // Execute function
            fn(args, context)
                .then((result) => {
                    if (!completed) {
                        completed = true;
                        clearTimeout(timeoutId);
                        resolve(result as T);
                    }
                })
                .catch((error) => {
                    if (!completed) {
                        completed = true;
                        clearTimeout(timeoutId);
                        reject(error);
                    }
                });
        });
    }

    /**
     * Validate parameters against JSON schema
     */
    private validateParameters(
        args: Record<string, unknown>,
        tool: Tool
    ): void {
        // Check required parameters
        if (tool.required) {
            for (const required of tool.required) {
                if (!(required in args)) {
                    throw new McpError(
                        McpErrorCode.InvalidParams,
                        `Missing required parameter: ${required}`
                    );
                }
            }
        }

        // TODO: Implement full JSON schema validation
        // Currently, we only check for required parameters
        // We'll need to add a JSON schema validator dependency for complete validation
    }
} 