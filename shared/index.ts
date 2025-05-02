// Shared types between frontend and backend

// --- Configuration Type ---
/**
 * Represents the definition of a configured MCP server,
 * typically loaded from a configuration file.
 */
export interface McpServerDefinition {
    name: string;
    type: 'stdio' | 'websocket';
    description?: string;
    // Stdio specific
    command?: string;
    args?: string[];
    cwd?: string;
    // Websocket specific
    url?: string;
}

// --- MCP Primitive Types ---

export interface SimpleResource {
    uri: string;
    name?: string;
    description?: string;
    mimeType?: string;
}

export interface SimpleParameterSchema {
    type?: string;
    description?: string;
}

export interface SimpleToolDefinition {
    name: string;
    description?: string;
    inputSchema?: any;
    parameters?: {
        type?: string;
        properties: { [key: string]: SimpleParameterSchema };
        required?: string[];
    };
}

export interface SimplePromptDefinition {
    name: string;
    description?: string;
    template?: string | any;
    inputSchema?: any;
    argumentsSchema?: {
        type?: string;
        properties: { [key: string]: SimpleParameterSchema };
        required?: string[];
    };
}

export type ResourceState = SimpleResource[];
export type ToolState = SimpleToolDefinition[];
export type PromptState = SimplePromptDefinition[];

export interface SimpleServerInfo {
    name: string;
    version: string;
    capabilities: string[];
}

// --- Main Connection State --- 
export interface ServerConnection {
    id: string;
    name: string;
    status: 'connecting' | 'connected' | 'disconnected' | 'error';
    serverInfo?: SimpleServerInfo;
    capabilities?: any;
    resources?: ResourceState;
    tools?: ToolState;
    prompts?: PromptState;
    viewedResourceContent?: { uri: string; content: any; error?: string };
    lastToolResult?: { toolName: string; result: any; error?: string };
    viewedPromptMessages?: { promptName: string; messages: any[]; error?: string };
    lastError?: string;
    logs?: string[];
    rawWsMessages?: Array<{ direction: 'send' | 'recv', timestamp: number, data: string }>;
} 