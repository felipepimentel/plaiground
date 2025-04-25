import { JsonRpcError, McpErrorCode } from '../mcp/types';

/**
 * Standard MCP error class that can be thrown and converted to JsonRpcError format
 */
export class McpError extends Error {
    public readonly code: McpErrorCode;
    public readonly data?: unknown;

    constructor(code: McpErrorCode, message: string, data?: unknown) {
        super(message);
        this.name = 'McpError';
        this.code = code;
        this.data = data;

        // This is needed for proper instanceof checks in TypeScript
        Object.setPrototypeOf(this, McpError.prototype);
    }

    /**
     * Convert to JsonRpcError format for protocol responses
     */
    public toJsonRpcError(): JsonRpcError {
        return {
            code: this.code,
            message: this.message,
            data: this.data,
        };
    }

    /**
     * Create an error for resource not found
     */
    public static resourceNotFound(uri: string, details?: unknown): McpError {
        return new McpError(
            McpErrorCode.ResourceNotFound,
            `Resource not found: ${uri}`,
            details
        );
    }

    /**
     * Create an error for resource access denied
     */
    public static resourceAccessDenied(uri: string, details?: unknown): McpError {
        return new McpError(
            McpErrorCode.ResourceAccessDenied,
            `Resource access denied: ${uri}`,
            details
        );
    }

    /**
     * Create an error for tool not found
     */
    public static toolNotFound(name: string, details?: unknown): McpError {
        return new McpError(
            McpErrorCode.ToolNotFound,
            `Tool not found: ${name}`,
            details
        );
    }

    /**
     * Create an error for tool execution error
     */
    public static toolExecutionError(name: string, error: string, details?: unknown): McpError {
        return new McpError(
            McpErrorCode.ToolExecutionError,
            `Error executing tool ${name}: ${error}`,
            details
        );
    }

    /**
     * Create an error for prompt not found
     */
    public static promptNotFound(id: string, details?: unknown): McpError {
        return new McpError(
            McpErrorCode.PromptNotFound,
            `Prompt not found: ${id}`,
            details
        );
    }

    /**
     * Create an error for sampling errors
     */
    public static samplingError(message: string, details?: unknown): McpError {
        return new McpError(
            McpErrorCode.SamplingError,
            `Sampling error: ${message}`,
            details
        );
    }

    /**
     * Create an error for internal errors
     */
    public static internalError(message: string, details?: unknown): McpError {
        return new McpError(
            McpErrorCode.InternalError,
            `Internal error: ${message}`,
            details
        );
    }
} 