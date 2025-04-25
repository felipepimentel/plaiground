/**
 * Core MCP protocol types based on the JSON-RPC 2.0 specification.
 */

// Basic JSON-RPC 2.0 types
export interface JsonRpcRequest {
    jsonrpc: "2.0";
    id: string;
    method: string;
    params?: Record<string, unknown>;
}

export interface JsonRpcResponse {
    jsonrpc: "2.0";
    id: string;
    result?: unknown;
    error?: JsonRpcError;
}

export interface JsonRpcError {
    code: number;
    message: string;
    data?: unknown;
}

export interface JsonRpcNotification {
    jsonrpc: "2.0";
    method: string;
    params?: Record<string, unknown>;
}

// MCP Transport types
export type McpTransportType = "http-sse" | "websocket" | "stdio";

export interface McpTransportConfig {
    type: McpTransportType;
    url?: string;
    headers?: Record<string, string>;
}

// MCP Server Capability types
export interface ServerCapabilities {
    resources: boolean;
    tools: boolean;
    prompts: boolean;
    sampling: boolean;
    logging: boolean;
}

export interface ServerInfo {
    name: string;
    version: string;
    description?: string;
}

// MCP Resource types
export interface Resource {
    uri: string;
    mimeType: string;
    description?: string;
    isDirectory?: boolean;
}

export interface ResourceContent {
    uri: string;
    content: string | Uint8Array;
    mimeType: string;
    encoding?: string;
}

// MCP Tool types
export interface Tool {
    name: string;
    description: string;
    parameters: Record<string, unknown>; // JSON Schema
    required?: string[];
}

export interface ToolCallResult {
    result: unknown;
    error?: string;
}

// MCP Prompt types
export interface PromptTemplate {
    id: string;
    description: string;
    parameters: Record<string, unknown>; // JSON Schema
    required?: string[];
}

export interface PromptResult {
    messages: PromptMessage[];
}

export interface PromptMessage {
    role: "system" | "user" | "assistant";
    content: string;
}

// MCP Error codes
export enum McpErrorCode {
    // Standard JSON-RPC error codes
    ParseError = -32700,
    InvalidRequest = -32600,
    MethodNotFound = -32601,
    InvalidParams = -32602,
    InternalError = -32603,
    ServerError = -32000,

    // MCP-specific error codes
    ResourceNotFound = -32100,
    ResourceAccessDenied = -32101,
    ToolNotFound = -32102,
    ToolExecutionError = -32103,
    PromptNotFound = -32104,
    SamplingError = -32105,
} 