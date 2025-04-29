import { useCallback, useEffect, useRef, useState } from 'react';
import { useStore } from '../store';

// Dynamically try different ports if the primary one fails
const WS_BASE_URL = 'ws://localhost';
const WS_PORTS = [8080, 8081, 8082, 8083, 8084, 8085];

// Debounce timeout in milliseconds
const DEBOUNCE_DELAY = 300;

// Message types that should be debounced
const DEBOUNCE_MESSAGES = ['resourcesList', 'toolsList', 'promptsList'];

// Reconnection delays (in ms) with exponential backoff
const RECONNECT_DELAYS = [1000, 2000, 3000, 5000, 8000];

export function useWebSocket() {
    const ws = useRef<WebSocket | null>(null);
    const portIndexRef = useRef<number>(0);
    const reconnectTimerRef = useRef<NodeJS.Timeout | null>(null);
    const pendingMessagesRef = useRef<Map<string, { timer: NodeJS.Timeout, data: string }>>(new Map());
    const reconnectAttemptsRef = useRef<number>(0);
    const [isConnected, setIsConnected] = useState(false);

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
        addRawWsMessage,
        setConfiguredServers
    } = useStore();

    const getNextWsUrl = useCallback(() => {
        const port = WS_PORTS[portIndexRef.current];
        return `${WS_BASE_URL}:${port}`;
    }, []);

    // Get reconnect delay with exponential backoff
    const getReconnectDelay = useCallback(() => {
        const attempt = reconnectAttemptsRef.current;
        const delayIndex = Math.min(attempt, RECONNECT_DELAYS.length - 1);
        return RECONNECT_DELAYS[delayIndex];
    }, []);

    // Debounce function to prevent too many state updates
    const debounceMessage = useCallback((key: string, data: string, callback: (data: string) => void) => {
        // Clear any existing timer for this key
        if (pendingMessagesRef.current.has(key)) {
            clearTimeout(pendingMessagesRef.current.get(key)!.timer);
        }

        // Set a new timer
        const timer = setTimeout(() => {
            callback(data);
            pendingMessagesRef.current.delete(key);
        }, DEBOUNCE_DELAY);

        // Store the timer and data
        pendingMessagesRef.current.set(key, { timer, data });
    }, []);

    const processMessage = useCallback((rawData: string) => {
        try {
            const message = JSON.parse(rawData);
            const { type, payload } = message;

            // Check if this message type should be debounced
            const shouldDebounce = DEBOUNCE_MESSAGES.includes(type);
            const messageKey = shouldDebounce ? `${type}-${payload?.connectionId || 'global'}` : null;

            // For debounced messages, handle differently 
            if (shouldDebounce && messageKey) {
                debounceMessage(messageKey, rawData, (data) => {
                    // This callback will run after the debounce delay
                    const debouncedMessage = JSON.parse(data);
                    handleProcessedMessage(debouncedMessage.type, debouncedMessage.payload);
                });
                return;
            }

            // For non-debounced messages, process immediately
            handleProcessedMessage(type, payload);
        } catch (error) {
            console.error('Failed to parse or handle message from backend:', error);
            addLog(`[WS RECV Malformed]: ${rawData}`);
        }
    }, [addLog, debounceMessage]);

    // Extracted message handling logic to a separate function
    const handleProcessedMessage = useCallback((type: string, payload: any) => {
        // --- Handle Raw Log Message FIRST --- 
        if (type === 'rawLog') {
            let associatedConnectionId = payload?.connectionId ||
                payload?.data?.id;

            if (!associatedConnectionId && typeof payload.data === 'string') {
                try {
                    const parsedRawData = JSON.parse(payload.data);
                    associatedConnectionId = parsedRawData?.params?.connectionId ||
                        parsedRawData?.result?.connectionId ||
                        parsedRawData?.payload?.connectionId;
                } catch { /* ignore parse error */ }
            }

            if (associatedConnectionId) {
                // Don't log raw messages for now - they're causing too many updates
                // addRawWsMessage(associatedConnectionId, payload.direction, payload.data);
            } else {
                addLog(`[${payload.direction === 'send' ? 'WS SEND' : 'WS RECV'}] ${payload.data}`);
            }
            return;
        }

        // --- Handle Other Message Types --- 
        switch (type) {
            case 'configuredServersList':
                setConfiguredServers(payload.servers);
                addLog(`[Config] Received ${payload.servers.length} configured servers.`);
                break;
            case 'connectionStatus':
                const { id, name, status, serverInfo, capabilities, error, reason } = payload;

                // First check if the connection exists
                const existing = useStore.getState().connections.find(c => c.id === id);

                if (!existing && status !== 'disconnected') {
                    // Only add connection if it doesn't exist and isn't being disconnected
                    addConnection({ id, name, status });
                }

                // Only update if not disconnecting
                if (status !== 'disconnected') {
                    updateConnection(id, {
                        name,
                        status,
                        ...(serverInfo && { serverInfo }),
                        ...(capabilities && { capabilities }),
                    });
                }

                // Handle specific status messages
                if (status === 'disconnected') {
                    addLog(`[MCP ${id}] Disconnected. ${reason ? `Reason: ${reason}` : ''}`);
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
            case 'mcpError':
                addLog(`[MCP ${payload.connectionId} Error${payload.operation ? ` (${payload.operation})` : ''}]: ${JSON.stringify(payload.error)}`);
                if (!payload.operation) {
                    updateConnection(payload.connectionId, { status: 'error' });
                }
                break;
            case 'error':
                addLog(`[Backend Error]: ${payload.message}`);
                break;

            // --- Handle List Responses ---
            case 'resourcesList':
                setResources(payload.connectionId, payload.data.resources);
                addLog(`[MCP ${payload.connectionId}] Received ${payload.data.resources?.length || 0} resources.`);
                break;
            case 'toolsList':
                setTools(payload.connectionId, payload.data.tools);
                addLog(`[MCP ${payload.connectionId}] Received ${payload.data.tools?.length || 0} tools.`);
                break;
            case 'promptsList':
                setPrompts(payload.connectionId, payload.data.prompts);
                addLog(`[MCP ${payload.connectionId}] Received ${payload.data.prompts?.length || 0} prompts.`);
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
                addLog(`[WS RECV Unknown]: ${JSON.stringify(payload)}`);
        }
    }, [
        addConnection, updateConnection, removeConnection, addLog,
        setResources, setTools, setPrompts,
        setViewedResourceContent, setLastToolResult, setPromptMessages,
        setConfiguredServers
    ]);

    const connectWebSocket = useCallback(() => {
        // Don't try to connect if we're already connected
        if (ws.current && ws.current.readyState === WebSocket.OPEN) {
            console.log('WebSocket already connected.');
            return;
        }

        // Clear any pending reconnect timer
        if (reconnectTimerRef.current) {
            clearTimeout(reconnectTimerRef.current);
            reconnectTimerRef.current = null;
        }

        const wsUrl = getNextWsUrl();
        console.log(`Connecting to WebSocket at ${wsUrl}...`);

        // Create new WebSocket connection
        try {
            const socket = new WebSocket(wsUrl);
            ws.current = socket;

            socket.onopen = () => {
                console.log(`WebSocket Connected to Backend on port ${WS_PORTS[portIndexRef.current]}`);
                addLog(`[WS] Connected to backend on port ${WS_PORTS[portIndexRef.current]}.`);

                // Reset connection state
                setIsConnected(true);
                reconnectAttemptsRef.current = 0;

                // Always reset to first port on successful connection
                portIndexRef.current = 0;
            };

            socket.onclose = (event) => {
                console.log('WebSocket Disconnected from Backend', event.code, event.reason);
                setIsConnected(false);

                const wasClean = event.wasClean;
                addLog(`[WS] Disconnected from backend${wasClean ? ' (clean)' : ''}. Attempting to reconnect...`);

                ws.current = null;

                // Increment the attempt counter for exponential backoff
                reconnectAttemptsRef.current++;

                // Move to next port only if this wasn't a clean close
                if (!wasClean) {
                    portIndexRef.current = (portIndexRef.current + 1) % WS_PORTS.length;
                }

                // Schedule reconnect with backoff
                const delay = getReconnectDelay();
                addLog(`[WS] Will try reconnect in ${delay / 1000} seconds...`);
                reconnectTimerRef.current = setTimeout(connectWebSocket, delay);
            };

            socket.onerror = (error) => {
                console.error('WebSocket Error:', error);
                addLog(`[WS] Error connecting to port ${WS_PORTS[portIndexRef.current]}`);

                // Errors are followed by close events, no need to close manually
                // The close handler will handle reconnection logic
            };

            socket.onmessage = (event) => {
                processMessage(event.data);
            };
        } catch (err) {
            console.error('Error creating WebSocket:', err);
            addLog(`[WS] Error creating WebSocket: ${err}`);

            // Move to next port
            portIndexRef.current = (portIndexRef.current + 1) % WS_PORTS.length;

            // Schedule reconnect with backoff
            const delay = getReconnectDelay();
            reconnectTimerRef.current = setTimeout(connectWebSocket, delay);
        }
    }, [addLog, getNextWsUrl, processMessage, getReconnectDelay]);

    useEffect(() => {
        console.log("useWebSocket Mounting...");

        // Connect to WebSocket on mount
        connectWebSocket();

        return () => {
            console.log("useWebSocket Unmounting...");

            // Clear any debounce timers
            pendingMessagesRef.current.forEach(({ timer }) => {
                clearTimeout(timer);
            });
            pendingMessagesRef.current.clear();

            // Clear any reconnect timer
            if (reconnectTimerRef.current) {
                clearTimeout(reconnectTimerRef.current);
                reconnectTimerRef.current = null;
            }

            // Close WebSocket connection
            if (ws.current && ws.current.readyState !== WebSocket.CLOSED) {
                ws.current.close();
                ws.current = null;
            }
        };
    }, [connectWebSocket]);

    const sendMessage = useCallback((message: any) => {
        if (ws.current && ws.current.readyState === WebSocket.OPEN) {
            const messageString = JSON.stringify(message);
            const connectionId = message?.payload?.connectionId;
            if (connectionId) {
                addRawWsMessage(connectionId, 'send', messageString);
            } else {
                addLog(`[WS SEND] ${messageString}`);
            }
            try {
                ws.current.send(messageString);
            } catch (sendError) {
                console.error('WebSocket send error:', sendError);
                addLog(`[WS] Error sending message: ${sendError}`);
            }
        } else {
            console.error(`WebSocket not connected (state: ${ws.current?.readyState}). Cannot send message.`);
            addLog('[WS] Cannot send message, not connected.');

            // Try to reconnect if disconnected
            if (!ws.current || ws.current.readyState !== WebSocket.CONNECTING) {
                connectWebSocket();
            }
        }
    }, [addLog, addRawWsMessage, connectWebSocket]);

    return { sendMessage, isConnected };
} 