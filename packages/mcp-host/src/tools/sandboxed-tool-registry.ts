import { McpError, McpErrorCode, ToolDefinition, ToolRegistryMetadata } from '@plaiground/common';
import { logger } from '../utils/logger';
import { Sandbox, SandboxConfig } from './sandbox';
import { ToolRegistry } from './tool-registry';

/**
 * Configuration for the sandboxed tool registry
 */
export interface SandboxedToolRegistryConfig {
    /**
     * Configuration for the sandbox
     */
    sandboxConfig?: Partial<SandboxConfig>;

    /**
     * Default sandbox options for all tools
     */
    defaultSandboxOptions?: {
        /**
         * Timeout for tool execution in milliseconds
         */
        timeout?: number;
    };

    /**
     * Whether to sandbox all tools by default
     * @default true
     */
    sandboxAllTools?: boolean;
}

/**
 * Default configuration for the sandboxed tool registry
 */
export const DEFAULT_SANDBOXED_TOOL_REGISTRY_CONFIG: SandboxedToolRegistryConfig = {
    sandboxAllTools: true,
};

/**
 * Tool registry that can execute tools in a sandbox for security
 */
export class SandboxedToolRegistry extends ToolRegistry {
    private readonly sandbox: Sandbox;
    private readonly config: SandboxedToolRegistryConfig;
    private readonly sandboxedTools = new Set<string>();

    /**
     * Create a new sandboxed tool registry
     */
    constructor(config: SandboxedToolRegistryConfig = DEFAULT_SANDBOXED_TOOL_REGISTRY_CONFIG) {
        super();
        this.config = {
            ...DEFAULT_SANDBOXED_TOOL_REGISTRY_CONFIG,
            ...config,
        };
        this.sandbox = new Sandbox(this.config.sandboxConfig);
    }

    /**
     * Register a tool in the registry
     */
    public registerTool<T extends ToolDefinition>(
        tool: T,
        metadata: ToolRegistryMetadata = {}
    ): void {
        const shouldSandbox = metadata.sandbox ?? this.config.sandboxAllTools;

        if (shouldSandbox) {
            this.sandboxedTools.add(tool.name);
            logger.debug(`Registered tool ${tool.name} with sandbox`);
        } else {
            logger.debug(`Registered tool ${tool.name} without sandbox`);
        }

        super.registerTool(tool, metadata);
    }

    /**
     * Unregister a tool from the registry
     */
    public unregisterTool(toolName: string): void {
        this.sandboxedTools.delete(toolName);
        super.unregisterTool(toolName);
    }

    /**
     * Check if a tool is sandboxed
     */
    public isSandboxed(toolName: string): boolean {
        return this.sandboxedTools.has(toolName);
    }

    /**
     * Set whether a tool should be sandboxed
     */
    public setSandboxed(toolName: string, sandboxed: boolean): void {
        if (sandboxed) {
            this.sandboxedTools.add(toolName);
        } else {
            this.sandboxedTools.delete(toolName);
        }
    }

    /**
     * Execute a tool with the given parameters
     */
    public async executeTool<T extends Record<string, unknown>>(
        toolName: string,
        params: T
    ): Promise<unknown> {
        const tool = this.getTool(toolName);

        if (!tool) {
            throw new McpError(
                McpErrorCode.ToolNotFound,
                `Tool ${toolName} not found in registry`
            );
        }

        try {
            if (this.isSandboxed(toolName)) {
                logger.debug(`Executing tool ${toolName} in sandbox`);

                // Create a function that executes the tool's handler
                const executeInSandbox = this.sandbox.createSandboxedFunction(async (toolParams: T) => {
                    return await tool.handler(toolParams);
                });

                return await executeInSandbox(params);
            } else {
                logger.debug(`Executing tool ${toolName} directly`);
                return await tool.handler(params);
            }
        } catch (error) {
            if (error instanceof McpError) {
                throw error;
            }

            if (error instanceof Error) {
                throw new McpError(
                    McpErrorCode.ToolExecutionError,
                    `Error executing tool ${toolName}: ${error.message}`,
                    error
                );
            }

            throw new McpError(
                McpErrorCode.ToolExecutionError,
                `Unknown error executing tool ${toolName}`,
                error
            );
        }
    }
} 