import { JsonRpcRequest, JsonRpcResponse, McpError, McpErrorCode, Tool, ToolCallResult } from '@plaiground/common';
import EventEmitter from 'eventemitter3';
import { ClientContext } from '../client-manager/client-context';
import { SessionManager } from '../session/session-manager';
import { UserSession } from '../session/user-session';
import { registerTextTools } from './text-registry';
import { ToolExecutionContext, ToolRegistry } from './tool-registry';

/**
 * Tool manager events
 */
export interface ToolManagerEvents {
    /**
     * Emitted when a tool is called
     */
    toolCalled: [string, Record<string, unknown>, ToolCallResult, ClientContext];

    /**
     * Emitted when a tool list is requested
     */
    toolsListed: [Tool[], ClientContext];

    /**
     * Emitted when an error occurs
     */
    error: [Error];
}

/**
 * Tool manager configuration
 */
export interface ToolManagerConfig {
    /**
     * Session manager reference
     */
    sessionManager?: SessionManager;

    /**
     * Tool registry reference (optional, will create one if not provided)
     */
    toolRegistry?: ToolRegistry;

    /**
     * Permission required to list tools
     */
    listToolsPermission?: string;

    /**
     * Base permission required to call tools
     */
    callToolsPermission?: string;

    /**
     * Automatically register built-in tools
     */
    registerBuiltInTools?: boolean;

    /**
     * Logging configuration
     */
    logging?: {
        /**
         * Log RPC calls
         */
        rpcCalls?: boolean;

        /**
         * Log tool calls
         */
        toolCalls?: boolean;
    };
}

/**
 * Default configuration for the tool manager
 */
const DEFAULT_TOOL_MANAGER_CONFIG: Partial<ToolManagerConfig> = {
    listToolsPermission: 'tools:list',
    callToolsPermission: 'tools:call',
    registerBuiltInTools: true,
    logging: {
        rpcCalls: true,
        toolCalls: true,
    },
};

/**
 * Handles tool-related operations and JSON-RPC requests
 */
export class ToolManager extends EventEmitter<ToolManagerEvents> {
    private readonly toolRegistry: ToolRegistry;
    private readonly config: ToolManagerConfig;
    private readonly rpcHandlers: Map<string, (
        request: JsonRpcRequest,
        client: ClientContext,
        session?: UserSession
    ) => Promise<unknown>> = new Map();

    constructor(config: Partial<ToolManagerConfig> = {}) {
        super();
        this.config = { ...DEFAULT_TOOL_MANAGER_CONFIG, ...config };

        // Use provided registry or create a new one
        this.toolRegistry = this.config.toolRegistry || new ToolRegistry();

        // Register RPC handlers
        this.registerRpcHandlers();

        // Register built-in tools if enabled
        if (this.config.registerBuiltInTools) {
            this.registerBuiltInTools();
        }

        // Forward tool registry events
        this.toolRegistry.on('error', (error) => this.emit('error', error));
    }

    /**
     * Register a new tool
     */
    public registerTool(
        definition: Tool,
        executeFn: (args: Record<string, unknown>, context?: ToolExecutionContext) => Promise<unknown>,
        permissions?: string[]
    ): void {
        this.toolRegistry.registerTool(definition, executeFn, permissions);
    }

    /**
     * Unregister a tool
     */
    public unregisterTool(name: string): boolean {
        return this.toolRegistry.unregisterTool(name);
    }

    /**
     * Get a tool by name
     */
    public getTool(name: string): Tool | undefined {
        return this.toolRegistry.getTool(name);
    }

    /**
     * List all registered tools
     */
    public listTools(): Tool[] {
        return this.toolRegistry.listTools();
    }

    /**
     * Handle a JSON-RPC request
     */
    public async handleRpcRequest(
        request: JsonRpcRequest,
        client: ClientContext,
        session?: UserSession
    ): Promise<JsonRpcResponse> {
        const { id, method, params } = request;

        // Log the request if enabled
        if (this.config.logging?.rpcCalls) {
            console.log(`[ToolManager] RPC request: ${method}`, params);
        }

        try {
            // Check if we have a handler for this method
            const handler = this.rpcHandlers.get(method);
            if (!handler) {
                return {
                    jsonrpc: '2.0',
                    id,
                    error: {
                        code: McpErrorCode.MethodNotFound,
                        message: `Method '${method}' not found`,
                    },
                };
            }

            // Execute the handler
            const result = await handler(request, client, session);

            // Return the result
            return {
                jsonrpc: '2.0',
                id,
                result,
            };
        } catch (error) {
            // Handle errors
            const mcpError = error instanceof McpError
                ? error
                : new McpError(
                    McpErrorCode.InternalError,
                    error instanceof Error ? error.message : String(error),
                    error
                );

            // Emit error event
            this.emit('error', mcpError);

            // Return error response
            return {
                jsonrpc: '2.0',
                id,
                error: {
                    code: mcpError.code,
                    message: mcpError.message,
                    data: mcpError.data,
                },
            };
        }
    }

    /**
     * Register RPC handlers
     */
    private registerRpcHandlers(): void {
        // Register tools.list handler
        this.rpcHandlers.set('tools.list', async (request, client, session) => {
            // Check permissions
            if (this.config.listToolsPermission && session) {
                this.checkPermission(session, this.config.listToolsPermission);
            }

            // Get tools list
            const tools = this.toolRegistry.listTools();

            // Emit event
            this.emit('toolsListed', tools, client);

            return tools;
        });

        // Register tools.call handler
        this.rpcHandlers.set('tools.call', async (request, client, session) => {
            // Extract parameters
            const params = request.params || {};
            const toolName = params.name as string;
            const toolArgs = params.args as Record<string, unknown> || {};

            // Validate parameters
            if (!toolName) {
                throw new McpError(
                    McpErrorCode.InvalidParams,
                    'Missing parameter: name'
                );
            }

            // Check if the tool exists
            if (!this.toolRegistry.hasTool(toolName)) {
                throw new McpError(
                    McpErrorCode.ToolNotFound,
                    `Tool '${toolName}' not found`
                );
            }

            // Check permissions
            if (this.config.callToolsPermission && session) {
                // Check base permission
                this.checkPermission(session, this.config.callToolsPermission);

                // Check tool-specific permission if needed
                // Format: tools:call:{toolName}
                const toolPermission = `${this.config.callToolsPermission}:${toolName}`;
                try {
                    this.checkPermission(session, toolPermission);
                } catch (error) {
                    // If tool-specific permission is missing, just log warning
                    // The base permission is sufficient
                    console.warn(`[ToolManager] Session ${session.id} lacks tool-specific permission: ${toolPermission}`);
                }
            }

            // Create execution context
            const context: ToolExecutionContext = {
                clientId: client.id,
                sessionId: session?.id,
                userId: session?.userId,
                metadata: client.getData(),
            };

            // Log tool call if enabled
            if (this.config.logging?.toolCalls) {
                console.log(`[ToolManager] Tool call: ${toolName}`, toolArgs);
            }

            // Execute the tool
            const result = await this.toolRegistry.executeTool(toolName, toolArgs, context);

            // Emit event
            this.emit('toolCalled', toolName, toolArgs, result, client);

            return result;
        });
    }

    /**
     * Check if a session has a required permission
     */
    private checkPermission(session: UserSession, permission: string): void {
        if (!session.hasPermission(permission)) {
            throw new McpError(
                McpErrorCode.ResourceAccessDenied,
                `Missing permission: ${permission}`
            );
        }
    }

    /**
     * Register built-in tools
     */
    private registerBuiltInTools(): void {
        // Register text processing tools
        registerTextTools(this.toolRegistry);
    }
} 