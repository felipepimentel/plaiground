import React, { useEffect, useMemo, useRef, useState } from 'react';
// Use shared types
import {
    PromptState,
    ResourceState,
    ServerConnection,
    SimpleParameterSchema,
    SimplePromptDefinition,
    SimpleResource,
    SimpleToolDefinition,
    ToolState
} from '@mcp-lab/shared';
import { useWebSocket } from './hooks/useWebSocket';
import { useStore } from './store';

// --- Updated TopBar --- 

function TopBar() {
    const { sendMessage } = useWebSocket();
    const { configuredServers } = useStore(); // Get configured servers from store
    const [selectedServerId, setSelectedServerId] = useState<string>('');

    // Update selected server when the list changes (e.g., on initial load)
    useEffect(() => {
        if (configuredServers.length > 0 && !selectedServerId) {
            setSelectedServerId(configuredServers[0].id);
        }
        // If the currently selected ID is no longer valid, reset
        if (selectedServerId && !configuredServers.some(s => s.id === selectedServerId)) {
            setSelectedServerId(configuredServers.length > 0 ? configuredServers[0].id : '');
        }
    }, [configuredServers, selectedServerId]);

    const handleConnect = () => {
        if (!selectedServerId) {
            alert('Please select a server to connect.');
            return;
        }
        console.log(`[Frontend] Sending connectConfigured for serverId: ${selectedServerId}`);
        sendMessage({ type: 'connectConfigured', payload: { serverId: selectedServerId } });
    };

    return (
        <div style={styles.topBar}>
            <h1>MCP Exploration Lab</h1>
            <div style={styles.connectForm}>
                <select
                    value={selectedServerId}
                    onChange={(e) => setSelectedServerId(e.target.value)}
                    style={{ ...styles.input, minWidth: '250px' }} // Style the dropdown
                    disabled={configuredServers.length === 0}
                >
                    {configuredServers.length === 0 && <option value="">Loading servers...</option>}
                    {configuredServers.map(server => (
                        <option key={server.id} value={server.id} title={server.description}>
                            {server.name}
                        </option>
                    ))}
                </select>
                <button
                    onClick={handleConnect}
                    style={styles.button}
                    disabled={!selectedServerId}
                >
                    Connect Server
                </button>
            </div>
        </div>
    );
}

function ServerSelector() {
    const { connections, activeServerId, setActiveServer } = useStore();
    const { sendMessage } = useWebSocket();

    const handleDisconnect = (id: string, e: React.MouseEvent) => {
        e.stopPropagation(); // Prevent row click
        sendMessage({ type: 'disconnect', payload: { connectionId: id } });
    };

    return (
        <div style={styles.serverSelector}>
            <h3>Servers</h3>
            <ul style={styles.serverList}>
                {connections.map((conn) => (
                    <li
                        key={conn.id}
                        onClick={() => setActiveServer(conn.id)}
                        style={{
                            ...styles.serverListItem,
                            fontWeight: activeServerId === conn.id ? 'bold' : 'normal'
                        }}
                    >
                        <span>{conn.name} ({conn.status})</span>
                        {conn.status !== 'disconnected' && conn.status !== 'error' && (
                            <button
                                onClick={(e) => handleDisconnect(conn.id, e)}
                                style={styles.disconnectButton}
                            >
                                X
                            </button>
                        )}
                    </li>
                ))}
                {connections.length === 0 && <p style={{ color: '#666' }}>No active connections.</p>}
            </ul>
        </div>
    );
}

function Navigation() {
    const { activeServerId, setActiveView, activeView } = useStore();
    const isDisabled = !activeServerId || useStore.getState().connections.find(c => c.id === activeServerId)?.status !== 'connected';

    const views: Array<'Resources' | 'Tools' | 'Prompts' | 'Messages'> = ['Resources', 'Tools', 'Prompts', 'Messages'];

    return (
        <div style={styles.navigation}>
            <h4>Explore</h4>
            <ul style={styles.navList}>
                {views.map((view) => (
                    <li
                        key={view}
                        onClick={() => !isDisabled && setActiveView(view)}
                        style={{
                            ...styles.navListItem,
                            cursor: isDisabled ? 'not-allowed' : 'pointer',
                            color: isDisabled ? '#aaa' : (activeView === view ? '#007bff' : '#333'),
                            fontWeight: activeView === view ? 'bold' : 'normal'
                        }}
                    >
                        {view}
                    </li>
                ))}
            </ul>
        </div>
    );
}

// --- Viewer Components --- (Basic Placeholders)

function ResourceViewer({ connectionId, resources, viewedContent }: {
    connectionId: string;
    resources: ResourceState | undefined;
    viewedContent: ServerConnection['viewedResourceContent'] | undefined;
}) {
    const { sendMessage } = useWebSocket();
    const [selectedUri, setSelectedUri] = useState<string | null>(null);

    const handleResourceClick = (uri: string) => {
        setSelectedUri(uri);
        sendMessage({
            type: 'readResource',
            payload: { connectionId, uri }
        });
    };

    if (!resources) return <p>Loading resources or not available...</p>;
    if (resources.length === 0) return <p>No resources exposed by this server.</p>;

    return (
        <div style={{ display: 'flex', gap: '20px', height: '100%' }}>
            <div style={{ width: '40%', borderRight: '1px solid #ccc', paddingRight: '10px', overflowY: 'auto' }}>
                <h4>Resources</h4>
                <ul style={{ listStyle: 'none', padding: 0 }}>
                    {resources.map((res: SimpleResource) => (
                        <li
                            key={res.uri}
                            onClick={() => handleResourceClick(res.uri)}
                            style={{
                                padding: '5px',
                                cursor: 'pointer',
                                backgroundColor: selectedUri === res.uri ? '#e0e0e0' : 'transparent'
                            }}
                        >
                            {res.uri}
                            {res.description && <span style={{ color: '#666', fontSize: '0.9em' }}> - {res.description}</span>}
                        </li>
                    ))}
                </ul>
            </div>
            <div style={{ width: '60%', overflowY: 'auto' }}>
                <h4>Content{selectedUri ? `: ${selectedUri}` : ''}</h4>
                {selectedUri && viewedContent?.uri === selectedUri ? (
                    viewedContent.error ? (
                        <pre style={{ color: 'red' }}>Error: {viewedContent.error}</pre>
                    ) : viewedContent.content ? (
                        <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all', backgroundColor: '#f9f9f9', padding: '10px', border: '1px solid #eee' }}>
                            {/* Basic rendering - assumes text content for now */}
                            {/* TODO: Handle different mime-types (images, JSON etc.) */}
                            {JSON.stringify(viewedContent.content, null, 2)}
                        </pre>
                    ) : (
                        <p>Loading content...</p>
                    )
                ) : (
                    <p>Select a resource from the list to view its content.</p>
                )}
            </div>
        </div>
    );
}

function ToolViewer({ connectionId, tools, lastResult }: {
    connectionId: string;
    tools: ToolState | undefined;
    lastResult: ServerConnection['lastToolResult'] | undefined;
}) {
    const { sendMessage } = useWebSocket();
    const [selectedTool, setSelectedTool] = useState<SimpleToolDefinition | null>(null);
    const [toolArgs, setToolArgs] = useState<{ [key: string]: any }>({});

    const handleToolSelect = (tool: SimpleToolDefinition) => {
        setSelectedTool(tool);
        setToolArgs({}); // Reset args when changing tool
    };

    const handleArgChange = (paramName: string, value: string) => {
        // Very basic handling - assumes string inputs, no validation yet
        setToolArgs(prev => ({ ...prev, [paramName]: value }));
    };

    const handleCallTool = () => {
        if (!selectedTool) return;
        sendMessage({
            type: 'callTool',
            payload: {
                connectionId,
                toolName: selectedTool.name,
                args: toolArgs // Send the collected arguments
            }
        });
    };

    if (!tools) return <p>Loading tools or not available...</p>;
    if (tools.length === 0) return <p>No tools exposed by this server.</p>;

    return (
        <div style={{ display: 'flex', gap: '20px', height: '100%' }}>
            {/* Tool List */}
            <div style={{ width: '40%', borderRight: '1px solid #ccc', paddingRight: '10px', overflowY: 'auto' }}>
                <h4>Tools</h4>
                <ul style={{ listStyle: 'none', padding: 0 }}>
                    {tools.map((tool: SimpleToolDefinition) => (
                        <li
                            key={tool.name}
                            onClick={() => handleToolSelect(tool)}
                            style={{
                                padding: '5px',
                                cursor: 'pointer',
                                backgroundColor: selectedTool?.name === tool.name ? '#e0e0e0' : 'transparent'
                            }}
                        >
                            {tool.name}
                            {tool.description && <span style={{ color: '#666', fontSize: '0.9em' }}> - {tool.description}</span>}
                        </li>
                    ))}
                </ul>
            </div>

            {/* Tool Detail & Execution */}
            <div style={{ width: '60%', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
                <h4>Details & Execution{selectedTool ? `: ${selectedTool.name}` : ''}</h4>
                {!selectedTool ? (
                    <p>Select a tool from the list.</p>
                ) : (
                    <div style={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
                        <p><strong>Description:</strong> {selectedTool.description || 'N/A'}</p>

                        {/* Basic Argument Form - Needs improvement for complex schemas */}
                        <h5>Arguments:</h5>
                        {selectedTool.parameters?.properties && Object.keys(selectedTool.parameters.properties).length > 0 ? (
                            <div style={{ marginBottom: '15px' }}>
                                {Object.entries(selectedTool.parameters.properties).map(([name, schema]: [string, SimpleParameterSchema]) => (
                                    <div key={name} style={{ marginBottom: '10px' }}>
                                        <label style={{ display: 'block', marginBottom: '3px' }}>
                                            {name}
                                            {selectedTool?.parameters?.required?.includes(name) ? '*' : ''}
                                            {schema.description && <span style={{ fontSize: '0.8em', color: '#555' }}> ({schema.description})</span>}
                                            {schema.type && <em style={{ fontSize: '0.8em', color: '#777' }}> [{schema.type}]</em>}
                                        </label>
                                        {/* Simplistic input - assumes string/text */}
                                        <input
                                            type="text"
                                            value={toolArgs[name] || ''}
                                            onChange={(e) => handleArgChange(name, e.target.value)}
                                            style={{ ...styles.input, width: '90%' }}
                                            placeholder={schema.type || 'string'}
                                        />
                                    </div>
                                ))}
                                <button onClick={handleCallTool} style={styles.button}>Call Tool</button>
                            </div>
                        ) : (
                            <>
                                <p>This tool does not require arguments.</p>
                                <button onClick={handleCallTool} style={styles.button}>Call Tool</button>
                            </>
                        )}

                        {/* Result Display */}
                        {lastResult && lastResult.toolName === selectedTool.name && (
                            <div style={{ marginTop: '15px', borderTop: '1px solid #eee', paddingTop: '10px' }}>
                                <h5>Last Result:</h5>
                                {lastResult.error ? (
                                    <pre style={{ color: 'red' }}>Error: {lastResult.error}</pre>
                                ) : (
                                    <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all', backgroundColor: '#f9f9f9', padding: '10px', border: '1px solid #eee' }}>
                                        {/* TODO: Better rendering based on result content type */}
                                        {JSON.stringify(lastResult.result, null, 2)}
                                    </pre>
                                )}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

function PromptViewer({ connectionId, prompts, viewedMessagesInfo }: {
    connectionId: string;
    prompts: PromptState | undefined;
    viewedMessagesInfo: ServerConnection['viewedPromptMessages'] | undefined;
}) {
    const { sendMessage } = useWebSocket();
    const [selectedPrompt, setSelectedPrompt] = useState<SimplePromptDefinition | null>(null);
    const [promptArgs, setPromptArgs] = useState<{ [key: string]: any }>({});
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    useEffect(() => {
        // Reset error message when component remounts or prompts change
        setErrorMessage(null);
    }, [connectionId, prompts]);

    // Check for the specific "Method not found" error
    useEffect(() => {
        if (prompts === undefined) {
            const connections = useStore.getState().connections;
            const connection = connections.find(c => c.id === connectionId);

            // Check if we received a method not found error for this connection
            if (connection && !connection.prompts) {
                const logs = useStore.getState().logs;
                const hasMethodNotFoundError = logs.some(log =>
                    log.includes(`[MCP ${connectionId} Error`) &&
                    log.includes('Method not found')
                );

                if (hasMethodNotFoundError) {
                    setErrorMessage('This server does not support prompts.');
                }
            }
        }
    }, [connectionId, prompts]);

    const handlePromptSelect = (prompt: SimplePromptDefinition) => {
        setSelectedPrompt(prompt);
        setPromptArgs({}); // Reset args when changing prompt
    };

    const handleArgChange = (paramName: string, value: string) => {
        setPromptArgs(prev => ({ ...prev, [paramName]: value }));
    };

    const handleGetPrompt = () => {
        if (!selectedPrompt) return;
        sendMessage({
            type: 'getPrompt',
            payload: {
                connectionId,
                promptName: selectedPrompt.name,
                args: promptArgs // Send the collected arguments
            }
        });
    };

    // Display error if prompts API is not supported
    if (errorMessage) {
        return <p>{errorMessage}</p>;
    }

    if (!prompts) return <p>Loading prompts or not available...</p>;
    if (prompts.length === 0) return <p>No prompts exposed by this server.</p>;

    // Use SimplePromptDefinition
    const getArguments = (promptDef: SimplePromptDefinition | null) => {
        if (!promptDef || !promptDef.argumentsSchema) return {};
        return promptDef.argumentsSchema.properties || {};
    };
    const argumentProperties = getArguments(selectedPrompt);

    return (
        <div style={{ display: 'flex', gap: '20px', height: '100%' }}>
            {/* Prompt List */}
            <div style={{ width: '40%', borderRight: '1px solid #ccc', paddingRight: '10px', overflowY: 'auto' }}>
                <h4>Prompts</h4>
                <ul style={{ listStyle: 'none', padding: 0 }}>
                    {prompts.map((prompt: SimplePromptDefinition) => (
                        <li
                            key={prompt.name}
                            onClick={() => handlePromptSelect(prompt)}
                            style={{
                                padding: '5px',
                                cursor: 'pointer',
                                backgroundColor: selectedPrompt?.name === prompt.name ? '#e0e0e0' : 'transparent'
                            }}
                        >
                            {prompt.name}
                            {prompt.description && <span style={{ color: '#666', fontSize: '0.9em' }}> - {prompt.description}</span>}
                        </li>
                    ))}
                </ul>
            </div>

            {/* Prompt Detail & Execution */}
            <div style={{ width: '60%', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
                <h4>Details & Messages{selectedPrompt ? `: ${selectedPrompt.name}` : ''}</h4>
                {!selectedPrompt ? (
                    <p>Select a prompt from the list.</p>
                ) : (
                    <div style={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
                        <p><strong>Description:</strong> {selectedPrompt.description || 'N/A'}</p>

                        <h5>Arguments:</h5>
                        {/* Use argumentProperties derived from SimplePromptDefinition */}
                        {Object.keys(argumentProperties).length > 0 ? (
                            <div style={{ marginBottom: '15px' }}>
                                {/* Use SimpleParameterSchema */}
                                {Object.entries(argumentProperties).map(([name, schema]: [string, SimpleParameterSchema]) => (
                                    <div key={name} style={{ marginBottom: '10px' }}>
                                        <label style={{ display: 'block', marginBottom: '3px' }}>
                                            {name}
                                            {selectedPrompt?.argumentsSchema?.required?.includes(name) ? '*' : ''}
                                            {/* Access properties safely */}
                                            {schema.description && <span style={{ fontSize: '0.8em', color: '#555' }}> ({schema.description})</span>}
                                            {schema.type && <em style={{ fontSize: '0.8em', color: '#777' }}> [{schema.type}]</em>}
                                        </label>
                                        <input
                                            type="text"
                                            value={promptArgs[name] || ''}
                                            onChange={(e) => handleArgChange(name, e.target.value)}
                                            style={{ ...styles.input, width: '90%' }}
                                            placeholder={schema.type || 'string'}
                                        />
                                    </div>
                                ))}
                                <button onClick={handleGetPrompt} style={styles.button}>Get Prompt Messages</button>
                            </div>
                        ) : (
                            <>
                                <p>This prompt does not require arguments.</p>
                                <button onClick={handleGetPrompt} style={styles.button}>Get Prompt Messages</button>
                            </>
                        )}

                        {/* Result Display */}
                        {viewedMessagesInfo && viewedMessagesInfo.promptName === selectedPrompt.name && (
                            <div style={{ marginTop: '15px', borderTop: '1px solid #eee', paddingTop: '10px', flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
                                <h5>Generated Messages:</h5>
                                {viewedMessagesInfo.error ? (
                                    <pre style={{ color: 'red' }}>Error: {viewedMessagesInfo.error}</pre>
                                ) : (
                                    <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all', backgroundColor: '#f9f9f9', padding: '10px', border: '1px solid #eee', flexGrow: 1, overflowY: 'auto' }}>
                                        {JSON.stringify(viewedMessagesInfo.messages, null, 2)}
                                    </pre>
                                )}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

// MessageViewer - uses shared ServerConnection type indirectly via props
function MessageViewer({ messages }: {
    messages: ServerConnection['rawWsMessages'] | undefined
}) {
    const messageContainerRef = useRef<HTMLDivElement>(null);

    // Auto-scroll to bottom
    useEffect(() => {
        if (messageContainerRef.current) {
            messageContainerRef.current.scrollTop = messageContainerRef.current.scrollHeight;
        }
    }, [messages]);

    const formatTimestamp = (timestamp: number) => {
        return new Date(timestamp).toLocaleTimeString([], { hour12: false });
    };

    const formatJson = (data: string) => {
        try {
            return JSON.stringify(JSON.parse(data), null, 2);
        } catch {
            return data; // Return raw data if not valid JSON
        }
    };

    return (
        <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <h4>Raw WebSocket Messages</h4>
            <div ref={messageContainerRef} style={styles.logArea}>
                {(!messages || messages.length === 0) && <p style={{ color: '#aaa' }}>No messages recorded for this connection yet.</p>}
                {messages?.map((msg: { direction: 'send' | 'recv'; timestamp: number; data: string }, index: number) => (
                    <div key={index} style={{ marginBottom: '10px', borderBottom: '1px dashed #555', paddingBottom: '5px' }}>
                        <strong style={{ color: msg.direction === 'send' ? '#8f8' : '#f88' }}>
                            [{formatTimestamp(msg.timestamp)}] {msg.direction === 'send' ? 'SEND ->' : '<-'} RECV:
                        </strong>
                        <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all', margin: '5px 0 0 0' }}>
                            {formatJson(msg.data)}
                        </pre>
                    </div>
                ))}
            </div>
        </div>
    );
}

// --- Main Content Area --- 

function MainContentArea() {
    const { activeServerId, activeView } = useStore();
    const { sendMessage, isConnected } = useWebSocket();
    const connections = useStore((state) => state.connections);

    // Memoize the active connection to prevent unnecessary re-renders
    const activeConnection = useMemo(() =>
        connections.find(c => c.id === activeServerId),
        [connections, activeServerId]
    );

    // Track unsupported methods
    const [unsupportedMethods, setUnsupportedMethods] = useState<Set<string>>(new Set());

    // Reset unsupported methods when active server changes
    useEffect(() => {
        setUnsupportedMethods(new Set());
    }, [activeServerId]);

    // Monitor for method not found errors
    useEffect(() => {
        const logs = useStore.getState().logs;

        // Check recent logs for method not found errors
        if (activeConnection) {
            const methodNotFoundErrors = logs
                .filter(log => log.includes(`[MCP ${activeConnection.id} Error`) && log.includes('Method not found'))
                .map(log => {
                    // Extract operation name from log entry
                    const match = log.match(/\boperation: "([^"]+)"/);
                    const operation = match ? match[1] :
                        log.match(/\(([^)]+)\)/) ? log.match(/\(([^)]+)\)/)[1] : null;
                    return operation;
                })
                .filter(Boolean) as string[];

            if (methodNotFoundErrors.length > 0) {
                setUnsupportedMethods(prev => {
                    const updated = new Set(prev);
                    methodNotFoundErrors.forEach(method => updated.add(method));
                    return updated;
                });
            }
        }
    }, [activeConnection, useStore.getState().logs]);

    // Fetch data when active server or view changes
    useEffect(() => {
        // Skip effect if no connection or not connected or WebSocket not connected
        if (!activeConnection || activeConnection.status !== 'connected' || !activeView || !isConnected) {
            return;
        }

        const connectionId = activeConnection.id;

        // Track if we need to fetch data
        let shouldFetch = false;
        const methodName = `list${activeView}`; // e.g. listResources, listTools, listPrompts

        // Don't attempt to fetch if method is known to be unsupported
        if (unsupportedMethods.has(methodName)) {
            console.log(`Skipping ${methodName} as it's known to be unsupported`);
            return;
        }

        switch (activeView) {
            case 'Resources':
                // Fetch only if not already fetched
                if (activeConnection.resources === undefined) {
                    shouldFetch = true;
                    sendMessage({ type: 'listResources', payload: { connectionId } });
                }
                break;
            case 'Tools':
                if (activeConnection.tools === undefined) {
                    shouldFetch = true;
                    sendMessage({ type: 'listTools', payload: { connectionId } });
                }
                break;
            case 'Prompts':
                if (activeConnection.prompts === undefined) {
                    shouldFetch = true;
                    sendMessage({ type: 'listPrompts', payload: { connectionId } });
                }
                break;
            // Messages view doesn't require initial fetch
        }

        // Log fetch action if we're fetching
        if (shouldFetch) {
            console.log(`Fetching ${activeView} for ${connectionId}`);
        }
    }, [activeServerId, activeView, sendMessage, isConnected, unsupportedMethods]); // Include isConnected but not activeConnection

    const renderView = () => {
        if (!activeConnection || activeConnection.status !== 'connected') {
            return <p>Select a connected server to explore.</p>;
        }

        // Check if current view method is unsupported
        const methodName = `list${activeView}`; // e.g. listResources, listTools, listPrompts
        if (unsupportedMethods.has(methodName)) {
            return <p>This server does not support {activeView.toLowerCase()}.</p>;
        }

        switch (activeView) {
            case 'Resources':
                return <ResourceViewer
                    connectionId={activeConnection.id}
                    resources={activeConnection.resources}
                    viewedContent={activeConnection.viewedResourceContent}
                />;
            case 'Tools':
                return <ToolViewer
                    connectionId={activeConnection.id}
                    tools={activeConnection.tools}
                    lastResult={activeConnection.lastToolResult}
                />;
            case 'Prompts':
                return <PromptViewer
                    connectionId={activeConnection.id}
                    prompts={activeConnection.prompts}
                    viewedMessagesInfo={activeConnection.viewedPromptMessages}
                />;
            case 'Messages':
                return <MessageViewer messages={activeConnection.rawWsMessages} />;
            default:
                return <p>Select an item from the 'Explore' menu.</p>;
        }
    };

    return (
        <div style={styles.mainContentArea}>
            {/* Maybe keep header separate? */}
            {activeConnection ?
                <h2 style={{ marginTop: 0 }}>Exploring: {activeConnection.name} ({activeConnection.status})</h2> :
                <h2 style={{ marginTop: 0 }}>No Server Selected</h2>
            }
            {!isConnected && activeConnection ?
                <p style={{ color: 'red' }}>⚠️ WebSocket disconnected. Reconnecting...</p> : null}
            {renderView()}
        </div>
    );
}

function StatusMonitor() {
    const logs = useStore((state) => state.logs);
    const logContainerRef = useRef<HTMLPreElement>(null);

    // Auto-scroll to bottom
    useEffect(() => {
        if (logContainerRef.current) {
            logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
        }
    }, [logs]);

    return (
        <div style={styles.statusMonitor}>
            <h4>Logs & Status</h4>
            <pre ref={logContainerRef} style={styles.logArea}>
                {logs.join('\n')}
            </pre>
        </div>
    );
}

// --- App Layout --- 

function App() {
    // Initialize WebSocket connection by calling the hook
    useWebSocket();

    return (
        <div style={styles.appContainer}>
            <TopBar />
            <div style={styles.mainArea}>
                <ServerSelector />
                <Navigation />
                <MainContentArea />
            </div>
            <StatusMonitor />
        </div>
    );
}

// --- Basic Styling --- (Consider moving to CSS file later)
const styles: { [key: string]: React.CSSProperties } = {
    appContainer: {
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        fontFamily: 'sans-serif'
    },
    topBar: {
        borderBottom: '1px solid #ccc',
        padding: '10px 20px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        backgroundColor: '#f8f8f8'
    },
    connectForm: {
        display: 'flex',
        gap: '10px'
    },
    input: {
        padding: '5px 8px',
        border: '1px solid #ccc',
        borderRadius: '3px'
    },
    button: {
        padding: '5px 15px',
        cursor: 'pointer'
    },
    mainArea: {
        display: 'flex',
        flexGrow: 1,
        overflow: 'hidden' // Prevent layout issues with fixed height/scroll
    },
    serverSelector: {
        borderRight: '1px solid #ccc',
        padding: '10px',
        width: '250px', // Slightly wider
        flexShrink: 0,
        overflowY: 'auto'
    },
    serverList: {
        listStyle: 'none',
        padding: 0,
        margin: 0
    },
    serverListItem: {
        padding: '8px 5px',
        cursor: 'pointer',
        borderBottom: '1px dashed #eee',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
    },
    disconnectButton: {
        padding: '2px 5px',
        fontSize: '10px',
        cursor: 'pointer',
        backgroundColor: '#fdd',
        border: '1px solid #f99',
        borderRadius: '3px'
    },
    navigation: {
        borderRight: '1px solid #ccc',
        padding: '10px',
        width: '150px',
        flexShrink: 0
    },
    navList: {
        listStyle: 'none',
        padding: 0,
        margin: 0
    },
    navListItem: {
        padding: '5px 0',
        cursor: 'pointer'
    },
    mainContentArea: {
        flexGrow: 1,
        padding: '20px',
        overflowY: 'auto'
    },
    statusMonitor: {
        borderTop: '1px solid #ccc',
        padding: '10px 20px',
        height: '200px', // More space for logs
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column'
    },
    logArea: {
        flexGrow: 1,
        overflowY: 'scroll',
        backgroundColor: '#f4f4f4',
        border: '1px solid #eee',
        padding: '10px',
        fontSize: '12px',
        whiteSpace: 'pre-wrap', // Wrap long lines
        wordBreak: 'break-all' // Break long words/lines
    }
};

export default App; 