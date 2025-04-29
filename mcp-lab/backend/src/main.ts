// MCP Lab Backend
// This will eventually host the MCP client logic

import { SimplePromptDefinition, SimpleResource, SimpleServerInfo, SimpleToolDefinition } from '@mcp-lab/shared';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { InitializedNotificationSchema } from '@modelcontextprotocol/sdk/types.js';
import { randomUUID } from 'crypto';
import fs from 'fs'; // Import fs for file reading
import path from 'path'; // Import path for resolving file path
// Use import.meta.url to get the current module's path
import { fileURLToPath } from 'url';
import { WebSocket, WebSocketServer } from 'ws';

// Calculate the directory name of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log("MCP Lab Backend Starting...");

// Modify the WebSocket port configuration
const DEFAULT_WS_PORT = 8080;
let WS_PORT = DEFAULT_WS_PORT;
const FALLBACK_PORTS = [8081, 8082, 8083, 8084, 8085];

// Calculate path relative to the current module's directory (__dirname)
// __dirname points to mcp-lab/backend/dist, so we need to go up 3 levels for project root
const CONFIG_FILE_PATH = path.resolve(__dirname, '../../../mcp-servers.json');
console.log(`Looking for server config at: ${CONFIG_FILE_PATH}`); // Log the path

// Define structure for server config entries
interface McpServerConfig {
    id: string;
    name: string;
    command: string;
    args: string[];
    description?: string;
}

interface ActiveMcpConnection {
    id: string;
    client: Client;
    transport: StdioClientTransport;
    websocket: WebSocket;
    command: string; // Keep command for display/reference
    status: 'connecting' | 'connected' | 'disconnected' | 'error';
    serverInfo?: SimpleServerInfo;
    configName?: string; // Store the name from the config
}

let configuredServers: McpServerConfig[] = [];

function loadServerConfigs() {
    console.log(`Attempting to load server configs from: ${CONFIG_FILE_PATH}`);
    try {
        if (fs.existsSync(CONFIG_FILE_PATH)) {
            console.log("Config file FOUND.");
            let fileContent = '';
            try {
                fileContent = fs.readFileSync(CONFIG_FILE_PATH, 'utf-8');
                console.log("Config file read successfully. Content length:", fileContent.length);
            } catch (readError) {
                console.error("Error READING config file:", readError);
                configuredServers = [];
                return;
            }

            try {
                configuredServers = JSON.parse(fileContent);
                console.log(`Loaded ${configuredServers.length} server configurations successfully:`, JSON.stringify(configuredServers));
            } catch (parseError) {
                console.error("Error PARSING config file JSON:", parseError);
                console.error("Raw file content that failed parsing:", fileContent);
                configuredServers = [];
            }

        } else {
            console.warn(`Configuration file NOT FOUND at ${CONFIG_FILE_PATH}. No pre-configured servers loaded.`);
            configuredServers = [];
        }
    } catch (error) {
        console.error(`Unexpected error during server configuration loading ${CONFIG_FILE_PATH}:`, error);
        configuredServers = [];
    }
}

// Load configs on startup
loadServerConfigs(); // Uncomment this line

const activeConnections = new Map<string, ActiveMcpConnection>();

// Create a function to start the WebSocket server
function startWebSocketServer() {
    try {
        const wss = new WebSocketServer({ port: WS_PORT });
        console.log(`WebSocket server started on ws://localhost:${WS_PORT}`);

        wss.on('connection', (ws) => {
            console.log('Frontend connected via WebSocket.');

            // Send the list of configured servers on new connection
            console.log(`Sending configuredServersList to frontend. Current value: ${JSON.stringify(configuredServers)}`);
            sendWsMessage(ws, 'configuredServersList', { servers: configuredServers });

            ws.on('message', async (message) => {
                const rawMessage = message.toString();
                sendWsMessage(ws, 'rawLog', { direction: 'recv', data: rawMessage });
                try {
                    const data = JSON.parse(rawMessage);
                    console.log('Received message from frontend:', data);

                    if (data.type === 'connectStdio') {
                        const { command, args } = data.payload;
                        if (typeof command === 'string' && Array.isArray(args)) {
                            await handleConnectStdio(ws, command, args);
                        } else {
                            sendWsError(ws, 'Invalid payload for connectStdio');
                        }
                    } else if (data.type === 'connectConfigured') {
                        console.log("[Backend] Received 'connectConfigured' message:", data.payload);
                        const { serverId } = data.payload;
                        if (typeof serverId === 'string') {
                            await handleConnectConfigured(ws, serverId);
                        } else {
                            sendWsError(ws, 'Invalid payload for connectConfigured, missing serverId');
                        }
                    } else if (data.type === 'disconnect') {
                        const { connectionId } = data.payload;
                        if (typeof connectionId === 'string') {
                            handleDisconnect(connectionId);
                        }
                    } else if (data.type === 'listResources') {
                        await handleListRequest(ws, data.payload?.connectionId, 'listResources', 'resourcesList');
                    } else if (data.type === 'listTools') {
                        await handleListRequest(ws, data.payload?.connectionId, 'listTools', 'toolsList');
                    } else if (data.type === 'listPrompts') {
                        await handleListRequest(ws, data.payload?.connectionId, 'listPrompts', 'promptsList');
                    } else if (data.type === 'readResource') {
                        const { connectionId, uri } = data.payload;
                        if (typeof connectionId === 'string' && typeof uri === 'string') {
                            await handleReadResource(ws, connectionId, uri);
                        } else {
                            sendWsError(ws, 'Invalid payload for readResource');
                        }
                    } else if (data.type === 'callTool') {
                        const { connectionId, toolName, args } = data.payload;
                        if (typeof connectionId === 'string' && typeof toolName === 'string' && typeof args === 'object') {
                            await handleCallTool(ws, connectionId, toolName, args);
                        } else {
                            sendWsError(ws, 'Invalid payload for callTool');
                        }
                    } else if (data.type === 'getPrompt') {
                        const { connectionId, promptName, args } = data.payload;
                        if (typeof connectionId === 'string' && typeof promptName === 'string' && typeof args === 'object') {
                            await handleGetPrompt(ws, connectionId, promptName, args);
                        } else {
                            sendWsError(ws, 'Invalid payload for getPrompt');
                        }
                    }
                } catch (error) {
                    console.error('Failed to process WebSocket message:', error);
                    sendWsError(ws, 'Invalid message format or processing error');
                }
            });

            ws.on('close', () => {
                console.log('Frontend WebSocket disconnected.');
                const connectionsToClose = Array.from(activeConnections.values())
                    .filter(conn => conn.websocket === ws)
                    .map(conn => conn.id);

                connectionsToClose.forEach(id => {
                    console.log(`Cleaning up MCP connection ${id} due to WebSocket close.`);
                    handleDisconnect(id);
                });
            });

            ws.on('error', (error) => {
                console.error('WebSocket error:', error);
            });
        });

        return wss;
    } catch (error: any) {
        if (error.code === 'EADDRINUSE') {
            const currentPortIndex = FALLBACK_PORTS.indexOf(WS_PORT);
            const nextPortIndex = (currentPortIndex === -1) ? 0 : currentPortIndex + 1;

            if (nextPortIndex < FALLBACK_PORTS.length) {
                console.warn(`Port ${WS_PORT} is in use. Trying alternate port ${FALLBACK_PORTS[nextPortIndex]}`);
                WS_PORT = FALLBACK_PORTS[nextPortIndex];
                return startWebSocketServer(); // Recursively try the next port
            } else {
                throw new Error(`All WebSocket ports (${DEFAULT_WS_PORT} and fallbacks) are in use. Please free up a port or modify the port configuration.`);
            }
        } else {
            throw error; // Rethrow non-port-related errors
        }
    }
}

// Replace the direct WebSocketServer initialization with our function
const wss = startWebSocketServer();

// Add this at the top of the file with other imports and declarations
const listRequestRateLimits: Map<string, number> = new Map();

// Function to handle connection using configured server ID
async function handleConnectConfigured(ws: WebSocket, serverId: string) {
    const config = configuredServers.find(s => s.id === serverId);
    if (!config) {
        console.error(`Server configuration with id '${serverId}' not found.`);
        sendWsError(ws, `Server configuration with id '${serverId}' not found.`);
        return;
    }
    console.log(`Connecting configured server: ${config.name} (ID: ${serverId})`);
    await handleConnectStdio(ws, config.command, config.args, config.name); // Pass name
}

// Modify handleConnectStdio to accept an optional configName
async function handleConnectStdio(ws: WebSocket, command: string, args: string[], configName?: string) {
    console.log(`[Backend] Entering handleConnectStdio. Command: ${command}, Args: ${args.join(' ')}, Name: ${configName}`);
    const connectionId = randomUUID();
    const displayName = configName || command;
    const projectRoot = path.resolve(__dirname, '../../..'); // Calculate project root path
    console.log(`[Backend] Calculated project root for CWD: ${projectRoot}`); // Log CWD

    let connection: ActiveMcpConnection | undefined = undefined;

    try {
        sendWsMessage(ws, 'connectionStatus', { id: connectionId, name: displayName, status: 'connecting' });

        // Create transport with the cwd option set to project root
        const transport = new StdioClientTransport({
            command,
            args,
            cwd: projectRoot // Set the current working directory
        });

        console.log(`[Backend] Created StdioClientTransport with command: ${command}, args: [${args.join(', ')}], cwd: ${projectRoot}`);

        const handlers = {
            initialized: (event: any) => {
                if (!connection) return;
                console.log(`[Backend][Handler Object] MCP Client ${connection.id} Initialized.`);
                console.log(`[Backend] Server info received:`, JSON.stringify(event.serverInfo));
                if (connection.status === 'connected') return; // Already handled
                connection.status = 'connected';
                connection.serverInfo = event.serverInfo as SimpleServerInfo;
                sendWsMessage(connection.websocket, 'connectionStatus', {
                    id: connection.id,
                    name: displayName,
                    status: 'connected',
                    serverInfo: event.serverInfo as SimpleServerInfo
                });
            },
            protocolError: (event: any) => {
                if (!connection) return;
                console.error(`MCP Protocol Error (${connection.id}):`, event.error);
                sendWsMessage(connection.websocket, 'mcpError', { connectionId: connection.id, error: event.error });
            },
            close: (event: any) => {
                if (!connection) return;
                console.log(`MCP Connection ${connection.id} Closed:`, event.reason);
                connection.status = 'disconnected';
                sendWsMessage(connection.websocket, 'connectionStatus', { id: connection.id, status: 'disconnected', reason: event.reason });
                activeConnections.delete(connection.id);
            },
            log: (event: any) => {
                if (!connection) return;
                console.log(`MCP Log (${connection.id}): [${event.level}]`, event.message);
                sendWsMessage(connection.websocket, 'mcpLog', { connectionId: connection.id, message: event.message, level: event.level });
            },
            'resources/listChanged': () => {
                if (!connection || connection.status !== 'connected') return;
                console.log(`MCP Event (${connection.id}): resources/listChanged received.`);
                handleListRequest(connection.websocket, connection.id, 'listResources', 'resourcesList', true);
            },
            'tools/listChanged': () => {
                if (!connection || connection.status !== 'connected') return;
                console.log(`MCP Event (${connection.id}): tools/listChanged received.`);
                handleListRequest(connection.websocket, connection.id, 'listTools', 'toolsList', true);
            },
            'prompts/listChanged': () => {
                if (!connection || connection.status !== 'connected') return;
                console.log(`MCP Event (${connection.id}): prompts/listChanged received.`);
                handleListRequest(connection.websocket, connection.id, 'listPrompts', 'promptsList', true);
            }
        };

        const client = new Client({
            name: "mcp-lab-host",
            version: "0.1.0",
            handlers: handlers
        });

        connection = {
            id: connectionId,
            client,
            transport,
            websocket: ws,
            command: command,
            configName: displayName,
            status: 'connecting',
        };
        activeConnections.set(connectionId, connection);

        console.log(`[Backend] Attempting client.connect for ${connectionId}...`);
        await client.connect(transport);
        console.log(`[Backend] client.connect(transport) promise RESOLVED for connection ${connectionId}. Waiting for initialized handler...`);

        // Add notification handler as before
        client.setNotificationHandler(InitializedNotificationSchema, (notification) => {
            console.log(`[Backend] setNotificationHandler triggered for 'initialized' event on ${connectionId}`);
            if (!connection) return;
            if (connection.status === 'connected') return; // Already handled

            // Add proper null checks and type assertion
            if (!notification.params) {
                console.error(`[Backend] Received invalid initialization notification - params missing`);
                return;
            }

            const serverInfo = notification.params.serverInfo as SimpleServerInfo;
            if (!serverInfo) {
                console.error(`[Backend] Received invalid initialization notification - serverInfo missing`);
                return;
            }

            markConnectionAsConnected(connection, serverInfo, displayName);
        });

        console.log(`MCP Connection ${connectionId} establishment process initiated.`);

        // Add a backup mechanism to check if server is ready after a short delay
        setTimeout(async () => {
            try {
                if (connection && connection.status === 'connecting') {
                    console.log(`[Backend] Checking server readiness for ${connectionId} via test call...`);
                    // Try a simple operation to see if the server is responsive
                    const listResult = await connection.client.listTools();
                    if (listResult) {
                        console.log(`[Backend] Server ${connectionId} appears to be ready (listTools succeeded)`);
                        // Server responded to API call, so it must be ready
                        if (connection.status === 'connecting') {
                            console.log(`[Backend] Manually marking connection ${connectionId} as connected`);
                            // Create a basic server info object if we don't have one
                            const basicServerInfo: SimpleServerInfo = {
                                name: displayName,
                                version: "1.0.0"
                            };
                            markConnectionAsConnected(connection, basicServerInfo, displayName);
                        }
                    }
                }
            } catch (error) {
                console.log(`[Backend] Test call to check server readiness failed: ${error}`);
                // Don't update status here, let the regular error handlers deal with it
            }
        }, 2000); // Wait 2 seconds before attempting the test call

    } catch (error) {
        console.error(`Failed to connect MCP server ${connectionId}:`, error);
        if (connection) {
            activeConnections.delete(connectionId);
            connection.status = 'error';
        }
        sendWsMessage(ws, 'connectionStatus', { id: connectionId, name: displayName, status: 'error', error: error instanceof Error ? error.message : String(error) });
    }
}

async function handleListRequest(
    ws: WebSocket,
    connectionId: string | undefined,
    clientMethod: 'listResources' | 'listTools' | 'listPrompts',
    responseType: string,
    isNotification: boolean = false
) {
    if (!connectionId) {
        if (!isNotification) sendWsError(ws, `Missing connectionId for ${clientMethod}`);
        return;
    }

    // Add rate limiting logic to prevent excessive requests
    const now = Date.now();
    const requestKey = `${connectionId}:${clientMethod}`;
    const lastRequestTime = listRequestRateLimits.get(requestKey) || 0;

    // Only allow one request per 1000ms for the same endpoint/connection
    if (now - lastRequestTime < 1000 && !isNotification) {
        console.log(`[Backend] Rate limiting ${clientMethod} request for ${connectionId} - too frequent`);
        return; // Silently ignore to avoid triggering more state updates
    }

    // Update the last request time
    listRequestRateLimits.set(requestKey, now);

    const connection = activeConnections.get(connectionId);
    if (!connection || connection.status !== 'connected') {
        // Allow list requests even if the 'initialized' event hasn't fired, as the connection might be working
        // if (!isNotification) sendWsError(ws, `Invalid or not connected connectionId: ${connectionId} for ${clientMethod}`);
        // return; 
        console.warn(`[Backend] Attempting ${clientMethod} for connection ${connectionId} which is not marked as fully connected (status: ${connection?.status}). Proceeding anyway...`);
    }
    if (!connection) { // Still need the connection object
        if (!isNotification) sendWsError(ws, `Connection object not found for ID: ${connectionId}`);
        return;
    }
    try {
        let result;
        switch (clientMethod) {
            case 'listResources':
                result = await connection.client.listResources();
                break;
            case 'listTools':
                result = await connection.client.listTools();
                break;
            case 'listPrompts':
                result = await connection.client.listPrompts();
                break;
            default: throw new Error('Invalid client method');
        }
        let dataToSend: { resources?: SimpleResource[]; tools?: SimpleToolDefinition[]; prompts?: SimplePromptDefinition[] } = {};
        if (clientMethod === 'listResources' && result.resources) dataToSend = { resources: result.resources as SimpleResource[] };
        else if (clientMethod === 'listTools' && result.tools) dataToSend = { tools: result.tools as SimpleToolDefinition[] };
        else if (clientMethod === 'listPrompts' && result.prompts) dataToSend = { prompts: result.prompts as SimplePromptDefinition[] };
        sendWsMessage(ws, responseType, { connectionId, data: dataToSend });
    } catch (error) {
        console.error(`Error during ${clientMethod} for ${connectionId}:`, error);
        sendWsMessage(ws, 'mcpError', { connectionId, operation: clientMethod, error: error instanceof Error ? error.message : String(error) });
    }
}

function handleDisconnect(connectionId: string) {
    const connection = activeConnections.get(connectionId);
    if (connection && connection.status !== 'disconnected') {
        console.log(`Disconnecting MCP server ${connectionId}...`);
        connection.status = 'disconnected';
        connection.client.close().catch((err: Error) => {
            console.error(`Error during explicit close for MCP connection ${connectionId}:`, err);
        });
    } else if (!connection) {
        console.warn(`Attempted to disconnect non-existent connection: ${connectionId}`);
    } else {
        console.log(`Connection ${connectionId} already disconnecting/disconnected.`);
    }
}

function sendWsMessage(ws: WebSocket, type: string, payload: any) {
    if (ws.readyState === WebSocket.OPEN) {
        const messageToSend = JSON.stringify({ type, payload });
        // Don't log the rawLog message itself to avoid loops
        if (type !== 'rawLog') {
            console.log('[WS SEND RAW]:', messageToSend);
            try {
                ws.send(JSON.stringify({ type: 'rawLog', payload: { direction: 'send', data: messageToSend } }));
            } catch (e) {
                console.error("Failed to send rawLog message:", e);
            }
        }
        try {
            ws.send(messageToSend);
        } catch (e) {
            console.error(`Failed to send message of type ${type}:`, e);
        }
    } else {
        console.warn(`WebSocket not open. Cannot send message type: ${type}`);
    }
}

function sendWsError(ws: WebSocket, message: string) {
    sendWsMessage(ws, 'error', { message });
}

async function handleReadResource(ws: WebSocket, connectionId: string, uri: string) {
    const connection = activeConnections.get(connectionId);
    if (!connection || connection.status !== 'connected') {
        console.warn(`[Backend] Attempting readResource for connection ${connectionId} which is not marked as fully connected (status: ${connection?.status}). Proceeding anyway...`);
        //sendWsError(ws, `Invalid or not connected connectionId: ${connectionId} for readResource`);
        //return;
    }
    if (!connection) { // Still need the connection object
        sendWsError(ws, `Connection object not found for ID: ${connectionId}`);
        return;
    }
    try {
        const result = await connection.client.readResource({ uri });
        const firstContent = result.contents && result.contents.length > 0 ? result.contents[0] : null;
        sendWsMessage(ws, 'resourceContent', { connectionId, uri, content: firstContent });
    } catch (error) {
        console.error(`Error during readResource for ${uri} on ${connectionId}:`, error);
        sendWsMessage(ws, 'resourceContent', { connectionId, uri, error: error instanceof Error ? error.message : String(error) });
    }
}

async function handleCallTool(ws: WebSocket, connectionId: string, toolName: string, args: object) {
    const connection = activeConnections.get(connectionId);
    if (!connection || connection.status !== 'connected') {
        console.warn(`[Backend] Attempting callTool for connection ${connectionId} which is not marked as fully connected (status: ${connection?.status}). Proceeding anyway...`);
        //sendWsError(ws, `Invalid or not connected connectionId: ${connectionId} for callTool`);
        //return;
    }
    if (!connection) { // Still need the connection object
        sendWsError(ws, `Connection object not found for ID: ${connectionId}`);
        return;
    }
    try {
        const result = await connection.client.callTool({ name: toolName, arguments: args as Record<string, unknown> });
        sendWsMessage(ws, 'toolResult', { connectionId, toolName, result: result });
    } catch (error) {
        console.error(`Error during callTool for ${toolName} on ${connectionId}:`, error);
        sendWsMessage(ws, 'toolResult', { connectionId, toolName, error: error instanceof Error ? error.message : String(error) });
    }
}

async function handleGetPrompt(ws: WebSocket, connectionId: string, promptName: string, args: object) {
    const connection = activeConnections.get(connectionId);
    if (!connection || connection.status !== 'connected') {
        console.warn(`[Backend] Attempting getPrompt for connection ${connectionId} which is not marked as fully connected (status: ${connection?.status}). Proceeding anyway...`);
        //sendWsError(ws, `Invalid or not connected connectionId: ${connectionId} for getPrompt`);
        //return;
    }
    if (!connection) { // Still need the connection object
        sendWsError(ws, `Connection object not found for ID: ${connectionId}`);
        return;
    }
    try {
        const result = await connection.client.getPrompt({ name: promptName, arguments: args as Record<string, string> });
        sendWsMessage(ws, 'promptMessages', { connectionId, promptName, messages: result.messages });
    } catch (error) {
        console.error(`Error during getPrompt for ${promptName} on ${connectionId}:`, error);
        sendWsMessage(ws, 'promptMessages', { connectionId, promptName, error: error instanceof Error ? error.message : String(error) });
    }
}

// Add a helper function to update connection status to avoid code duplication
function markConnectionAsConnected(connection: ActiveMcpConnection, serverInfo: SimpleServerInfo, displayName: string) {
    connection.status = 'connected';
    connection.serverInfo = serverInfo;
    sendWsMessage(connection.websocket, 'connectionStatus', {
        id: connection.id,
        name: displayName,
        status: 'connected',
        serverInfo: serverInfo
    });
}

console.log("Backend setup complete. Waiting for frontend connections...");