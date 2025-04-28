import { useCallback, useEffect, useRef } from 'react';
import { useStore } from '../store';

const WS_URL = 'ws://localhost:8080';

export function useWebSocket() {
    const ws = useRef<WebSocket | null>(null);
    const {
        addConnection,
        updateConnection,
        removeConnection,
        addLog,
        setResources,
        setTools,
        setPrompts,
        setViewedResourceContent,
        setLastToolResult,
        setPromptMessages,
        addRawWsMessage
    } = useStore();

    const connectWebSocket = useCallback(() => {
        if (ws.current && ws.current.readyState === WebSocket.OPEN) {
            console.log('WebSocket already connected.');
            return;
        }

        ws.current = new WebSocket(WS_URL);

        ws.current.onopen = () => {
            console.log('WebSocket Connected to Backend');
            addLog('[WS] Connected to backend.');
        };

        ws.current.onclose = () => {
            console.log('WebSocket Disconnected from Backend');
            addLog('[WS] Disconnected from backend. Attempting to reconnect...');
            ws.current = null;
            // Simple reconnect logic
            setTimeout(connectWebSocket, 5000);
        };

        ws.current.onerror = (error) => {
            console.error('WebSocket Error:', error);
            addLog(`[WS] Error: ${error.type}`);
        };

        ws.current.onmessage = (event) => {
            const rawData = event.data; // Capture raw data early
            // console.log('[WS RECV RAW Hook]:', rawData); // Can log here too if needed
            try {
                const message = JSON.parse(rawData);
                // console.log('Message from backend:', message);
                const { type, payload } = message;

                // --- Handle Raw Log Message FIRST --- 
                if (type === 'rawLog') {
                    // Try to associate with a connection based on known IDs in payload
                    let associatedConnectionId = payload?.connectionId ||
                        payload?.data?.id; // Check common places for ID

                    // If we still can't find it, maybe parse the raw data string?
                    if (!associatedConnectionId && typeof payload.data === 'string') {
                        try {
                            const parsedRawData = JSON.parse(payload.data);
                            associatedConnectionId = parsedRawData?.params?.connectionId || // For requests
                                parsedRawData?.result?.connectionId || // For results
                                parsedRawData?.payload?.connectionId;
                        } catch { /* ignore parse error */ }
                    }

                    // If associated, add to connection state, otherwise log generally
                    if (associatedConnectionId) {
                        addRawWsMessage(associatedConnectionId, payload.direction, payload.data);
                    } else {
                        addLog(`[${payload.direction === 'send' ? 'WS SEND' : 'WS RECV'}] ${payload.data}`);
                    }
                    return; // Don't process rawLog further
                }

                // --- Handle Other Message Types --- 
                switch (type) {
                    case 'connectionStatus':
                        const { id, name, status, serverInfo, capabilities, error, reason } = payload;
                        const existing = useStore.getState().connections.find(c => c.id === id);

                        if (!existing) {
                            addConnection({ id, name, status }); // Add if truly new
                        }
                        // Use generic update for status, serverInfo, capabilities
                        updateConnection(id, {
                            status,
                            ...(serverInfo && { serverInfo }),
                            ...(capabilities && { capabilities }),
                        });

                        if (status === 'disconnected') {
                            addLog(`[MCP ${id}] Disconnected. ${reason ? `Reason: ${reason}` : ''}`);
                            // Remove connection explicitly on disconnect confirmation
                            removeConnection(id);
                        } else if (status === 'error') {
                            addLog(`[MCP ${id}] Connection Error: ${error}`);
                        } else if (status === 'connected') {
                            addLog(`[MCP ${id}] Connected to ${serverInfo?.name} v${serverInfo?.version}.`);
                        }
                        break;
                    case 'mcpLog':
                        addLog(`[MCP ${payload.connectionId} Log - ${payload.level}]: ${payload.message}`);
                        break;
                    case 'mcpError': // Covers protocol errors and operation errors
                        addLog(`[MCP ${payload.connectionId} Error${payload.operation ? ` (${payload.operation})` : ''}]: ${JSON.stringify(payload.error)}`);
                        // Update connection status to 'error' if it's a connection-level issue
                        if (!payload.operation) {
                            updateConnection(payload.connectionId, { status: 'error' });
                        }
                        break;
                    case 'error': // General backend errors
                        addLog(`[Backend Error]: ${payload.message}`);
                        break;

                    // --- Handle List Responses ---
                    case 'resourcesList':
                        setResources(payload.connectionId, payload.data.resources);
                        addLog(`[MCP ${payload.connectionId}] Received ${payload.data.resources.length} resources.`);
                        break;
                    case 'toolsList':
                        setTools(payload.connectionId, payload.data.tools);
                        addLog(`[MCP ${payload.connectionId}] Received ${payload.data.tools.length} tools.`);
                        break;
                    case 'promptsList':
                        setPrompts(payload.connectionId, payload.data.prompts);
                        addLog(`[MCP ${payload.connectionId}] Received ${payload.data.prompts.length} prompts.`);
                        break;

                    // --- Handle Detail Responses ---
                    case 'resourceContent':
                        setViewedResourceContent(
                            payload.connectionId,
                            payload.uri,
                            payload.content,
                            payload.error
                        );
                        addLog(`[MCP ${payload.connectionId}] Received content for resource: ${payload.uri}${payload.error ? ' (Error)' : ''}`);
                        break;
                    case 'toolResult':
                        setLastToolResult(
                            payload.connectionId,
                            payload.toolName,
                            payload.result,
                            payload.error
                        );
                        addLog(`[MCP ${payload.connectionId}] Received result for tool: ${payload.toolName}${payload.error ? ' (Error)' : ''}`);
                        break;
                    case 'promptMessages':
                        setPromptMessages(
                            payload.connectionId,
                            payload.promptName,
                            payload.messages,
                            payload.error
                        );
                        addLog(`[MCP ${payload.connectionId}] Received messages for prompt: ${payload.promptName}${payload.error ? ' (Error)' : ''}`);
                        break;

                    default:
                        console.warn('Unknown message type from backend:', type);
                        addLog(`[WS RECV Unknown]: ${JSON.stringify(payload)}`); // Log unknown
                }
            } catch (error) {
                console.error('Failed to parse or handle message from backend:', error);
                addLog(`[WS RECV Malformed]: ${rawData}`); // Log raw malformed data
            }
        };
    }, [
        addConnection, updateConnection, removeConnection, addLog,
        setResources, setTools, setPrompts,
        setViewedResourceContent, setLastToolResult, setPromptMessages,
        addRawWsMessage
    ]);

    useEffect(() => {
        connectWebSocket();
        // Cleanup function
        return () => {
            ws.current?.close();
        };
    }, [connectWebSocket]);

    const sendMessage = useCallback((message: any) => { // Use any type to access payload easily
        if (ws.current && ws.current.readyState === WebSocket.OPEN) {
            const messageString = JSON.stringify(message);
            const connectionId = message?.payload?.connectionId;
            // Log before sending, associating with connection if possible
            if (connectionId) {
                addRawWsMessage(connectionId, 'send', messageString);
            } else {
                addLog(`[WS SEND] ${messageString}`);
            }
            ws.current.send(messageString);
        } else {
            console.error('WebSocket not connected. Cannot send message.');
            addLog('[WS] Cannot send message, not connected.');
        }
    }, [addLog, addRawWsMessage]); // Added addRawWsMessage

    return { sendMessage };
} 