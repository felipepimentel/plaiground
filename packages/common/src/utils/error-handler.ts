/**
 * Standardized error handling for MCP
 */

// Error severity levels
export enum ErrorSeverity {
    DEBUG = 'debug',
    INFO = 'info',
    WARNING = 'warning',
    ERROR = 'error',
    FATAL = 'fatal',
}

// Base error codes
export enum ErrorCode {
    // General errors (0-99)
    UNKNOWN = 0,
    INVALID_PARAMETER = 1,
    NOT_IMPLEMENTED = 2,
    NOT_AUTHORIZED = 3,
    RESOURCE_NOT_FOUND = 4,
    TIMEOUT = 5,
    RATE_LIMITED = 6,

    // Transport errors (100-199)
    CONNECTION_FAILED = 100,
    CONNECTION_CLOSED = 101,
    TRANSPORT_ERROR = 102,
    MESSAGE_TOO_LARGE = 103,

    // Tool errors (200-299)
    TOOL_NOT_FOUND = 200,
    TOOL_EXECUTION_FAILED = 201,
    TOOL_VALIDATION_FAILED = 202,
    TOOL_TIMEOUT = 203,
    TOOL_SANDBOX_ERROR = 204,

    // Session errors (300-399)
    SESSION_NOT_FOUND = 300,
    SESSION_EXPIRED = 301,
    SESSION_CREATION_FAILED = 302,

    // Resource errors (400-499)
    RESOURCE_CREATION_FAILED = 400,
    RESOURCE_UPDATE_FAILED = 401,
    RESOURCE_DELETE_FAILED = 402,
    RESOURCE_TYPE_UNSUPPORTED = 403,
    RESOURCE_TOO_LARGE = 404,
}

// Standard error structure
export interface McpErrorData {
    code: ErrorCode;
    message: string;
    severity: ErrorSeverity;
    details?: any;
    timestamp: number;
    contextId?: string; // Session ID, client ID, or other context
    source?: string; // Component where error occurred
}

// MCP standardized error class
export class McpError extends Error {
    readonly code: ErrorCode;
    readonly severity: ErrorSeverity;
    readonly details?: any;
    readonly timestamp: number;
    readonly contextId?: string;
    readonly source?: string;

    constructor(data: Omit<McpErrorData, 'timestamp'>) {
        super(data.message);
        this.name = 'McpError';
        this.code = data.code;
        this.severity = data.severity;
        this.details = data.details;
        this.timestamp = Date.now();
        this.contextId = data.contextId;
        this.source = data.source;

        // Enables proper stack trace in Node.js
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, McpError);
        }
    }

    /**
     * Serialize error to a plain object suitable for transmission
     */
    toJSON(): McpErrorData {
        return {
            code: this.code,
            message: this.message,
            severity: this.severity,
            details: this.details,
            timestamp: this.timestamp,
            contextId: this.contextId,
            source: this.source,
        };
    }

    /**
     * Create an error from a plain object (e.g., from JSON)
     */
    static fromJSON(data: McpErrorData): McpError {
        return new McpError({
            code: data.code,
            message: data.message,
            severity: data.severity,
            details: data.details,
            contextId: data.contextId,
            source: data.source,
        });
    }

    /**
     * Create an error from any exception, standardizing it
     */
    static fromException(
        error: any,
        defaultCode = ErrorCode.UNKNOWN,
        defaultSeverity = ErrorSeverity.ERROR,
        contextId?: string,
        source?: string
    ): McpError {
        if (error instanceof McpError) {
            return error;
        }

        // Extract message from various error types
        let message = 'Unknown error';
        let details = undefined;

        if (error instanceof Error) {
            message = error.message;
            details = { stack: error.stack };
        } else if (typeof error === 'string') {
            message = error;
        } else if (error && typeof error === 'object') {
            message = error.message || 'Object error';
            details = error;
        }

        return new McpError({
            code: defaultCode,
            message,
            severity: defaultSeverity,
            details,
            contextId,
            source,
        });
    }
}

// Helper functions for creating specific error types
export function createNotFoundError(
    message: string,
    contextId?: string,
    source?: string,
    details?: any
): McpError {
    return new McpError({
        code: ErrorCode.RESOURCE_NOT_FOUND,
        message,
        severity: ErrorSeverity.ERROR,
        details,
        contextId,
        source,
    });
}

export function createToolError(
    message: string,
    toolName?: string,
    contextId?: string,
    details?: any
): McpError {
    return new McpError({
        code: ErrorCode.TOOL_EXECUTION_FAILED,
        message,
        severity: ErrorSeverity.ERROR,
        details: { ...details, toolName },
        contextId,
        source: 'tool',
    });
}

export function createAuthError(
    message: string,
    contextId?: string,
    source?: string
): McpError {
    return new McpError({
        code: ErrorCode.NOT_AUTHORIZED,
        message,
        severity: ErrorSeverity.WARNING,
        contextId,
        source,
    });
}

export function createValidationError(
    message: string,
    details?: any,
    contextId?: string,
    source?: string
): McpError {
    return new McpError({
        code: ErrorCode.INVALID_PARAMETER,
        message,
        severity: ErrorSeverity.WARNING,
        details,
        contextId,
        source,
    });
}

export function createConnectionError(
    message: string,
    details?: any,
    contextId?: string
): McpError {
    return new McpError({
        code: ErrorCode.CONNECTION_FAILED,
        message,
        severity: ErrorSeverity.ERROR,
        details,
        contextId,
        source: 'transport',
    });
}

export function createTimeoutError(
    message: string,
    details?: any,
    contextId?: string,
    source?: string
): McpError {
    return new McpError({
        code: ErrorCode.TIMEOUT,
        message,
        severity: ErrorSeverity.WARNING,
        details,
        contextId,
        source,
    });
} 