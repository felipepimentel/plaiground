// Shared types between frontend and backend

export interface SimpleResource {
    uri: string;
    name?: string;
    description?: string;
}

export interface SimpleParameterSchema {
    type?: string;
    description?: string;
}

export interface SimpleToolDefinition {
    name: string;
    description?: string;
    parameters?: {
        type?: string;
        properties: { [key: string]: SimpleParameterSchema };
        required?: string[];
    };
}

export interface SimplePromptDefinition {
    name: string;
    description?: string;
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
    rawWsMessages?: Array<{ direction: 'send' | 'recv', timestamp: number, data: string }>;
} 