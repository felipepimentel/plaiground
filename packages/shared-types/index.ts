// Shared types between frontend and backend

// Re-export some core types if needed, or define simplified versions
// For now, let's define ServerConnection here

// Simplified representation of MCP types for frontend use
// We avoid importing the full SDK types here to keep this package dependency-free

export interface SimpleResource {
    uri: string;
    name?: string;
    description?: string;
    // Add other relevant fields if needed by UI
}

export interface SimpleParameterSchema {
    type?: string;
    description?: string;
    // Add other schema details if needed for form generation
}

export interface SimpleToolDefinition {
    name: string;
    description?: string;
    parameters?: {
        type?: string; // Usually 'object'
        properties: { [key: string]: SimpleParameterSchema };
        required?: string[];
    };
}

export interface SimplePromptDefinition {
    name: string;
    description?: string;
    argumentsSchema?: {
        type?: string; // Usually 'object'
        properties: { [key: string]: SimpleParameterSchema };
        required?: string[];
    };
}

export type ResourceState = SimpleResource[];
export type ToolState = SimpleToolDefinition[];
export type PromptState = SimplePromptDefinition[];

// Duplicating ServerInfo structure might be necessary if not importing SDK
// Or define a simplified version of what the frontend needs
export interface SimpleServerInfo {
    name: string;
    version: string;
    // Add capabilities if needed
}

// --- Main Connection State --- 
export interface ServerConnection {
    id: string;
    name: string; // Usually the command used to start
    status: 'connecting' | 'connected' | 'disconnected' | 'error';
    serverInfo?: SimpleServerInfo;
    capabilities?: any; // Keep capabilities generic for now
    resources?: ResourceState;
    tools?: ToolState;
    prompts?: PromptState;
    viewedResourceContent?: { uri: string; content: any; error?: string };
    lastToolResult?: { toolName: string; result: any; error?: string };
    viewedPromptMessages?: { promptName: string; messages: any[]; error?: string };
    rawWsMessages?: Array<{ direction: 'send' | 'recv', timestamp: number, data: string }>;
} 