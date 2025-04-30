import { useCallback, useEffect, useMemo, useState } from 'react';
// Use shared types
import {
    ServerConnection
} from '@mcp-lab/shared';
import { useWebSocket } from './hooks/useWebSocket';
import { useStore } from './store';

// Import types from store
type ActiveView = 'Resources' | 'Tools' | 'Prompts' | 'Messages' | null;

// --- Constants for Styling ---
// UI color palette sourced from Tailwind variables
const colors = {
    primary: {
        light: 'bg-primary-50',
        main: 'bg-primary-500',
        dark: 'bg-primary-700',
        text: 'text-primary-600',
        border: 'border-primary-500',
        hover: 'hover:bg-primary-600',
    },
    secondary: {
        light: 'bg-gray-50',
        main: 'bg-gray-100',
        dark: 'bg-gray-200',
        text: 'text-gray-700',
        border: 'border-gray-300',
        hover: 'hover:bg-gray-100',
    },
    success: {
        main: 'bg-green-500',
        text: 'text-green-500',
        border: 'border-green-500',
    },
    warning: {
        main: 'bg-amber-500',
        text: 'text-amber-500',
        border: 'border-amber-500',
    },
    error: {
        main: 'bg-red-500',
        text: 'text-red-500',
        border: 'border-red-500',
        light: 'bg-red-50',
    },
};

// Panel styling
const panelPadding = "p-4";
const panelBg = "bg-white";
const panelBorder = "border-r border-gray-200";
const panelShadow = "shadow-sm";
const panelRounded = "rounded-lg";

// Typography
const titleClass = "text-lg font-semibold mb-4 text-gray-800";
const subtitleClass = "text-base font-medium mb-3 text-gray-700";
const textClass = "text-sm text-gray-600";

// Lists
const listClass = "list-none p-0 m-0 space-y-1";
const listItemBaseClass = "p-2 rounded-md text-sm transition-all duration-200 ease-in-out";
const listItemHoverClass = "hover:bg-gray-100";
const listItemActiveClass = `${colors.primary.light} ${colors.primary.text} font-medium`;

// Buttons
const buttonBaseClass = "px-4 py-2 text-sm rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-blue-400 transition-all duration-200 ease-in-out font-medium";
const buttonPrimaryClass = `${buttonBaseClass} ${colors.primary.main} text-white ${colors.primary.hover} disabled:opacity-50 disabled:cursor-not-allowed`;
const buttonSecondaryClass = `${buttonBaseClass} bg-white ${colors.secondary.text} ${colors.secondary.hover} border ${colors.secondary.border} disabled:opacity-50 disabled:cursor-not-allowed`;
const buttonSmallClass = "px-3 py-1.5 text-xs";

// Inputs
const inputBaseClass = "block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 sm:text-sm disabled:bg-gray-100";
const labelClass = "block text-sm font-medium text-gray-700 mb-1";
const formGroupClass = "mb-4";

// Code and pre-formatted text
const preformattedClass = "text-sm whitespace-pre-wrap break-all bg-gray-50 p-3 border border-gray-200 rounded-md font-mono max-h-96 overflow-y-auto";
const errorPreformattedClass = "text-red-700 bg-red-50 p-3 rounded-md border border-red-200 text-sm whitespace-pre-wrap break-all font-mono";
const emptyStateClass = "text-gray-500 italic p-6 text-center";

// Status indicators
const statusIndicator = {
    connected: `text-green-500`,
    connecting: `text-amber-500 animate-pulse`,
    disconnected: `text-gray-400`,
    error: `text-red-500`,
};

// Cards
const cardClass = `bg-white ${panelShadow} ${panelRounded} border ${colors.secondary.border} overflow-hidden`;

// --- REVISED ServerSelector ---

function ServerSelector() {
    const { sendMessage, isConnected } = useWebSocket();
    const { configuredServers, connections, activeServerId, setActiveServer } = useStore();

    // Auto-select first connected server if none is selected
    useEffect(() => {
        if (!activeServerId && connections.length > 0) {
            const connectedServer = connections.find(c => c.status === 'connected');
            if (connectedServer) {
                setActiveServer(connectedServer.id);
            }
        }
    }, [activeServerId, connections, setActiveServer]);

    const handleConnect = useCallback((serverName: string) => {
        console.log(`[Frontend] Sending connectConfigured for serverName: ${serverName}`);
        sendMessage({ type: 'connectConfigured', payload: { serverName } });
    }, [sendMessage]);

    const handleDisconnect = useCallback((connectionId: string) => {
        sendMessage({ type: 'disconnect', payload: { connectionId } });
    }, [sendMessage]);

    const handleConnectAll = useCallback(() => {
        console.log('[Frontend] Connecting all disconnected servers...');
        configuredServers.forEach(config => {
            const existingConnection = connections.find(c => c.name === config.name);
            if (!existingConnection || existingConnection.status === 'disconnected' || existingConnection.status === 'error') {
                handleConnect(config.name);
            }
        });
    }, [configuredServers, connections, handleConnect]);

    // When a server connects, request its tools list
    useEffect(() => {
        connections.forEach(conn => {
            if (conn.status === 'connected' && !conn.tools) {
                console.log(`[Frontend] Auto-requesting tools for server ${conn.id} (${conn.name})`);
                sendMessage({ type: 'getTools', payload: { connectionId: conn.id } });
            }
        });
    }, [connections, sendMessage]);

    // Derive a combined list for rendering
    const serverList = useMemo(() => {
        return configuredServers.map(config => {
            const activeConn = connections.find(c => c.name === config.name);
            return {
                name: config.name,
                description: config.description,
                connectionId: activeConn?.id,
                status: activeConn?.status || 'disconnected',
                serverInfo: activeConn?.serverInfo,
                error: activeConn?.lastError
            };
        });
    }, [configuredServers, connections]);

    // Helper function to get status indicator class
    const getStatusClass = (status: ServerConnection['status']) => {
        switch (status) {
            case 'connected': return 'status-connected';
            case 'connecting': return 'status-connecting';
            case 'error': return 'status-error';
            default: return 'status-disconnected';
        }
    };

    return (
        <div className="server-sidebar">
            <div className="sidebar-header">
                <div className="sidebar-header-content">
                    <h3 className="sidebar-title">Servers</h3>
                    <button
                        onClick={handleConnectAll}
                        className="btn btn-connect-all"
                        disabled={!isConnected || configuredServers.length === 0}
                    >
                        + Connect All
                    </button>
                </div>

                {!isConnected && (
                    <div className="websocket-disconnected">
                        ⚠️ WebSocket disconnected
                    </div>
                )}
            </div>

            <ul className="server-list scrollbar-thin">
                {serverList.length === 0 ? (
                    <div className="server-list-empty">
                        No servers configured
                    </div>
                ) : (
                    serverList.map((server) => {
                        const isActive = server.connectionId === activeServerId;
                        const canBeActive = server.connectionId && server.status === 'connected';

                        return (
                            <li key={server.name} className={`server-item ${isActive ? 'active' : ''}`}>
                                <div
                                    className="server-item-header"
                                    onClick={() => canBeActive && setActiveServer(server.connectionId)}
                                >
                                    <span className={`status-indicator ${getStatusClass(server.status)}`}></span>
                                    <span className="server-name">
                                        {server.name}
                                    </span>
                                </div>

                                {server.description && (
                                    <div className="server-description">
                                        {server.description}
                                    </div>
                                )}

                                {server.status === 'connecting' && (
                                    <div className="server-description text-warning">
                                        Connecting...
                                    </div>
                                )}

                                {server.status === 'error' && (
                                    <div className="server-error">
                                        Connection error
                                    </div>
                                )}

                                <div className="server-actions">
                                    {server.status === 'connected' || server.status === 'connecting' ? (
                                        <button
                                            onClick={() => server.connectionId && handleDisconnect(server.connectionId)}
                                            className="btn btn-sm btn-disconnect"
                                            disabled={server.status === 'connecting'}
                                        >
                                            {server.status === 'connecting' ? 'Connecting...' : 'Disconnect'}
                                        </button>
                                    ) : (
                                        <button
                                            onClick={() => handleConnect(server.name)}
                                            className="btn btn-sm btn-connect"
                                        >
                                            Connect
                                        </button>
                                    )}
                                </div>
                            </li>
                        );
                    })
                )}
            </ul>
        </div>
    );
}

function Navigation() {
    const { activeServerId, setActiveView, activeView } = useStore();
    const { sendMessage, isConnected } = useWebSocket();
    const isConnectedAndActive = useStore(state => {
        const conn = state.connections.find(c => c.id === state.activeServerId);
        return conn?.status === 'connected';
    });
    const isDisabled = !activeServerId || !isConnectedAndActive;

    const views = [
        { id: 'Resources', icon: '📁' },
        { id: 'Tools', icon: '🔧' },
        { id: 'Prompts', icon: '💬' },
        { id: 'Messages', icon: '📨' }
    ];

    // We don't need to request data here - we'll do it on initial view selection only
    const handleViewSelect = useCallback((viewId: ActiveView) => {
        if (isDisabled) return;
        setActiveView(viewId);
    }, [isDisabled, setActiveView]);

    return (
        <div className="navigation">
            <div className="nav-header">
                Explore
            </div>

            <div className="nav-menu">
                {views.map((view) => {
                    const viewIsActive = activeView === view.id && !isDisabled;

                    return (
                        <div
                            key={view.id}
                            onClick={() => handleViewSelect(view.id as any)}
                            className={`nav-item ${viewIsActive ? 'active' : ''} ${isDisabled ? 'disabled' : ''}`}
                        >
                            <span className="nav-item-icon">{view.icon}</span>
                            {view.id}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

function MainContentArea() {
    const { connections, activeServerId, activeView } = useStore();
    const { sendMessage } = useWebSocket();
    const [toolParams, setToolParams] = useState<Record<string, Record<string, string>>>({});
    const [isExecuting, setIsExecuting] = useState<Record<string, boolean>>({});
    const [toolsLoadingTimeout, setToolsLoadingTimeout] = useState(false);
    const [dataRequested, setDataRequested] = useState<Record<string, boolean>>({});
    const [manuallyRequestedTool, setManuallyRequestedTool] = useState(false);

    const activeConnection = useMemo(() => {
        return connections.find(c => c.id === activeServerId);
    }, [connections, activeServerId]);

    // Load data when view or server changes
    useEffect(() => {
        // Skip if no connection or not connected
        if (!activeServerId || !activeView || !activeConnection || activeConnection.status !== 'connected') {
            return;
        }

        // Skip if we've already requested this data for this server+view combination
        const requestKey = `${activeServerId}-${activeView}`;
        if (dataRequested[requestKey]) {
            return;
        }

        // Mark this data as requested
        setDataRequested(prev => ({
            ...prev,
            [requestKey]: true
        }));

        // Request the appropriate data
        switch (activeView) {
            case 'Resources':
                console.log(`[Frontend] Requesting resources for server ${activeServerId}`);
                sendMessage({ type: 'getResources', payload: { connectionId: activeServerId } });
                break;
            case 'Tools':
                console.log(`[Frontend] Requesting tools for server ${activeServerId}`);
                sendMessage({ type: 'getTools', payload: { connectionId: activeServerId } });
                break;
            case 'Prompts':
                console.log(`[Frontend] Requesting prompts for server ${activeServerId}`);
                sendMessage({ type: 'getPrompts', payload: { connectionId: activeServerId } });
                break;
            default:
                break;
        }
    }, [activeServerId, activeView, activeConnection, sendMessage]);

    // Set a timeout for tools loading
    useEffect(() => {
        if (activeView === 'Tools' && activeConnection?.tools === undefined) {
            // If tools are undefined for more than 5 seconds, show the timeout UI
            const timeoutId = setTimeout(() => {
                setToolsLoadingTimeout(true);
            }, 5000);

            return () => {
                clearTimeout(timeoutId);
                setToolsLoadingTimeout(false);
            };
        }
    }, [activeView, activeConnection?.tools]);

    // Card styling for content items
    const cardClass = "bg-white shadow-sm rounded-lg border border-gray-200 overflow-hidden";

    // Handle parameter input change
    const handleParamChange = useCallback((toolName: string, paramName: string, value: string) => {
        setToolParams(prev => ({
            ...prev,
            [toolName]: {
                ...(prev[toolName] || {}),
                [paramName]: value
            }
        }));
    }, []);

    // Execute a tool
    const executeTool = useCallback(async (toolName: string) => {
        if (!activeServerId) return;

        const params = toolParams[toolName] || {};

        setIsExecuting(prev => ({ ...prev, [toolName]: true }));

        try {
            // Send tool call using MCP format
            const mcpToolCall = {
                jsonrpc: "2.0",
                id: Math.floor(Math.random() * 10000),
                method: "tools/call",
                params: {
                    name: toolName,
                    arguments: params
                }
            };
            console.log('[Frontend] Executing tool using MCP format:', mcpToolCall);
            sendMessage(mcpToolCall);
        } catch (err) {
            console.error(`Error executing tool ${toolName}:`, err);
        }

        // Reset executing state after a delay to show feedback
        setTimeout(() => {
            setIsExecuting(prev => ({ ...prev, [toolName]: false }));
        }, 1000);
    }, [activeServerId, sendMessage, toolParams]);

    if (!activeConnection) {
        return (
            <div className="main-area">
                <div className="no-server-selected">
                    <div className="placeholder-icon">+</div>
                    <h3 className="placeholder-title">No Server Selected</h3>
                    <p className="placeholder-text">
                        Select a connected server from the list to explore its resources, tools, prompts, and messages.
                    </p>
                </div>
            </div>
        );
    }

    if (activeConnection.status !== 'connected') {
        return (
            <div className="main-area">
                <div className="no-server-selected">
                    <h3 className="placeholder-title">Server Not Connected</h3>
                    <p className="placeholder-text">The selected server is currently {activeConnection.status}.</p>
                </div>
            </div>
        );
    }

    // Render content based on activeView
    const renderContent = () => {
        switch (activeView) {
            case 'Tools':
                console.log('[Frontend] Rendering Tools view, tools state:',
                    activeConnection.tools === undefined ? 'undefined' :
                        (activeConnection.tools.length === 0 ? 'empty array' :
                            `array with ${activeConnection.tools.length} items`));

                // Tools are fetched but empty
                if (activeConnection.tools !== undefined && activeConnection.tools.length === 0) {
                    return (
                        <div className="content-placeholder">
                            <div className="flex flex-col items-center justify-center p-6">
                                <div className="text-center mb-4">
                                    <h3 className="text-amber-600 font-medium mb-2">
                                        No tools available for this server
                                    </h3>
                                    <p className="text-gray-600 text-sm mb-4">
                                        This server doesn't have any tools defined or the tools list is empty.
                                    </p>
                                    <div className="rounded-md bg-gray-50 p-4 text-left">
                                        <h4 className="text-sm font-medium mb-2">Server Information:</h4>
                                        <ul className="text-xs text-gray-600 space-y-1">
                                            <li><span className="font-medium">Name:</span> {activeConnection.name}</li>
                                            <li><span className="font-medium">ID:</span> {activeConnection.id}</li>
                                            {activeConnection.serverInfo && (
                                                <>
                                                    <li><span className="font-medium">Server Name:</span> {activeConnection.serverInfo.name}</li>
                                                    <li><span className="font-medium">Version:</span> {activeConnection.serverInfo.version}</li>
                                                </>
                                            )}
                                        </ul>
                                    </div>
                                </div>

                                <button
                                    className="btn btn-primary"
                                    onClick={() => {
                                        if (activeServerId) {
                                            console.log('[Frontend] Manually re-requesting tools after empty result');
                                            // Use standard MCP format with JSON-RPC 2.0
                                            const mcpMessage = {
                                                jsonrpc: "2.0",
                                                id: Math.floor(Math.random() * 10000),
                                                method: "tools/list",
                                                params: {}
                                            };
                                            console.log('[Frontend] Sending standard MCP format for tools:', mcpMessage);
                                            sendMessage(mcpMessage);
                                        }
                                    }}
                                >
                                    Try Again
                                </button>
                            </div>
                        </div>
                    );
                }

                // Tools are still being fetched
                if (activeConnection.tools === undefined) {
                    console.log('[Frontend] Tools are undefined, showing loading state');

                    // Get raw WebSocket messages for debugging
                    const rawMessages = activeConnection.rawWsMessages || [];
                    const toolsRelatedMessages = rawMessages.filter(msg => {
                        try {
                            const data = JSON.parse(msg.data);
                            return data.method === 'tools/list' ||
                                data.result?.tools !== undefined ||
                                data.type === 'getTools' ||
                                data.type === 'toolsList';
                        } catch {
                            return false;
                        }
                    });

                    return (
                        <div className="content-placeholder">
                            <div className="flex flex-col items-center justify-center p-6">
                                <div className="loading-spinner mb-4"></div>
                                {toolsLoadingTimeout ? (
                                    <div className="text-center mb-4">
                                        <p className="text-amber-600 font-medium mb-2">
                                            Tools are taking longer than expected to load.
                                        </p>
                                        <p className="text-gray-600 text-sm mb-2">
                                            This might be due to one of the following reasons:
                                        </p>
                                        <ul className="text-sm text-left text-gray-600 mb-4">
                                            <li>• The server doesn't support tools</li>
                                            <li>• The connection is experiencing issues</li>
                                            <li>• The backend is still processing</li>
                                        </ul>
                                    </div>
                                ) : (
                                    <p className="mb-4">Loading tools...</p>
                                )}

                                <div className="flex space-x-2 mb-4">
                                    <button
                                        className="btn btn-primary"
                                        onClick={() => {
                                            console.log('[Frontend] Manually requesting tools for', activeServerId);
                                            setToolsLoadingTimeout(false); // Reset timeout on manual reload
                                            setManuallyRequestedTool(true); // Set flag to prevent auto-retry
                                            if (activeServerId) {
                                                // Use standard MCP format with JSON-RPC 2.0 specification
                                                sendMessage({
                                                    jsonrpc: "2.0",
                                                    id: Math.floor(Math.random() * 10000),
                                                    method: "tools/list",
                                                    params: {}
                                                });
                                            }
                                        }}
                                    >
                                        Reload Tools
                                    </button>

                                    {toolsLoadingTimeout && (
                                        <button
                                            className="btn btn-secondary"
                                            onClick={() => {
                                                console.log('[Frontend] Assuming server has no tools');
                                                // Manually update the store to show empty tools array
                                                useStore.getState().setTools(activeServerId!, []);
                                            }}
                                        >
                                            Assume No Tools
                                        </button>
                                    )}
                                </div>

                                {toolsLoadingTimeout && toolsRelatedMessages.length > 0 && (
                                    <div className="mt-6 w-full max-w-2xl">
                                        <h4 className="text-sm font-medium mb-2 text-gray-700 border-b pb-1">Debug Information</h4>
                                        <div className="bg-gray-50 p-3 rounded text-xs font-mono overflow-x-auto max-h-64 overflow-y-auto">
                                            {toolsRelatedMessages.length === 0 ? (
                                                <p className="text-gray-500 italic">No tools-related messages found</p>
                                            ) : (
                                                toolsRelatedMessages.map((msg, idx) => {
                                                    try {
                                                        const parsed = JSON.parse(msg.data);
                                                        return (
                                                            <div key={idx} className="mb-2 pb-2 border-b border-gray-200 last:border-0">
                                                                <div className={`font-bold ${msg.direction === 'send' ? 'text-blue-600' : 'text-green-600'}`}>
                                                                    [{new Date(msg.timestamp).toLocaleTimeString()}]
                                                                    {msg.direction === 'send' ? ' ➡️ SENT:' : ' ⬅️ RECEIVED:'}
                                                                </div>
                                                                <pre className="mt-1 whitespace-pre-wrap break-all">
                                                                    {JSON.stringify(parsed, null, 2)}
                                                                </pre>
                                                            </div>
                                                        );
                                                    } catch {
                                                        return null;
                                                    }
                                                })
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                }

                // If we have tools, display them
                if (activeConnection.tools && activeConnection.tools.length > 0) {
                    console.log('[Frontend] Rendering tools list:', activeConnection.tools);

                    return (
                        <div className="tools-container">
                            {activeConnection.tools.map((tool) => (
                                <div key={tool.name} className={`${cardClass} mb-4`}>
                                    <div className="p-4">
                                        <h3 className="text-lg font-semibold mb-2">{tool.name}</h3>
                                        {tool.description && (
                                            <p className="text-sm text-gray-600 mb-3">{tool.description}</p>
                                        )}

                                        {tool.parameters && (
                                            <div className="mb-4">
                                                <h4 className="text-sm font-medium mb-2">Parameters:</h4>
                                                {Object.entries(tool.parameters.properties).map(([name, schema]) => (
                                                    <div key={name} className="mb-3">
                                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                                            {name}
                                                            {tool.parameters?.required?.includes(name) && (
                                                                <span className="text-red-500 ml-1">*</span>
                                                            )}
                                                        </label>
                                                        <input
                                                            type="text"
                                                            className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                                                            placeholder={schema.description || ''}
                                                            value={toolParams[tool.name]?.[name] || ''}
                                                            onChange={(e) => handleParamChange(tool.name, name, e.target.value)}
                                                        />
                                                        {schema.description && (
                                                            <p className="mt-1 text-xs text-gray-500">{schema.description}</p>
                                                        )}
                                                    </div>
                                                ))}

                                                <button
                                                    className="btn btn-primary mt-3"
                                                    onClick={() => executeTool(tool.name)}
                                                    disabled={isExecuting[tool.name]}
                                                >
                                                    {isExecuting[tool.name] ? (
                                                        <>
                                                            <span className="loading-spinner sm mr-2"></span>
                                                            Executing...
                                                        </>
                                                    ) : 'Execute Tool'}
                                                </button>
                                            </div>
                                        )}

                                        {activeConnection.lastToolResult?.toolName === tool.name && (
                                            <div className="mt-4">
                                                <h4 className="text-sm font-medium mb-2">Result:</h4>
                                                <div className="text-sm bg-gray-50 p-3 rounded-md border border-gray-200 font-mono whitespace-pre-wrap overflow-x-auto">
                                                    {activeConnection.lastToolResult.error ? (
                                                        <div className="text-red-600">
                                                            Error: {activeConnection.lastToolResult.error}
                                                        </div>
                                                    ) : (
                                                        <div>
                                                            {typeof activeConnection.lastToolResult.result === 'object'
                                                                ? JSON.stringify(activeConnection.lastToolResult.result, null, 2)
                                                                : String(activeConnection.lastToolResult.result)}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    );
                }
                break;

            case 'Resources':
                // Render resources when implemented
                break;

            case 'Prompts':
                // Render prompts when implemented
                break;

            case 'Messages':
                // Render messages when implemented
                break;

            default:
                break;
        }

        // Default placeholder
        return (
            <div className="content-placeholder">
                <p>
                    This area will display {activeView?.toLowerCase()} when implemented.
                </p>
            </div>
        );
    };

    return (
        <div className="main-area">
            <div className="main-area-header">
                <h2 className="main-area-title">
                    {activeView} for {activeConnection.name}
                </h2>
            </div>
            {renderContent()}
        </div>
    );
}

function StatusBar() {
    const { isConnected } = useWebSocket();
    const connections = useStore(state => state.connections);

    const connectedCount = useMemo(() =>
        connections.filter(c => c.status === 'connected').length,
        [connections]
    );

    return (
        <div className="top-status-bar">
            <div className="top-status-item">
                <span className="top-status-indicator top-status-connected"></span>
                <span>WebSocket: Connected</span>
            </div>
            {connectedCount > 0 && (
                <div className="top-status-item">
                    <span className="top-status-indicator top-status-connected"></span>
                    <span>Servers: {connectedCount} connected</span>
                </div>
            )}
        </div>
    );
}

function App() {
    const { activeServerId } = useStore();

    return (
        <div className="app-container">
            {/* Header */}
            <header className="app-header">
                <div className="container flex justify-between items-center">
                    <h1 className="app-title">MCP Exploration Lab</h1>
                    <StatusBar />
                </div>
            </header>

            {/* Main Content */}
            <main className="main-content">
                <div className="container">
                    <div className="panel-container">
                        <ServerSelector />
                        {activeServerId && (
                            <>
                                <Navigation />
                                <MainContentArea />
                            </>
                        )}
                    </div>
                </div>
            </main>

            {/* Footer */}
            <footer className="app-footer">
                <div className="container">
                    <p>MCP Exploration Lab © {new Date().getFullYear()}</p>
                </div>
            </footer>
        </div>
    );
}

export default App; 