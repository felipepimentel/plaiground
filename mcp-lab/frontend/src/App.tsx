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

    return (
        <div className="w-64 border-r border-gray-200 bg-white">
            <div className="p-4 border-b border-gray-200">
                <div className="flex justify-between items-center mb-3">
                    <h3 className="text-lg font-semibold text-gray-800">Servers</h3>
                    <button
                        onClick={handleConnectAll}
                        className="btn btn-primary btn-sm inline-flex items-center"
                        disabled={!isConnected || configuredServers.length === 0}
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-1">
                            <path d="M5 12h14"></path>
                            <path d="M12 5v14"></path>
                        </svg>
                        Connect All
                    </button>
                </div>

                {!isConnected && (
                    <div className="text-amber-600 text-xs p-2 bg-amber-50 rounded-md flex items-center">
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-1">
                            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                            <line x1="12" y1="9" x2="12" y2="13"></line>
                            <line x1="12" y1="17" x2="12.01" y2="17"></line>
                        </svg>
                        WebSocket disconnected
                    </div>
                )}
            </div>

            <div className="overflow-y-auto max-h-[calc(100vh-12rem)] scrollbar-thin">
                {serverList.length === 0 ? (
                    <div className="p-6 text-center text-gray-500 italic">
                        <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" className="mx-auto mb-2 opacity-40">
                            <rect x="2" y="2" width="20" height="8" rx="2" ry="2"></rect>
                            <rect x="2" y="14" width="20" height="8" rx="2" ry="2"></rect>
                            <line x1="6" y1="6" x2="6.01" y2="6"></line>
                            <line x1="6" y1="18" x2="6.01" y2="18"></line>
                        </svg>
                        No servers configured
                    </div>
                ) : (
                    <ul className="divide-y divide-gray-200 animate-fade-in">
                        {serverList.map((server) => {
                            const isActive = server.connectionId === activeServerId;
                            const canBeActive = server.connectionId && server.status === 'connected';

                            // Get status classes
                            const getStatusClass = (status: ServerConnection['status']) => {
                                switch (status) {
                                    case 'connected': return 'status-connected';
                                    case 'connecting': return 'status-connecting';
                                    case 'error': return 'status-error';
                                    default: return 'status-disconnected';
                                }
                            };

                            return (
                                <li key={server.name}
                                    className={`p-3 transition-all duration-200 ${isActive ? 'border-l-4 border-primary-500 bg-primary-50' : 'border-l-4 border-transparent hover:border-gray-200'}`}>
                                    <div className="flex flex-col space-y-2">
                                        <div className="flex justify-between items-start">
                                            <div
                                                className={`cursor-pointer flex items-center ${canBeActive ? 'hover:text-primary-600' : ''}`}
                                                onClick={() => canBeActive && setActiveServer(server.connectionId)}
                                            >
                                                <span className={`status-indicator ${getStatusClass(server.status)}`}></span>
                                                <span className={`font-medium ${isActive ? 'text-primary-700' : ''}`}>
                                                    {server.name}
                                                </span>
                                            </div>

                                            {/* Toggle Switch instead of buttons */}
                                            <div className="relative inline-block w-10 align-middle select-none">
                                                <input
                                                    type="checkbox"
                                                    id={`toggle-${server.name}`}
                                                    className="sr-only"
                                                    checked={server.status === 'connected' || server.status === 'connecting'}
                                                    onChange={() => {
                                                        if (server.status === 'connected' || server.status === 'connecting') {
                                                            server.connectionId && handleDisconnect(server.connectionId);
                                                        } else {
                                                            handleConnect(server.name);
                                                        }
                                                    }}
                                                    disabled={server.status === 'connecting'}
                                                />
                                                <label
                                                    htmlFor={`toggle-${server.name}`}
                                                    className={`
                                                        block overflow-hidden h-5 rounded-full cursor-pointer transition-colors duration-200 ease-in
                                                        ${(server.status === 'connected' || server.status === 'connecting')
                                                            ? 'bg-primary-500'
                                                            : 'bg-gray-300'
                                                        }
                                                        ${server.status === 'connecting' ? 'opacity-60' : ''}
                                                    `}
                                                >
                                                    <span
                                                        className={`
                                                            block h-4 w-4 ml-0.5 mt-0.5 rounded-full bg-white shadow transform transition-transform duration-200 ease-in
                                                            ${(server.status === 'connected' || server.status === 'connecting') ? 'translate-x-5' : ''}
                                                        `}
                                                    />
                                                </label>
                                            </div>
                                        </div>

                                        {server.description && (
                                            <p className="text-xs text-gray-500 ml-5">
                                                {server.description}
                                            </p>
                                        )}

                                        {server.status === 'connecting' && (
                                            <p className="text-xs text-amber-600 ml-5 flex items-center">
                                                <svg className="animate-spin -ml-1 mr-1 h-3 w-3 text-amber-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                                </svg>
                                                Connecting...
                                            </p>
                                        )}

                                        {server.status === 'error' && (
                                            <p className="text-xs text-red-600 ml-5 flex items-center">
                                                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-1">
                                                    <circle cx="12" cy="12" r="10"></circle>
                                                    <line x1="12" y1="8" x2="12" y2="12"></line>
                                                    <line x1="12" y1="16" x2="12.01" y2="16"></line>
                                                </svg>
                                                Connection error
                                            </p>
                                        )}
                                    </div>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </div>
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
        {
            id: 'Resources', icon: (
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 3h18v18H3zM3 9h18M9 21V9"></path>
                </svg>
            )
        },
        {
            id: 'Tools', icon: (
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="3"></circle>
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
                </svg>
            )
        },
        {
            id: 'Prompts', icon: (
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                </svg>
            )
        },
        {
            id: 'Messages', icon: (
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
                    <polyline points="22,6 12,13 2,6"></polyline>
                </svg>
            )
        }
    ];

    return (
        <div className="w-48 border-r border-gray-200 bg-gray-50">
            <div className="p-4">
                <h4 className="text-base font-semibold mb-3 text-gray-700 flex items-center">
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-1">
                        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
                    </svg>
                    Explore
                </h4>

                <div className="card overflow-hidden">
                    {views.map((view, index) => {
                        const viewIsActive = activeView === view.id && !isDisabled;

                        return (
                            <div
                                key={view.id}
                                onClick={() => !isDisabled && setActiveView(view.id as any)}
                                className={`
                                    p-3 cursor-pointer text-sm border-b border-gray-200 flex items-center
                                    ${viewIsActive
                                        ? 'bg-primary-500 text-white font-medium'
                                        : 'hover:bg-gray-50 text-gray-700'
                                    }
                                    ${index === views.length - 1 ? 'border-b-0' : ''}
                                    ${isDisabled ? 'opacity-50 cursor-not-allowed' : ''}
                                    transition-all duration-200
                                `}
                            >
                                <span className="mr-2">{view.icon}</span>
                                {view.id}
                            </div>
                        );
                    })}
                </div>

                {isDisabled && (
                    <div className="mt-4 p-3 bg-yellow-50 rounded-md border border-yellow-200 text-xs text-yellow-700 animate-fade-in">
                        <div className="flex items-center mb-1">
                            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-1">
                                <circle cx="12" cy="12" r="10"></circle>
                                <line x1="12" y1="8" x2="12" y2="12"></line>
                                <line x1="12" y1="16" x2="12.01" y2="16"></line>
                            </svg>
                            <span className="font-medium">Connection Required</span>
                        </div>
                        <p>Please select a connected server to explore its features.</p>
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
            <div className="flex-grow p-6 flex items-center justify-center bg-gray-50">
                <div className="text-center max-w-md animate-fade-in">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gray-100 mb-4">
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-400">
                            <rect x="2" y="2" width="20" height="8" rx="2" ry="2"></rect>
                            <rect x="2" y="14" width="20" height="8" rx="2" ry="2"></rect>
                            <line x1="6" y1="6" x2="6.01" y2="6"></line>
                            <line x1="6" y1="18" x2="6.01" y2="18"></line>
                        </svg>
                    </div>
                    <h3 className="text-lg font-medium text-gray-700 mb-2">No Server Selected</h3>
                    <p className="text-gray-500">
                        Select a connected server from the list to explore its resources, tools, prompts, and messages.
                    </p>
                    <div className="mt-4 flex justify-center">
                        <div className="inline-flex items-center p-1 rounded-md bg-gray-100 text-xs text-gray-500">
                            <span className="px-2">Connect a server to get started</span>
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="9 18 15 12 9 6"></polyline>
                            </svg>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    if (activeConnection.status !== 'connected') {
        return (
            <div className="flex-grow p-6 flex items-center justify-center bg-gray-50">
                <div className="text-center max-w-md animate-fade-in">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-yellow-50 mb-4">
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-yellow-400">
                            <circle cx="12" cy="12" r="10"></circle>
                            <line x1="12" y1="8" x2="12" y2="12"></line>
                            <line x1="12" y1="16" x2="12.01" y2="16"></line>
                        </svg>
                    </div>
                    <h3 className="text-lg font-medium text-gray-700 mb-2">Server Not Connected</h3>
                    <p className="text-gray-500">The selected server is currently {activeConnection.status}.</p>
                    {activeConnection.status === 'error' && (
                        <div className="mt-4 p-3 bg-red-50 rounded-md text-xs text-red-600 inline-block">
                            Connection failed. Please try again.
                        </div>
                    )}
                </div>
            </div>
        );
    }

    return (
        <div className="flex-grow p-4 bg-white">
            <div className="border-b border-gray-200 pb-3 mb-4 flex items-center justify-between">
                <h2 className="text-xl font-semibold text-gray-800 flex items-center">
                    {activeView === 'Resources' && (
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2">
                            <path d="M3 3h18v18H3zM3 9h18M9 21V9"></path>
                        </svg>
                    )}
                    {activeView === 'Tools' && (
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2">
                            <circle cx="12" cy="12" r="3"></circle>
                            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
                        </svg>
                    )}
                    {activeView === 'Prompts' && (
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2">
                            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                        </svg>
                    )}
                    {activeView === 'Messages' && (
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2">
                            <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
                            <polyline points="22,6 12,13 2,6"></polyline>
                        </svg>
                    )}
                    {activeView} for <span className="text-primary-600 ml-1">{activeConnection.name}</span>
                </h2>

                <div className="flex items-center">
                    <span className="text-xs text-gray-500 mr-2">Connected</span>
                    <span className="status-indicator status-connected"></span>
                </div>
            </div>

            <div className="p-4 border border-gray-200 rounded-md bg-gray-50 animate-fade-in">
                <div className="flex justify-center mb-3">
                    <div className="inline-flex items-center p-1 rounded-md bg-gray-200 text-xs">
                        {['Resources', 'Tools', 'Prompts', 'Messages'].map(view => (
                            <button
                                key={view}
                                className={`px-3 py-1 rounded-md transition-all ${activeView === view ? 'bg-white shadow-sm' : 'hover:bg-gray-100'}`}
                                onClick={() => activeConnection && activeConnection.status === 'connected' && useStore.getState().setActiveView(view as any)}
                            >
                                {view}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="bg-white p-6 rounded-md shadow-sm text-center">
                    <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" className="mx-auto mb-4 text-gray-300">
                        <circle cx="12" cy="12" r="10"></circle>
                        <path d="M12 8v4l4 2"></path>
                    </svg>
                    <p className="text-gray-600 mb-4">
                        {activeView} functionality will be implemented soon.
                    </p>
                    <button className="btn btn-primary">
                        Coming Soon
                    </button>
                </div>
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

    const connectingCount = useMemo(() =>
        connections.filter(c => c.status === 'connecting').length,
        [connections]
    );

    return (
        <div className="flex items-center space-x-3 text-sm">
            <div className="flex items-center px-2 py-1 rounded-md bg-gray-50 border border-gray-200">
                <div className={`status-indicator ${isConnected ? 'status-connected' : 'status-error'}`} />
                <span className="text-gray-600">
                    WebSocket: <span className={isConnected ? 'text-green-600 font-medium' : 'text-red-600 font-medium'}>
                        {isConnected ? 'Connected' : 'Disconnected'}
                    </span>
                </span>
            </div>

            {connectedCount > 0 && (
                <div className="flex items-center px-2 py-1 rounded-md bg-green-50 border border-green-200">
                    <div className="status-indicator status-connected" />
                    <span className="text-gray-700">
                        <span className="font-medium text-green-600">{connectedCount}</span> {connectedCount === 1 ? 'server' : 'servers'} connected
                    </span>
                </div>
            )}

            {connectingCount > 0 && (
                <div className="flex items-center px-2 py-1 rounded-md bg-yellow-50 border border-yellow-200 animate-pulse">
                    <div className="status-indicator status-connecting" />
                    <span className="text-gray-700">
                        <span className="font-medium text-yellow-600">{connectingCount}</span> connecting...
                    </span>
                </div>
            )}
        </div>
    );
}

function App() {
    const { isConnected } = useWebSocket();
    const { activeServerId } = useStore();

    return (
        <div className="min-h-screen flex flex-col bg-gray-50">
            {/* Header */}
            <header className="bg-white border-b border-gray-200 shadow-sm">
                <div className="max-w-7xl mx-auto px-4 py-3 flex justify-between items-center">
                    <h1 className="text-xl font-bold text-gray-900 flex items-center">
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2 text-primary-500">
                            <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
                            <line x1="8" y1="21" x2="16" y2="21"></line>
                            <line x1="12" y1="17" x2="12" y2="21"></line>
                        </svg>
                        MCP Exploration Lab
                    </h1>
                    <StatusBar />
                </div>
            </header>

            {/* Main Content */}
            <main className="flex-grow flex">
                <div className="max-w-7xl w-full mx-auto p-4 flex">
                    <div className="flex flex-1 bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden animate-fade-in">
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
            <footer className="bg-white border-t border-gray-200 py-3">
                <div className="max-w-7xl mx-auto px-4 flex justify-between items-center">
                    <p className="text-sm text-gray-500">
                        MCP Exploration Lab © {new Date().getFullYear()}
                    </p>
                    <div className="flex space-x-4">
                        <a href="#" className="text-sm text-gray-500 hover:text-primary-600 transition-colors">About</a>
                        <a href="#" className="text-sm text-gray-500 hover:text-primary-600 transition-colors">Documentation</a>
                        <a href="#" className="text-sm text-gray-500 hover:text-primary-600 transition-colors">GitHub</a>
                    </div>
                </div>
            </footer>
        </div>
    );
}

export default App; 