import { useCallback, useMemo } from 'react';
// Use shared types
import {
    ServerConnection
} from '@mcp-lab/shared';
import { useWebSocket } from './hooks/useWebSocket';
import { useStore } from './store';

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
                        className="btn btn-sm btn-connect-all"
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
                                    <div className="server-description text-error">
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

    return (
        <div className="navigation">
            <div className="nav-content">
                <h4 className="nav-title">Explore</h4>

                <div className="nav-menu">
                    {views.map((view) => {
                        const viewIsActive = activeView === view.id && !isDisabled;

                        return (
                            <div
                                key={view.id}
                                onClick={() => !isDisabled && setActiveView(view.id as any)}
                                className={`nav-item ${viewIsActive ? 'active' : ''} ${isDisabled ? 'disabled' : ''}`}
                            >
                                <span className="nav-item-icon">{view.icon}</span>
                                {view.id}
                            </div>
                        );
                    })}
                </div>

                {isDisabled && (
                    <div className="nav-warning">
                        Please select a connected server to explore its features.
                    </div>
                )}
            </div>
        </div>
    );
}

function MainContentArea() {
    const { connections, activeServerId, activeView } = useStore();

    const activeConnection = useMemo(() => {
        return connections.find(c => c.id === activeServerId);
    }, [connections, activeServerId]);

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

    return (
        <div className="main-area">
            <div className="main-area-header">
                <h2 className="main-area-title">
                    {activeView} for {activeConnection.name}
                </h2>
            </div>
            <div className="content-placeholder">
                <p>
                    This area will display {activeView.toLowerCase()} when implemented.
                </p>
            </div>
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
        <div className="status-bar">
            <div className="status-item">
                <div className={`status-indicator ${isConnected ? 'status-connected' : 'status-error'}`}></div>
                <span>WebSocket: {isConnected ? 'Connected' : 'Disconnected'}</span>
            </div>

            {connectedCount > 0 && (
                <div className="status-item">
                    <div className="status-indicator status-connected"></div>
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