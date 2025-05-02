import { create } from 'zustand';
// Import shared types
import {
    McpServerDefinition,
    PromptState,
    ResourceState,
    ServerConnection,
    SimpleServerInfo,
    ToolState
} from '@mcp-lab/shared';

// Define structure for server config entries from backend
interface McpServerConfigEntry {
    id: string;
    name: string;
    description?: string;
}

// Define types for state slices
// export type ResourceState = Resource[];
// export type ToolState = ToolDefinition[];
// export type PromptState = PromptDefinition[];

// --- Connection State --- 
// Uses ServerConnection from shared-types which includes the state types

// --- App State --- 
type ActiveView = 'Resources' | 'Tools' | 'Prompts' | 'Messages' | null;

type AppState = {
    configuredServers: McpServerDefinition[];
    connections: ServerConnection[];
    activeServerId: string | null;
    activeView: ActiveView;
    logs: string[];
    addLog: (log: string) => void;
    setConfiguredServers: (servers: McpServerDefinition[]) => void;
    updateConnectionStatus: (payload: { id: string; name: string; status: ServerConnection['status']; serverInfo?: SimpleServerInfo, error?: string, reason?: string }) => void;
    removeConnection: (id: string) => void;
    setActiveServer: (id: string | null) => void;
    setActiveView: (view: ActiveView) => void;
    setResources: (connectionId: string, resources: ResourceState | null) => void;
    setTools: (connectionId: string, tools: ToolState | null) => void;
    setPrompts: (connectionId: string, prompts: PromptState | null) => void;
    setResourceContent: (connectionId: string, uri: string, content: any, error?: string) => void;
    setToolResult: (connectionId: string, toolName: string, result: any, error?: string) => void;
    setPromptMessages: (connectionId: string, promptName: string, messages: any[], error?: string) => void;
    addRawWsMessage: (connectionId: string, direction: 'send' | 'recv', data: string) => void;
    handleWsMessage: (message: { type: string; payload: any }) => void;
    clearLogs: (connectionId: string) => void;
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

    // Configured Servers
    setConfiguredServers: (servers: McpServerDefinition[]) => void;

    // Data Loading (will update specific connection)
    // Types for ResourceState, ToolState, PromptState come from the imported ServerConnection type
    setResources: (connectionId: string, resources: ResourceState | null) => void;
    setTools: (connectionId: string, tools: ToolState | null) => void;
    setPrompts: (connectionId: string, prompts: PromptState | null) => void;
    setResourceContent: (connectionId: string, uri: string, content: any, error?: string) => void;
    setToolResult: (connectionId: string, toolName: string, result: any, error?: string) => void;
    setPromptMessages: (connectionId: string, promptName: string, messages: any[], error?: string) => void;
    addRawWsMessage: (connectionId: string, direction: 'send' | 'recv', data: string) => void;

    // Logging
    addLog: (log: string) => void;

    // Central message handler
    handleWsMessage: (message: { type: string; payload: any }) => void;
};

// --- Store Implementation --- 
export const useStore = create<AppState & AppActions>((set, get) => {
    // --- Define internal helper for message handling ---
    const handleWsMessageInternal = (message: { type: string; payload: any }) => {
        const { type, payload } = message;
        // Get other actions via get()
        const storeActions = get();

        // Log raw messages for received MCP protocol messages, but ignore the ones echoing our sends
        if (type === 'rawLog') {
            if (payload.direction === 'recv') {
                let associatedConnectionId: string | undefined;
                if (typeof payload.data === 'string') {
                    try {
                        const parsedRawData = JSON.parse(payload.data);
                        // Try to extract connectionId from known message structures
                        associatedConnectionId = parsedRawData?.payload?.connectionId || parsedRawData?.params?.connectionId || parsedRawData?.result?.connectionId;
                    } catch { /* ignore parse error */ }
                }
                if (associatedConnectionId) {
                    storeActions.addRawWsMessage(associatedConnectionId, 'recv', payload.data);
                } else {
                    // Log if recv but no connectionId found
                    // storeActions.addLog(`[WS RECV RAW Unknown]: ${payload.data.substring(0, 100)}...`);
                }
            } // Silently ignore rawLog messages for direction: 'send'
            return; // Stop processing after handling rawLog
        }

        // Handle other message types by calling actions on the store instance
        switch (type) {
            case 'configuredServersList':
                storeActions.setConfiguredServers(payload.servers || []);
                break;
            case 'connectionStatus':
                storeActions.updateConnectionStatus(payload);
                break;
            case 'resourcesList':
                storeActions.setResources(payload.connectionId, payload.data?.resources || null);
                break;
            case 'toolsList':
                storeActions.setTools(payload.connectionId, payload.data?.tools || null);
                break;
            case 'promptsList':
                storeActions.setPrompts(payload.connectionId, payload.data?.prompts || null);
                break;
            case 'resourceContent':
                storeActions.setResourceContent(payload.connectionId, payload.uri, payload.content, payload.error);
                break;
            case 'toolResult':
                storeActions.setToolResult(payload.connectionId, payload.toolName, payload.result, payload.error);
                break;
            case 'promptMessages':
                storeActions.setPromptMessages(payload.connectionId, payload.promptName, payload.messages, payload.error);
                break;
            case 'mcpError':
                storeActions.addLog(`[MCP ${payload.connectionId} Error] Operation: ${payload.operation || 'Unknown'} - ${payload.error}`);
                break;
            case 'mcpLog':
                storeActions.addLog(`[MCP ${payload.connectionId} Log] ${payload.message}`);
                break;
            case 'error':
                storeActions.addLog(`[Backend Error] ${payload.message}`);
                break;
            default:
                storeActions.addLog(`[WS RECV Unknown] Type: ${type}`);
                console.warn('Received unknown WebSocket message type:', type, payload);
        }
    };

    // --- Return the state and actions --- 
    return {
        configuredServers: [],
        connections: [],
        activeServerId: null,
        activeView: null,
        logs: [],

        addLog: (log) => {
            const timestamp = new Date().toLocaleTimeString([], { hour12: false });
            set((state) => ({ logs: [...state.logs.slice(-200), `[${timestamp}] ${log}`] }));
        },

        clearLogs: (connectionId) => {
            set((state) => {
                const updatedConnections = state.connections.map(conn => {
                    if (conn.id === connectionId) {
                        return {
                            ...conn,
                            rawWsMessages: []
                        };
                    }
                    return conn;
                });
                return { connections: updatedConnections, logs: [] };
            });
        },

        setConfiguredServers: (servers) => {
            console.log('[Store] Setting configured servers:', servers);
            set({ configuredServers: servers });
        },

        updateConnectionStatus: (payload) => {
            const { id, name, status, serverInfo, error, reason } = payload;
            console.log(`[Store] Updating connection status for ${name} (${id}): ${status}`);
            set((state) => {
                const existingIndex = state.connections.findIndex(c => c.id === id);
                let newConnections = [...state.connections];
                let newActiveServerId = state.activeServerId;

                if (existingIndex !== -1) {
                    const existingConn = newConnections[existingIndex];
                    newConnections[existingIndex] = {
                        ...existingConn,
                        name: name || existingConn.name,
                        status,
                        serverInfo: serverInfo !== undefined ? serverInfo : existingConn.serverInfo,
                        lastError: error,
                        resources: (status === 'disconnected' || status === 'error') ? undefined : existingConn.resources,
                        tools: (status === 'disconnected' || status === 'error') ? undefined : existingConn.tools,
                        prompts: (status === 'disconnected' || status === 'error') ? undefined : existingConn.prompts,
                        viewedResourceContent: (status === 'disconnected' || status === 'error') ? undefined : existingConn.viewedResourceContent,
                        lastToolResult: (status === 'disconnected' || status === 'error') ? undefined : existingConn.lastToolResult,
                        viewedPromptMessages: (status === 'disconnected' || status === 'error') ? undefined : existingConn.viewedPromptMessages,
                    };
                    if (state.activeServerId === id && (status === 'disconnected' || status === 'error')) {
                        newActiveServerId = null;
                    }
                } else {
                    newConnections.push({
                        id,
                        name: name,
                        status,
                        serverInfo,
                        lastError: error,
                        resources: undefined,
                        tools: undefined,
                        prompts: undefined,
                        viewedResourceContent: undefined,
                        lastToolResult: undefined,
                        viewedPromptMessages: undefined,
                        rawWsMessages: [],
                    });
                }
                return { connections: newConnections, activeServerId: newActiveServerId };
            });
            get().addLog(`[Connection ${name} (${id})] Status: ${status}${error ? ` Error: ${error}` : ''}${reason ? ` Reason: ${reason}` : ''}`);
        },

        removeConnection: (id) => {
            console.warn('[Store] removeConnection called, but status should be handled by updateConnectionStatus.');
            set((state) => ({
                connections: state.connections.map(c => c.id === id ? { ...c, status: 'disconnected' } : c),
                activeServerId: state.activeServerId === id ? null : state.activeServerId
            }));
        },

        setActiveServer: (id) => {
            const connection = get().connections.find(c => c.id === id);
            if (connection && connection.status === 'connected') {
                console.log(`[Store] Setting active server to ${connection.name} (${id})`);
                set({ activeServerId: id, activeView: 'Resources' });
                get().addLog(`[UI] Selected server: ${connection.name}`);
            } else if (id === null) {
                set({ activeServerId: null, activeView: null });
                get().addLog(`[UI] Deselected server.`);
            } else {
                console.warn(`[Store] Attempted to set non-existent or non-connected server active: ${id}`);
            }
        },

        setActiveView: (view) => {
            if (get().activeServerId) {
                set({ activeView: view });
                get().addLog(`[UI] Switched view to: ${view}`);
            } else {
                console.warn(`[Store] Cannot set view (${view}) without an active server.`);
            }
        },

        setResources: (connectionId, resources) => {
            set((state) => ({
                connections: state.connections.map(c =>
                    c.id === connectionId ? { ...c, resources: resources } : c
                )
            }));
            get().addLog(`[Connection ${connectionId}] Received Resources list.`);
        },
        setTools: (connectionId, tools) => {
            console.log(`[Store] Setting tools for ${connectionId}:`, tools);
            set((state) => ({
                connections: state.connections.map(c =>
                    c.id === connectionId ? { ...c, tools: tools } : c
                )
            }));
            get().addLog(`[Connection ${connectionId}] Received Tools list: ${tools ? tools.length : 'none'} tools available.`);
        },
        setPrompts: (connectionId, prompts) => {
            set((state) => ({
                connections: state.connections.map(c =>
                    c.id === connectionId ? { ...c, prompts: prompts } : c
                )
            }));
            get().addLog(`[Connection ${connectionId}] Received Prompts list.`);
        },
        setResourceContent: (connectionId, uri, content, error) => {
            set((state) => ({
                connections: state.connections.map(c =>
                    c.id === connectionId ? { ...c, viewedResourceContent: { uri, content, error } } : c
                )
            }));
            get().addLog(`[Connection ${connectionId}] Received content for resource: ${uri}${error ? ' (Error)' : ''}`);
        },
        setToolResult: (connectionId, toolName, result, error) => {
            set((state) => ({
                connections: state.connections.map(c =>
                    c.id === connectionId ? { ...c, lastToolResult: { toolName, result, error } } : c
                )
            }));
            get().addLog(`[Connection ${connectionId}] Received result for tool: ${toolName}${error ? ' (Error)' : ''}`);
        },
        setPromptMessages: (connectionId, promptName, messages, error) => {
            set((state) => ({
                connections: state.connections.map(c =>
                    c.id === connectionId ? { ...c, viewedPromptMessages: { promptName, messages, error } } : c
                )
            }));
            get().addLog(`[Connection ${connectionId}] Received messages for prompt: ${promptName}${error ? ' (Error)' : ''}`);
        },
        addRawWsMessage: (connectionId, direction, data) => {
            set((state) => ({
                connections: state.connections.map(c =>
                    c.id === connectionId ? {
                        ...c,
                        rawWsMessages: [...(c.rawWsMessages || []).slice(-50), { direction, data, timestamp: Date.now() }]
                    } : c
                )
            }));
        },

        handleWsMessage: (message) => {
            handleWsMessageInternal(message);
            // Log additional diagnostics for MCP-related messages
            const { type, payload } = message;
            if (['resourcesList', 'toolsList', 'promptsList'].includes(type)) {
                const items = payload.data?.resources || payload.data?.tools || payload.data?.prompts;
                const count = items ? items.length : 0;
                console.log(`[MCP Debug] Received ${type} with ${count} items:`, items);
                get().addLog(`[MCP Debug] ${type} received: ${count} items`);
            }
        },
    };
}); 