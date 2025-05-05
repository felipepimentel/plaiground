import { useSnackbar } from 'notistack';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useStore } from '../store';

// Get port from environment variable set by Vite
const WS_PORT = (import.meta as any).env.VITE_WS_PORT || '8080'; // Default if not set
const WS_URL = `ws://localhost:${WS_PORT}`;
console.log(`Frontend attempting WebSocket connection to: ${WS_URL}`);

// Debounce timeout in milliseconds
const DEBOUNCE_DELAY = 300;

// Rate limiting configuration
const RATE_LIMIT_DELAY = 5000; // 5 seconds between same requests
const RATE_LIMIT_METHODS = ['tools/list', 'prompts/list', 'resources/list']; // Methods to rate limit

// Message types that should be debounced
const DEBOUNCE_MESSAGES = ['resourcesList', 'promptsList'];

// Reconnection delay in milliseconds
const RECONNECT_DELAY_MS = 5000; // Increased delay
const INITIAL_CONNECT_DELAY_MS = 500; // New: Delay before first attempt

export function useWebSocket() {
    const ws = useRef<WebSocket | null>(null);
    const reconnectTimerRef = useRef<number | null>(null);
    const pendingMessagesRef = useRef<Map<string, { timer: number, data: string }>>(new Map());
    const [isConnected, setIsConnected] = useState(false);
    const activeServerId = useStore(state => state.activeServerId);
    const { enqueueSnackbar } = useSnackbar();

    // Rate limiting: track last request time for each rate-limited endpoint
    const lastRequestTimeRef = useRef<Map<string, number>>(new Map());

    // Add this before the lastRequestTimeRef
    const rateLimitKeysRef = useRef<Map<string, number>>(new Map());

    // Add a message queue for messages that need to be sent when connection is established
    const messageQueueRef = useRef<object[]>([]);

    const {
        addLog,
        handleWsMessage,
        addRawWsMessage
    } = useStore();

    // --- Define sendMessage FIRST (without useCallback) ---
    const sendMessage = (message: object) => {
        if (!ws.current || ws.current.readyState !== WebSocket.OPEN) {
            console.log('[WebSocket] Connection not ready, queuing message for later');
            // Queue the message to be sent once connected
            messageQueueRef.current.push(message);
            return;
        }

        try {
            let mcpMessage = message;

            // If the message doesn't have jsonrpc field, add it (standardize to JSON-RPC 2.0)
            // @ts-ignore
            if (!message.jsonrpc) {
                // @ts-ignore
                const type = message.type;
                // @ts-ignore
                const payload = message.payload;

                // Convert our internal message format to MCP JSON-RPC 2.0 format
                if (type === 'getTools') {
                    mcpMessage = {
                        jsonrpc: '2.0',
                        id: Math.floor(Math.random() * 10000),
                        method: "tools/list",
                        params: {
                            connectionId: payload?.connectionId
                        }
                    };
                }
                else if (type === 'getPrompts') {
                    mcpMessage = {
                        jsonrpc: '2.0',
                        id: Math.floor(Math.random() * 10000),
                        method: "prompts/list",
                        params: {
                            connectionId: payload?.connectionId
                        }
                    };
                }
                else if (type === 'executeTool') {
                    mcpMessage = {
                        jsonrpc: '2.0',
                        id: Math.floor(Math.random() * 10000),
                        method: "tools/call",
                        params: {
                            connectionId: payload.connectionId,
                            name: payload.toolName,
                            arguments: payload.parameters || {}
                        }
                    };
                }
                else if (type === 'getResources') {
                    mcpMessage = {
                        jsonrpc: '2.0',
                        id: Math.floor(Math.random() * 10000),
                        method: "resources/list",
                        params: {
                            connectionId: payload.connectionId
                        }
                    };
                }
                else if (type === 'connectConfigured') {
                    // Special case for connecting to servers - ensure serverName is preserved
                    mcpMessage = {
                        jsonrpc: '2.0',
                        id: Math.floor(Math.random() * 10000),
                        method: "connectConfigured",
                        params: {
                            serverName: payload.serverName
                        }
                    };
                }
                // Handle any other internal message types by converting to JSON-RPC 2.0
                else if (type && payload) {
                    console.warn('[WebSocket] Converting unknown message type to JSON-RPC format:', type);
                    // For other message types, try to map to MCP method patterns
                    let method = type;
                    // Map common prefixes
                    if (type.startsWith('get')) {
                        // e.g., getTools → tools/list
                        const resource = type.substring(3).toLowerCase();
                        method = `${resource}/list`;
                    } else if (type.startsWith('execute')) {
                        // e.g., executeTool → tools/call
                        const resource = type.substring(7).toLowerCase();
                        method = `${resource}/call`;
                    }

                    mcpMessage = {
                        jsonrpc: '2.0',
                        id: Math.floor(Math.random() * 10000),
                        method,
                        params: payload
                    };
                }
                // If message already has an id and method, just add jsonrpc field
                // @ts-ignore
                else if (message.id !== undefined && message.method) {
                    mcpMessage = {
                        ...message,
                        jsonrpc: '2.0'
                    };
                }

                console.log('[WebSocket] Converted internal message to MCP format:', mcpMessage);
            }

            // Apply rate limiting for specific methods
            // @ts-ignore
            const method = mcpMessage.method;
            if (method && RATE_LIMIT_METHODS.includes(method)) {
                const now = Date.now();
                // Create a unique key based on method and connectionId (if available)
                // @ts-ignore
                const connectionId = mcpMessage.params?.connectionId || 'global';
                const rateLimitKey = `${method}:${connectionId}`;

                const lastRequestTime = rateLimitKeysRef.current.get(rateLimitKey) || 0;

                if (now - lastRequestTime < RATE_LIMIT_DELAY) {
                    console.log(`[WebSocket] Rate limiting request for method ${method} with connectionId ${connectionId} - too frequent`);
                    return; // Skip sending if too frequent
                }

                // Update last request time
                rateLimitKeysRef.current.set(rateLimitKey, now);

                // Also update the previous tracker for backward compatibility
                lastRequestTimeRef.current.set(method, now);
            }

            const messageString = JSON.stringify(mcpMessage);
            ws.current.send(messageString);

            // Log the message (for debugging)
            addRawWsMessage('global', 'send', messageString);
        } catch (error) {
            console.error('[WebSocket] Failed to send message:', error);
            enqueueSnackbar('Error sending message to server.', { variant: 'error' });
        }
    };

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

    // Extracted message handling logic to a separate function
    const handleProcessedMessage = useCallback((type: string, payload: any) => {
        // Use the central handler from the store
        handleWsMessage({ type, payload });
    }, [handleWsMessage]); // Depend on the store's handler

    const processMessage = useCallback((rawData: string) => {
        try {
            const message = JSON.parse(rawData);
            console.log('[WebSocket] Raw received message:', message);

            // MCP standard message format detection
            // Check if this is a JSON-RPC 2.0 style message
            if (message.jsonrpc === '2.0' || message.id !== undefined) {
                console.log('[WebSocket] Detected standard MCP format message');

                // 1. Handle method responses (has id field)
                if (message.id !== undefined) {
                    // 1a. Success response (has result field)
                    if (message.result !== undefined) {
                        console.log('[WebSocket] Processing MCP success response for id:', message.id);

                        // Handle known tool-related responses
                        if (message.result.tools !== undefined) {
                            const connectionId = message.params?.connectionId || activeServerId;
                            if (connectionId) {
                                const transformedMessage = {
                                    type: 'toolsList',
                                    payload: {
                                        connectionId,
                                        data: {
                                            tools: message.result.tools
                                        }
                                    }
                                };
                                console.log('[WebSocket] Transformed tools response:', transformedMessage);
                                handleProcessedMessage(transformedMessage.type, transformedMessage.payload);
                                return;
                            }
                        }

                        // Handle known prompt-related responses
                        if (message.result.prompts !== undefined) {
                            const connectionId = message.params?.connectionId || activeServerId;
                            if (connectionId) {
                                const transformedMessage = {
                                    type: 'promptsList',
                                    payload: {
                                        connectionId,
                                        data: {
                                            prompts: message.result.prompts
                                        }
                                    }
                                };
                                console.log('[WebSocket] Transformed prompts response:', transformedMessage);
                                handleProcessedMessage(transformedMessage.type, transformedMessage.payload);
                                return;
                            }
                        }
                    }

                    // 1b. Error response (has error field)
                    if (message.error !== undefined) {
                        console.error('[WebSocket] MCP error response:', message.error);
                        addLog(`[MCP Error] ${message.error.message || 'Unknown error'}`);
                        return;
                    }
                }

                // 2. Handle MCP notifications (no id field but has method)
                if (message.id === undefined && message.method) {
                    console.log('[WebSocket] Processing MCP notification:', message.method);

                    // Handle list_changed notifications
                    if (message.method === 'notifications/tools/list_changed') {
                        // Trigger a tools refresh for the active server
                        if (activeServerId) {
                            console.log('[WebSocket] Tools list changed, refreshing');
                            const refreshMessage = {
                                id: Math.floor(Math.random() * 10000),
                                jsonrpc: '2.0',
                                method: 'tools/list',
                                params: {}
                            };
                            try {
                                ws.current?.send(JSON.stringify(refreshMessage));
                            } catch (err) {
                                console.error('Failed to request tools refresh:', err);
                            }
                        }
                        return;
                    }

                    if (message.method === 'notifications/prompts/list_changed') {
                        // Similar handling for prompts refresh
                        if (activeServerId) {
                            console.log('[WebSocket] Prompts list changed, refreshing');
                            const refreshMessage = {
                                id: Math.floor(Math.random() * 10000),
                                jsonrpc: '2.0',
                                method: 'prompts/list',
                                params: {}
                            };
                            try {
                                ws.current?.send(JSON.stringify(refreshMessage));
                            } catch (err) {
                                console.error('Failed to request prompts refresh:', err);
                            }
                        }
                        return;
                    }
                }
            }

            // Process our internal message format (fallback)
            if (message.type && message.payload) {
                const { type, payload } = message;

                // Debug incoming toolsList messages
                if (type === 'toolsList') {
                    console.log('[WebSocket] Received toolsList message:', payload);
                }

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
            }
        } catch (error) {
            console.error('Failed to parse or handle message from backend:', error, 'Raw data:', rawData);
            addLog(`[WS RECV Malformed]: ${rawData}`);
        }
    }, [addLog, debounceMessage, handleProcessedMessage]);

    const connectWebSocket = useCallback(() => {
        // Clear any pending reconnect timer first
        if (reconnectTimerRef.current) {
            clearTimeout(reconnectTimerRef.current);
            reconnectTimerRef.current = null;
        }

        if (ws.current && ws.current.readyState === WebSocket.OPEN) {
            console.log('WebSocket already connected.');
            return; // Already connected
        }

        // Use the fixed WS_URL derived from env var
        console.log(`Attempting WebSocket connection to ${WS_URL}...`);
        addLog(`[System] Connecting WebSocket to ${WS_URL}...`);
        ws.current = new WebSocket(WS_URL);

        ws.current.onopen = () => {
            console.log(`WebSocket connected to ${WS_URL}`);
            addLog(`[System] WebSocket connected to ${WS_URL}.`);
            setIsConnected(true);
            // Request configured servers on connect
            sendMessage({ type: 'getConfiguredServers', payload: {} });

            // Send all queued messages
            messageQueueRef.current.forEach((message) => sendMessage(message));
            messageQueueRef.current.length = 0;
        };

        ws.current.onclose = () => {
            console.log(`WebSocket disconnected from ${WS_URL}`);
            addLog(`[System] WebSocket disconnected. Attempting reconnect in ${RECONNECT_DELAY_MS / 1000}s...`);
            setIsConnected(false);
            ws.current = null; // Clear the ref

            // Attempt to reconnect after a simple fixed delay
            if (!reconnectTimerRef.current) {
                reconnectTimerRef.current = setTimeout(connectWebSocket, RECONNECT_DELAY_MS);
            }
        };

        ws.current.onerror = (error) => {
            console.error(`WebSocket error connecting to ${WS_URL}:`, error);
            addLog(`[System] WebSocket error on ${WS_URL}: ${error.type}`);
            // onclose will be called after onerror, triggering the reconnect logic.
        };

        ws.current.onmessage = (event) => {
            processMessage(event.data);
        };
    }, [addLog, processMessage, sendMessage, handleProcessedMessage]); // Simplified dependencies

    useEffect(() => {
        console.log("useWebSocket Mounting...");
        // Delay the initial connection attempt
        const initialConnectTimeout = setTimeout(() => {
            connectWebSocket();
        }, INITIAL_CONNECT_DELAY_MS);

        return () => {
            console.log("useWebSocket Unmounting...");
            clearTimeout(initialConnectTimeout); // Clear initial timeout if unmounted before connecting
            // Clear timers and close socket
            if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
            pendingMessagesRef.current.forEach(({ timer }) => clearTimeout(timer));
            pendingMessagesRef.current.clear();
            if (ws.current && ws.current.readyState !== WebSocket.CLOSED) {
                console.log("Closing WebSocket on unmount.")
                ws.current.close();
            }
            ws.current = null;
        };
    }, []); // <-- Set dependency array to empty

    return { sendMessage, isConnected };
} 