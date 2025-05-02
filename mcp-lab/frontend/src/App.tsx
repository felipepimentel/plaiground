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

// --- Helper function to get status details ---
const getStatusDetails = (status: ServerConnection['status']) => {
    switch (status) {
        case 'connected': return { class: 'status-connected', icon: 'fas fa-check-circle', text: 'Connected' };
        case 'connecting': return { class: 'status-connecting', icon: 'fas fa-sync fa-spin', text: 'Connecting' };
        case 'error': return { class: 'status-error', icon: 'fas fa-exclamation-triangle', text: 'Error' };
        default: return { class: 'status-disconnected', icon: 'fas fa-plug', text: 'Disconnected' };
    }
};

// Function to handle keyboard shortcuts globally
function useKeyboardShortcuts(shortcuts: Record<string, () => void>) {
    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            // Check if user is typing in an input field
            if (event.target instanceof HTMLInputElement ||
                event.target instanceof HTMLTextAreaElement) {
                return;
            }

            // Handle key combinations (e.g., "Ctrl+R")
            let key = event.key.toLowerCase();
            if (event.ctrlKey) key = `ctrl+${key}`;
            if (event.altKey) key = `alt+${key}`;
            if (event.shiftKey) key = `shift+${key}`;

            if (shortcuts[key]) {
                event.preventDefault();
                shortcuts[key]();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [shortcuts]);
}

// --- Server Selector Component ---
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

    const handleRefreshServers = useCallback(() => {
        console.log('[Frontend] Refreshing server list...');
        sendMessage({ type: 'refreshServers', payload: {} });
    }, [sendMessage]);

    // Add keyboard shortcuts
    useKeyboardShortcuts({
        'r': handleRefreshServers,
        'c': handleConnectAll,
    });

    // Auto-request tools, resources, and prompts upon connection
    useEffect(() => {
        const connectedNeedsLoad = connections.filter(conn =>
            conn.status === 'connected' && (!conn.tools || !conn.resources || !conn.prompts)
        );

        if (connectedNeedsLoad.length === 0) return;

        connectedNeedsLoad.forEach((conn, index) => {
            setTimeout(() => {
                console.log(`[Frontend] Auto-requesting capabilities for server ${conn.id} (${conn.name})`);
                if (!conn.tools) sendMessage({ type: 'getTools', payload: { connectionId: conn.id } });
                if (!conn.resources) sendMessage({ type: 'getResources', payload: { connectionId: conn.id } });
                if (!conn.prompts) sendMessage({ type: 'getPrompts', payload: { connectionId: conn.id } });
            }, index * 500); // Slightly faster interval
        });
    }, [connections, sendMessage]);

    const serverList = useMemo(() => {
        return configuredServers.map(config => {
            const activeConn = connections.find(c => c.name === config.name);
            return {
                name: config.name,
                description: config.description,
                connectionId: activeConn?.id,
                status: activeConn?.status || 'disconnected',
                serverInfo: activeConn?.serverInfo,
                error: activeConn?.lastError,
                category: config.category || 'Uncategorized',
            };
        });
    }, [configuredServers, connections]);

    const categorizedServers = useMemo(() => {
        const categories = new Map();

        // Get category configuration from the store
        const categoryOrder = useStore.getState().categoryConfig?.order || [];
        const categoryIcons = useStore.getState().categoryConfig?.icons || {};

        // Create a category for each server
        serverList.forEach(server => {
            const category = server.category || 'Uncategorized';
            if (!categories.has(category)) {
                categories.set(category, {
                    name: category,
                    icon: categoryIcons[category] || 'fa-folder',
                    servers: []
                });
            }
            categories.get(category).servers.push(server);
        });

        // Return categories in the specified order, with any remaining categories alphabetically
        const sortedCategories = [];

        // First add categories in the specified order
        categoryOrder.forEach(categoryName => {
            if (categories.has(categoryName)) {
                sortedCategories.push(categories.get(categoryName));
                categories.delete(categoryName);
            }
        });

        // Then add any remaining categories alphabetically
        Array.from(categories.entries())
            .sort((a, b) => a[0].localeCompare(b[0]))
            .forEach(([_, category]) => {
                sortedCategories.push(category);
            });

        return sortedCategories;
    }, [serverList]);

    return (
        <div className="server-sidebar">
            <div className="sidebar-header">
                <div className="sidebar-header-content">
                    <h3 className="sidebar-title">
                        <i className="fas fa-server icon"></i> <span>Servers</span>
                        <span className="server-count">{serverList.length}</span>
                    </h3>

                    <div className="sidebar-actions">
                        <button
                            onClick={handleRefreshServers}
                            className="btn btn-xs btn-refresh"
                            disabled={!isConnected}
                            data-tooltip="Refresh Server List (R)"
                        >
                            <i className="fas fa-sync-alt"></i>
                        </button>
                        <button
                            onClick={handleConnectAll}
                            className="btn btn-xs btn-connect-all"
                            disabled={!isConnected || configuredServers.length === 0}
                            data-tooltip="Connect All Servers (C)"
                        >
                            <i className="fas fa-plug"></i> <span>Connect All</span>
                        </button>
                    </div>

                    {!isConnected && (
                        <div className="websocket-disconnected">
                            <i className="fas fa-exclamation-circle"></i>
                            <span>WebSocket disconnected</span>
                        </div>
                    )}
                </div>
            </div>

            <div className="server-categories">
                {serverList.length === 0 ? (
                    <div className="server-list-empty">
                        <i className="fas fa-server"></i>
                        <p>No servers configured</p>
                        <p className="text-xs text-gray-400 mt-2">Press <span className="shortcut-hint">R</span> to refresh server list</p>
                    </div>
                ) : (
                    categorizedServers.map(category => (
                        <div key={category.name} className="server-category">
                            <div className="category-header">
                                <i className={`fas ${category.icon}`}></i>
                                <span>{category.name}</span>
                                <span className="server-count">{category.servers.length}</span>
                            </div>
                            <ul className="server-list">
                                {category.servers.map((server) => {
                                    const isActive = server.connectionId === activeServerId;
                                    const canBeActive = server.connectionId && server.status === 'connected';
                                    const statusDetails = getStatusDetails(server.status);

                                    return (
                                        <li key={server.name}
                                            className={`server-item ${isActive ? 'active' : ''} ${canBeActive ? 'can-activate' : ''}`}
                                            onClick={() => canBeActive && setActiveServer(server.connectionId)}
                                            data-tooltip={`${statusDetails.text}: ${server.name}`}
                                        >
                                            <div className="server-item-header">
                                                <span className={`status-indicator ${statusDetails.class}`}></span>
                                                <span className="server-name">{server.name}</span>
                                            </div>

                                            {server.description && (
                                                <div className="server-description">
                                                    {server.description}
                                                </div>
                                            )}

                                            {server.status === 'connecting' && (
                                                <div className="server-description text-amber-600">
                                                    <i className="fas fa-spinner fa-spin"></i> Connecting...
                                                </div>
                                            )}

                                            {server.status === 'error' && (
                                                <div className="server-error">
                                                    <i className="fas fa-exclamation-triangle"></i> Connection error
                                                </div>
                                            )}

                                            <div className="server-actions">
                                                {server.status === 'connected' || server.status === 'connecting' ? (
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); server.connectionId && handleDisconnect(server.connectionId); }}
                                                        className="btn-disconnect"
                                                        disabled={server.status === 'connecting'}
                                                        title={`Disconnect from ${server.name}`}
                                                    >
                                                        <i className="fas fa-times-circle"></i>
                                                        <span>{server.status === 'connecting' ? 'Connecting...' : 'Disconnect'}</span>
                                                    </button>
                                                ) : (
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); handleConnect(server.name); }}
                                                        className="btn-connect"
                                                        disabled={!isConnected}
                                                        title={`Connect to ${server.name}`}
                                                    >
                                                        <i className="fas fa-plug"></i>
                                                        <span>Connect</span>
                                                    </button>
                                                )}
                                            </div>
                                        </li>
                                    );
                                })}
                            </ul>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}

// --- Navigation Component ---
function Navigation() {
    const { activeServerId, activeView, setActiveView, connections } = useStore();
    const activeConnection = connections.find(conn => conn.id === activeServerId);
    const isServerConnected = activeConnection?.status === 'connected';

    // Define base navigation items
    const navItemsConfig = [
        { id: 'Resources' as ActiveView, label: 'Resources', icon: 'fas fa-database', shortcut: '1' },
        { id: 'Tools' as ActiveView, label: 'Tools', icon: 'fas fa-tools', shortcut: '2' },
        { id: 'Prompts' as ActiveView, label: 'Prompts', icon: 'fas fa-comment-dots', shortcut: '3' },
        { id: 'Messages' as ActiveView, label: 'Messages', icon: 'fas fa-envelope', shortcut: '4' },
    ];

    // Determine disabled state based on connection status and capabilities
    const navItems = navItemsConfig.map(item => {
        let disabled = !isServerConnected; // Disabled if server not connected
        if (isServerConnected && activeConnection) {
            if (item.id === 'Tools' && activeConnection.tools === undefined) disabled = true;
            if (item.id === 'Prompts' && activeConnection.prompts === undefined) disabled = true;
            // Resources and Messages are always enabled if connected
        }
        // Keep item always visible, just control disabled state
        return { ...item, disabled };
    });

    // Add keyboard shortcuts for navigation
    useKeyboardShortcuts(
        Object.fromEntries(
            navItems
                .filter(item => !item.disabled)
                .map(item => [
                    item.shortcut,
                    () => setActiveView(item.id)
                ])
        )
    );

    const isLoadingCapabilities = useMemo(() => {
        if (!isServerConnected || !activeConnection) return false;
        return activeConnection.tools === undefined ||
            activeConnection.resources === undefined ||
            activeConnection.prompts === undefined;
    }, [activeConnection, isServerConnected]);

    return (
        <div className={`navigation ${!activeServerId ? 'navigation-disabled' : ''}`}>
            <div className="nav-header">
                <h3 className="sidebar-title">
                    <i className="fas fa-compass"></i> <span>Explore</span>
                </h3>
            </div>
            <ul className="nav-menu">
                {navItems.map((item) => (
                    <li
                        key={item.id}
                        className={`nav-item ${activeView === item.id && !item.disabled ? 'active' : ''} ${item.disabled ? 'disabled' : 'cursor-pointer'}`}
                        onClick={() => !item.disabled && setActiveView(item.id)}
                        data-tooltip={item.disabled ? (activeServerId ? 'Capability not available' : 'Select a connected server') : `View ${item.label}`}
                    >
                        <span className="nav-item-icon"><i className={item.icon}></i></span>
                        <span>{item.label}</span>
                        {!item.disabled && <span className="shortcut-hint">{item.shortcut}</span>}
                    </li>
                ))}
            </ul>

            {isLoadingCapabilities && (
                <div className="nav-warning" title="Loading server capabilities">
                    <i className="fas fa-spinner fa-spin"></i> Loading...
                </div>
            )}

            {!activeServerId && (
                <div className="nav-disabled-message">
                    <i className="fas fa-info-circle"></i> Select a connected server to explore.
                </div>
            )}
        </div>
    );
}

// Improved No Server Selected Placeholder
function NoServerSelectedPlaceholder() {
    return (
        <div className="content-placeholder">
            <i className="fas fa-server placeholder-icon"></i>
            <h2 className="placeholder-title">No Server Selected</h2>
            <p className="placeholder-text">
                Connect to or select a server from the sidebar to begin exploring available resources and tools.
            </p>
            <div className="placeholder-actions mt-6">
                <div className="instruction-step">
                    <div className="step-number">1</div>
                    <div className="step-text">
                        <strong>Connect</strong> to a server using the buttons in the sidebar
                    </div>
                </div>
                <div className="instruction-step">
                    <div className="step-number">2</div>
                    <div className="step-text">
                        <strong>Select</strong> the server to explore its capabilities
                    </div>
                </div>
                <div className="instruction-step">
                    <div className="step-number">3</div>
                    <div className="step-text">
                        <strong>Navigate</strong> between views using the sidebar
                    </div>
                </div>
            </div>
            <div className="shortcut-guide mt-8">
                <h3 className="text-gray-300 text-sm font-semibold mb-2">Keyboard Shortcuts</h3>
                <div className="grid grid-cols-2 gap-4 text-sm text-gray-400">
                    <div className="flex items-center">
                        <span className="shortcut-hint mr-2">R</span> Refresh servers
                    </div>
                    <div className="flex items-center">
                        <span className="shortcut-hint mr-2">C</span> Connect all servers
                    </div>
                    <div className="flex items-center">
                        <span className="shortcut-hint mr-2">1-4</span> Switch views
                    </div>
                </div>
            </div>
        </div>
    );
}

// Update the Loading State Component
function LoadingPlaceholder({ title, message }) {
    return (
        <div className="content-placeholder">
            <div className="loading-spinner"></div>
            <h2 className="placeholder-title">{title}</h2>
            <p className="placeholder-text">{message}</p>
        </div>
    );
}

// --- Main Content Area Component ---
function MainContentArea() {
    const { activeServerId, activeView, connections } = useStore();
    const activeConnection = connections.find(conn => conn.id === activeServerId);

    // Content for resources view with improved UI
    const renderResourcesContent = useCallback(() => {
        if (!activeConnection) return null;

        if (activeConnection.resources === undefined) {
            return <LoadingPlaceholder
                title="Loading Resources"
                message="Fetching available resources from the server..."
            />;
        }

        if (activeConnection.resources.length === 0) {
            return (
                <div className="card-list-empty">
                    <i className="fas fa-box-open"></i>
                    <h3>No Resources Available</h3>
                    <p>This server does not expose any resources. Resources are static data that can be used by LLMs.</p>
                </div>
            );
        }

        return (
            <div className="resource-list">
                {activeConnection.resources.map((resource) => (
                    <div key={resource.uri} className="resource-item">
                        <div className="card-hover-effect"></div>
                        <span className="card-badge card-badge-primary">Resource</span>
                        <div className="resource-item-header">
                            <i className={`fas fa-${resource.mimeType?.includes('text') ? 'file-alt' : 'file-code'}`}></i>
                            <h3 className="resource-name">{resource.name || 'Unnamed Resource'}</h3>
                        </div>
                        <div className="resource-meta">
                            <span className="resource-type">{resource.mimeType || 'unknown type'}</span>
                            <div className="resource-tags">
                                <span className="resource-tag"><i className="fas fa-tag"></i> Static</span>
                                {resource.mimeType?.includes('json') &&
                                    <span className="resource-tag"><i className="fas fa-code"></i> JSON</span>
                                }
                                {resource.mimeType?.includes('text') &&
                                    <span className="resource-tag"><i className="fas fa-align-left"></i> Text</span>
                                }
                            </div>
                            <span className="resource-uri" title={resource.uri}>{resource.uri}</span>
                        </div>
                        <div className="card-actions">
                            <button className="card-action-btn" title="Copy resource URI">
                                <i className="fas fa-copy"></i>
                            </button>
                            <button className="card-action-btn card-action-btn-primary" title="View resource details">
                                <i className="fas fa-eye"></i>
                            </button>
                        </div>
                    </div>
                ))}
            </div>
        );
    }, [activeConnection]);

    // Content for tools view with improved UI
    const renderToolsContent = useCallback(() => {
        if (!activeConnection) return null;

        if (activeConnection.tools === undefined) {
            return <LoadingPlaceholder
                title="Loading Tools"
                message="Fetching available tools from the server..."
            />;
        }

        if (activeConnection.tools.length === 0) {
            return (
                <div className="card-list-empty">
                    <i className="fas fa-toolbox"></i>
                    <h3>No Tools Available</h3>
                    <p>This server does not provide any tools. Tools are functions that can be called by LLMs to perform actions.</p>
                </div>
            );
        }

        return (
            <div className="tools-list">
                {activeConnection.tools.map((tool) => (
                    <div key={tool.name} className="tool-item">
                        <div className="card-hover-effect"></div>
                        <span className="card-badge card-badge-success">Function</span>
                        <div className="tool-item-header">
                            <i className="fas fa-wrench"></i>
                            <h3 className="tool-name">{tool.name}</h3>
                        </div>
                        <p className="tool-description">{tool.description}</p>

                        <div className="tool-details">
                            {tool.parameters && (
                                <span className="tool-tag">
                                    <i className="fas fa-input"></i>
                                    {Object.keys(tool.parameters).length} parameters
                                </span>
                            )}
                        </div>

                        {tool.parameters && Object.keys(tool.parameters).length > 0 && (
                            <div className="prompt-arguments">
                                <div className="prompt-arguments-header">
                                    <i className="fas fa-list-ul"></i> Parameters
                                </div>
                                <ul className="prompt-arguments-list">
                                    {Object.entries(tool.parameters).map(([name, param]) => (
                                        <li key={name} className="prompt-argument-item">
                                            <span className="prompt-argument-name">{name}</span>
                                            <span className="prompt-argument-type">{param.type}</span>
                                            {param.description && <span className="prompt-argument-description">{param.description}</span>}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}

                        <div className="card-actions">
                            <button className="card-action-btn" title="Copy tool name">
                                <i className="fas fa-copy"></i>
                            </button>
                            <button className="card-action-btn card-action-btn-primary" title="Try tool">
                                <i className="fas fa-play"></i>
                            </button>
                        </div>
                    </div>
                ))}
            </div>
        );
    }, [activeConnection]);

    // Content for prompts view with improved UI
    const renderPromptsContent = useCallback(() => {
        if (!activeConnection) return null;

        if (activeConnection.prompts === undefined) {
            return <LoadingPlaceholder
                title="Loading Prompts"
                message="Fetching available prompts from the server..."
            />;
        }

        if (activeConnection.prompts.length === 0) {
            return (
                <div className="card-list-empty">
                    <i className="fas fa-comments"></i>
                    <h3>No Prompts Available</h3>
                    <p>This server does not offer any prompts. Prompts are templates for generating text with LLMs.</p>
                </div>
            );
        }

        return (
            <div className="prompts-grid">
                {activeConnection.prompts.map((prompt) => (
                    <div key={prompt.name} className="prompt-box">
                        <div className="card-hover-effect"></div>
                        <span className="card-badge card-badge-warning">Prompt</span>
                        <div className="prompt-header">
                            <i className="fas fa-comment-alt"></i>
                            <h3 className="prompt-title">{prompt.name}</h3>
                        </div>
                        <p className="prompt-description">{prompt.description}</p>

                        <div className="prompt-meta">
                            {prompt.arguments && (
                                <span className="prompt-meta-item">
                                    <i className="fas fa-list"></i>
                                    {prompt.arguments.length} arguments
                                </span>
                            )}
                            <span className="prompt-meta-item">
                                <i className="fas fa-tag"></i> Template
                            </span>
                        </div>

                        {prompt.arguments && prompt.arguments.length > 0 && (
                            <div className="prompt-arguments">
                                <div className="prompt-arguments-header">
                                    <i className="fas fa-list-ul"></i> Arguments
                                </div>
                                <ul className="prompt-arguments-list">
                                    {prompt.arguments.map((arg, index) => (
                                        <li key={index} className="prompt-argument-item">
                                            <span className="prompt-argument-name">{arg.name}</span>
                                            <span className="prompt-argument-type">{arg.type}</span>
                                            {arg.description && <span className="prompt-argument-description">{arg.description}</span>}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}

                        <div className="card-actions">
                            <button className="card-action-btn" title="Copy prompt name">
                                <i className="fas fa-copy"></i>
                            </button>
                            <button className="card-action-btn card-action-btn-primary" title="Use prompt">
                                <i className="fas fa-play"></i>
                            </button>
                        </div>
                    </div>
                ))}
            </div>
        );
    }, [activeConnection]);

    // Render the appropriate content for the active view
    const renderContent = () => {
        if (!activeServerId) {
            return <NoServerSelectedPlaceholder />;
        }

        if (!activeConnection) {
            return (
                <div className="content-placeholder">
                    <i className="fas fa-question-circle placeholder-icon"></i>
                    <h2 className="placeholder-title">Server Not Found</h2>
                    <p className="placeholder-text">Could not find details for the selected server.</p>
                </div>
            );
        }

        const statusDetails = getStatusDetails(activeConnection.status);

        if (activeConnection.status !== 'connected') {
            const errorContent = activeConnection.status === 'error' && activeConnection.lastError ? (
                <div className="error-details mt-4">
                    <h3 className="text-red-400 font-medium mb-2">Error Details</h3>
                    <pre className="bg-red-900/20 text-red-300 p-3 rounded text-sm overflow-auto max-w-2xl">{activeConnection.lastError}</pre>
                </div>
            ) : null;

            return (
                <div className="content-placeholder">
                    <i className={`${statusDetails.icon} placeholder-icon text-${activeConnection.status === 'error' ? 'red-500' : 'amber-500'}`}></i>
                    <h2 className="placeholder-title">Server {statusDetails.text}</h2>
                    <p className="placeholder-text">The selected server ({activeConnection.name}) is currently {activeConnection.status}.</p>
                    {errorContent}
                </div>
            );
        }

        // Render view content
        switch (activeView) {
            case 'Resources': return renderResourcesContent();
            case 'Tools': return renderToolsContent();
            case 'Prompts': return renderPromptsContent();
            case 'Messages': return renderMessagesContent();
            default:
                // If connected but no view selected, default to Resources if available, else show placeholder
                if (activeConnection.resources !== undefined) {
                    // Use a slight delay to allow store update to propagate if needed
                    setTimeout(() => useStore.getState().setActiveView('Resources'), 0);
                    return <LoadingPlaceholder title="Loading" message="Loading default view..." />;
                } else {
                    return (
                        <div className="content-placeholder">
                            <i className="fas fa-compass placeholder-icon"></i>
                            <h2 className="placeholder-title">Select a View</h2>
                            <p className="placeholder-text">Choose a view from the navigation menu to explore capabilities.</p>
                        </div>
                    );
                }
        }
    };

    const getHeaderDetails = () => {
        if (!activeConnection || activeConnection.status !== 'connected' || !activeView) {
            return { icon: null, title: null, count: null };
        }
        let icon = null, title = activeView, count: number | undefined = undefined;
        switch (activeView) {
            case 'Resources':
                icon = "fas fa-database";
                count = activeConnection.resources?.length;
                break;
            case 'Tools':
                icon = "fas fa-tools";
                count = activeConnection.tools?.length;
                break;
            case 'Prompts':
                icon = "fas fa-comment-dots";
                count = activeConnection.prompts?.length;
                break;
            case 'Messages':
                icon = "fas fa-envelope";
                count = activeConnection.rawWsMessages?.length;
                break;
        }
        return { icon, title, count };
    }
    const headerDetails = getHeaderDetails();

    return (
        <div className="main-area">
            {activeConnection?.status === 'connected' && activeView && (
                <div className="main-area-header">
                    <div className="flex items-center">
                        <h2 className="main-area-title">
                            {headerDetails.icon && <i className={`${headerDetails.icon} text-primary-500 mr-2`}></i>}
                            <span>{headerDetails.title}</span>
                        </h2>
                        <div className="server-badge">
                            <i className="fas fa-server mr-1"></i> {activeConnection.name}
                        </div>
                        {headerDetails.count !== undefined && (
                            <div className="items-count ml-2">
                                {headerDetails.count}
                            </div>
                        )}
                    </div>
                    {activeView === 'Resources' && activeConnection.resources?.length > 0 && (
                        <div className="view-actions">
                            <div className="search-box">
                                <i className="fas fa-search search-icon"></i>
                                <input
                                    type="text"
                                    placeholder="Search resources..."
                                    className="search-input"
                                />
                            </div>
                        </div>
                    )}
                </div>
            )}
            <div className="main-area-content scrollbar-thin">
                {renderContent()}
            </div>
        </div>
    );
}

// --- App Component (Root) ---
function App() {
    const { isConnected } = useWebSocket();
    const { connections } = useStore();
    const [isDarkMode, setIsDarkMode] = useState(() => {
        const savedTheme = localStorage.getItem('theme');
        if (savedTheme) return savedTheme === 'dark';
        return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    });

    // Add keyboard shortcut for theme toggle
    useKeyboardShortcuts({
        'd': () => setIsDarkMode(!isDarkMode),
    });

    useEffect(() => {
        document.documentElement.classList.toggle('dark-mode', isDarkMode);
        document.documentElement.classList.toggle('light-mode', !isDarkMode);
        localStorage.setItem('theme', isDarkMode ? 'dark' : 'light');
    }, [isDarkMode]);

    const connectedCount = connections.filter(conn => conn.status === 'connected').length;
    const totalServers = useStore(state => state.configuredServers.length);

    const toggleDarkMode = () => setIsDarkMode(!isDarkMode);

    return (
        // Apply dark/light class for potential CSS overrides beyond Tailwind
        <div className={`app-container ${isDarkMode ? 'dark' : 'light'}`}>
            <header className="app-header">
                <div className="app-title">
                    <i className="fas fa-flask text-primary-500"></i>
                    <span>MCP Exploration Lab</span>
                </div>

                <div className="top-status-bar">
                    <div className="theme-toggle">
                        <button onClick={toggleDarkMode} className="theme-button" data-tooltip={`Switch to ${isDarkMode ? 'Light' : 'Dark'} Mode (D)`}>
                            <i className={`fas ${isDarkMode ? 'fa-sun' : 'fa-moon'}`}></i>
                        </button>
                    </div>
                    <div className={`top-status-item ${isConnected ? 'top-status-connected' : 'top-status-disconnected'}`} title={`WebSocket connection is ${isConnected ? 'active' : 'inactive'}`}>
                        <i className={`fas ${isConnected ? 'fa-check-circle text-green-500' : 'fa-times-circle text-red-500'}`}></i>
                        <span>{isConnected ? 'Connected' : 'Disconnected'}</span>
                    </div>
                    <div className="top-status-item" title={`${connectedCount} out of ${totalServers} servers are connected`}>
                        <i className="fas fa-server"></i>
                        <span>Servers: <strong>{connectedCount}</strong>/{totalServers}</span>
                    </div>
                </div>
            </header>

            <main className="main-content">
                <div className="panel-container">
                    <ServerSelector />
                    <Navigation />
                    <MainContentArea />
                </div>
            </main>

            <footer className="app-footer">
                <div className="footer-content">
                    <div className="footer-info">
                        <i className="fas fa-code"></i> MCP Exploration Lab
                    </div>
                    <div className="footer-copyright">
                        © {new Date().getFullYear()} <i className="fas fa-heart text-red-500 mx-1"></i> Made with MCP
                    </div>
                </div>
            </footer>
        </div>
    );
}

export default App; 