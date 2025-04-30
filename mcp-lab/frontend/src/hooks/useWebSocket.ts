import { useCallback, useEffect, useRef, useState } from 'react';
import { useStore } from '../store';

// Get port from environment variable set by Vite
const WS_PORT = import.meta.env.VITE_WS_PORT || '8080'; // Default if not set
const WS_URL = `ws://localhost:${WS_PORT}`;
console.log(`Frontend attempting WebSocket connection to: ${WS_URL}`);

// Debounce timeout in milliseconds
const DEBOUNCE_DELAY = 300;

// Message types that should be debounced
const DEBOUNCE_MESSAGES = ['resourcesList', 'toolsList', 'promptsList'];

// Reconnection delay in milliseconds
const RECONNECT_DELAY_MS = 5000; // Increased delay
const INITIAL_CONNECT_DELAY_MS = 500; // New: Delay before first attempt

export function useWebSocket() {
    const ws = useRef<WebSocket | null>(null);
    const reconnectTimerRef = useRef<NodeJS.Timeout | null>(null);
    const pendingMessagesRef = useRef<Map<string, { timer: NodeJS.Timeout, data: string }>>(new Map());
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
        setConfiguredServers,
        handleWsMessage
    } = useStore();

    // --- Define sendMessage FIRST (without useCallback) ---
    const sendMessage = (message: object) => {
        if (ws.current && ws.current.readyState === WebSocket.OPEN) {
            try {
                const messageString = JSON.stringify(message);
                ws.current.send(messageString);
            } catch (error) {
                console.error('Failed to send message:', error);
                addLog(`[System] Failed to send message: ${error}`);
            }
        } else {
            console.warn('WebSocket not connected. Cannot send message:', message);
        }
    }; // No useCallback wrapper

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