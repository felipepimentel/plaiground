import { create } from 'zustand';
// Import shared types
import {
    ServerConnection
} from '@mcp-lab/shared';

// Define types for state slices
// export type ResourceState = Resource[];
// export type ToolState = ToolDefinition[];
// export type PromptState = PromptDefinition[];

// --- Connection State --- 
// Uses ServerConnection from shared-types which includes the state types

// --- App State --- 
type ActiveView = 'Resources' | 'Tools' | 'Prompts' | 'Messages' | null;

type AppState = {
    connections: ServerConnection[];
    activeServerId: string | null;
    activeView: ActiveView;
    logs: string[];
};

// --- App Actions --- 
type AppActions = {
    // Connection Management
    addConnection: (partialConn: Pick<ServerConnection, 'id' | 'name' | 'status'>) => void;
    // Generic update function for a connection
    updateConnection: (id: string, updates: Partial<ServerConnection>) => void;
    removeConnection: (id: string) => void;
    setActiveServer: (id: string | null) => void;

    // View Management
    setActiveView: (view: ActiveView) => void;

    // Data Loading (will update specific connection)
    // Types for ResourceState, ToolState, PromptState come from the imported ServerConnection type
    setResources: (connectionId: string, resources: ServerConnection['resources']) => void;
    setTools: (connectionId: string, tools: ServerConnection['tools']) => void;
    setPrompts: (connectionId: string, prompts: ServerConnection['prompts']) => void;
    setViewedResourceContent: (connectionId: string, uri: string, content?: any, error?: string) => void;
    setLastToolResult: (connectionId: string, toolName: string, result?: any, error?: string) => void;
    setPromptMessages: (connectionId: string, promptName: string, messages?: any[], error?: string) => void;
    addRawWsMessage: (connectionId: string, direction: 'send' | 'recv', data: string) => void;

    // Logging
    addLog: (log: string) => void;
};

// --- Store Implementation --- 
export const useStore = create<AppState & AppActions>((set, get) => ({
    // Initial State
    connections: [],
    activeServerId: null,
    activeView: null,
    logs: [],

    // Actions
    addConnection: (partialConn) => set((state) => {
        if (state.connections.some(c => c.id === partialConn.id)) {
            return {
                connections: state.connections.map(conn =>
                    conn.id === partialConn.id ? { ...conn, ...partialConn } : conn
                )
            };
        }
        return { connections: [...state.connections, { ...partialConn }] };
    }),

    updateConnection: (id, updates) => set((state) => ({
        connections: state.connections.map((conn) =>
            conn.id === id ? { ...conn, ...updates } : conn
        ),
    })),

    removeConnection: (id) => set((state) => {
        const newConnections = state.connections.filter((conn) => conn.id !== id);
        const newActiveServerId = state.activeServerId === id ? null : state.activeServerId;
        return {
            connections: newConnections,
            activeServerId: newActiveServerId,
            activeView: newActiveServerId === null ? null : state.activeView,
        };
    }),

    setActiveServer: (id) => set(() => ({
        activeServerId: id,
        activeView: null
    })),

    setActiveView: (view) => set({ activeView: view }),

    setResources: (connectionId, resources) => {
        get().updateConnection(connectionId, { resources });
    },

    setTools: (connectionId, tools) => {
        get().updateConnection(connectionId, { tools });
    },

    setPrompts: (connectionId, prompts) => {
        get().updateConnection(connectionId, { prompts });
    },

    setViewedResourceContent: (connectionId, uri, content, error) => {
        get().updateConnection(connectionId, { viewedResourceContent: { uri, content, error } });
    },

    setLastToolResult: (connectionId, toolName, result, error) => {
        get().updateConnection(connectionId, { lastToolResult: { toolName, result, error } });
    },

    setPromptMessages: (connectionId, promptName, messages, error) => {
        get().updateConnection(connectionId, { viewedPromptMessages: { promptName, messages: messages || [], error } });
    },

    addRawWsMessage: (connectionId, direction, data) => {
        const connection = get().connections.find(c => c.id === connectionId);
        if (connection) {
            const newMessage = { direction, timestamp: Date.now(), data };
            const updatedMessages = [...(connection.rawWsMessages || []), newMessage];
            get().updateConnection(connectionId, { rawWsMessages: updatedMessages });
        } else {
            console.warn(`Received raw WS message for unknown connection ${connectionId}`);
            get().addLog(`[Orphaned WS ${direction}]: ${data.substring(0, 100)}...`);
        }
    },

    addLog: (log) => set((state) => ({ logs: [...state.logs, `${new Date().toLocaleTimeString()}: ${log}`] })),
})); 