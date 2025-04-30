// MCP Lab Backend
// This will eventually host the MCP client logic
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
// Get WebSocket port from environment or use default
const DEFAULT_WS_PORT = 8080;
const WS_PORT = parseInt(process.env.WS_PORT || '', 10) || DEFAULT_WS_PORT;
console.log(`Attempting to use WebSocket port: ${WS_PORT}`);
// Calculate path relative to the current module's directory (__dirname)
// __dirname points to mcp-lab/backend/dist, so we need to go up 3 levels for project root
const CONFIG_FILE_PATH = path.resolve(__dirname, '../../../mcp-lab-config.json');
console.log(`Looking for server config at: ${CONFIG_FILE_PATH}`); // Log the path
// Use a Map for easier lookup by server name
let configuredServers = new Map();
// Rate limiting for list requests
const listRequestRateLimits = new Map();
function loadServerConfigs() {
    console.log(`Attempting to load server configs from: ${CONFIG_FILE_PATH}`);
    try {
        if (fs.existsSync(CONFIG_FILE_PATH)) {
            console.log("Config file FOUND.");
            let fileContent = '';
            try {
                fileContent = fs.readFileSync(CONFIG_FILE_PATH, 'utf-8');
                console.log("Config file read successfully. Content length:", fileContent.length);
            }
            catch (readError) {
                console.error("Error READING config file:", readError);
                configuredServers = new Map(); // Reset to empty map
                return;
            }
            try {
                // Expecting { "mcpServers": { "ServerName": { ... }, ... } }
                const parsedConfig = JSON.parse(fileContent);
                if (parsedConfig && typeof parsedConfig.mcpServers === 'object') {
                    const serversFromFile = parsedConfig.mcpServers;
                    const tempMap = new Map();
                    let count = 0;
                    for (const serverName in serversFromFile) {
                        if (Object.prototype.hasOwnProperty.call(serversFromFile, serverName)) {
                            const serverDef = serversFromFile[serverName];
                            // Basic validation
                            if (serverDef && (serverDef.type === 'stdio' || serverDef.type === 'websocket')) {
                                tempMap.set(serverName, { ...serverDef, name: serverName }); // Add name property
                                count++;
                            }
                            else {
                                console.warn(`Skipping invalid server config entry: ${serverName}`);
                            }
                        }
                    }
                    configuredServers = tempMap;
                    console.log(`Loaded ${count} server configurations successfully:`, Array.from(configuredServers.entries()));
                }
                else {
                    console.error("Config file does not contain a valid 'mcpServers' object at the root.");
                    configuredServers = new Map();
                }
            }
            catch (parseError) {
                console.error("Error PARSING config file JSON:", parseError);
                console.error("Raw file content that failed parsing:", fileContent);
                configuredServers = new Map(); // Reset to empty map
            }
        }
        else {
            console.warn(`Configuration file NOT FOUND at ${CONFIG_FILE_PATH}. No pre-configured servers loaded.`);
            configuredServers = new Map(); // Reset to empty map
        }
    }
    catch (error) {
        console.error(`Unexpected error during server configuration loading ${CONFIG_FILE_PATH}:`, error);
        configuredServers = new Map(); // Reset to empty map
    }
}
// Load configs on startup
loadServerConfigs();
const activeConnections = new Map();
// Create a function to start the WebSocket server
function startWebSocketServer() {
    try {
        const wss = new WebSocketServer({ port: WS_PORT });
        console.log(`WebSocket server started successfully on ws://localhost:${WS_PORT}`);
        wss.on('connection', (ws) => {
            console.log('Frontend connected via WebSocket.');
            // Send the list of configured servers on new connection immediately
            sendConfiguredServersList(ws);
            ws.on('message', async (message) => {
                const rawMessage = message.toString();
                sendWsMessage(ws, 'rawLog', { direction: 'recv', data: rawMessage });
                try {
                    const data = JSON.parse(rawMessage);
                    // Handle standard MCP JSON-RPC 2.0 messages
                    if (data.jsonrpc === '2.0' && data.method) {
                        // Handle tools/list request (direct MCP format)
                        if (data.method === 'tools/list') {
                            // Find the active connection ID from the activeServerId
                            const connectionId = data.params?.connectionId ||
                                Array.from(activeConnections.values()).find(conn => conn.websocket === ws && conn.status === 'connected')?.id;
                            if (connectionId) {
                                await handleListRequest(ws, connectionId, 'listTools', 'toolsList');
                                // Send a proper JSON-RPC 2.0 response
                                const response = {
                                    jsonrpc: '2.0',
                                    id: data.id,
                                    result: { success: true }
                                };
                                ws.send(JSON.stringify(response));
                            }
                            else {
                                console.error('[Backend] No active connection found for tools/list request');
                                const error = {
                                    jsonrpc: '2.0',
                                    id: data.id,
                                    error: {
                                        code: -32000,
                                        message: 'No active connection found'
                                    }
                                };
                                ws.send(JSON.stringify(error));
                            }
                            return;
                        }
                        // Handle connectConfigured method with JSON-RPC 2.0 format
                        else if (data.method === 'connectConfigured') {
                            console.log('[Backend] Received JSON-RPC connectConfigured request:', data);
                            const serverName = data.params?.serverName;
                            if (typeof serverName === 'string') {
                                await handleConnectConfigured(ws, serverName);
                                // Send a proper JSON-RPC 2.0 response
                                const response = {
                                    jsonrpc: '2.0',
                                    id: data.id,
                                    result: { success: true }
                                };
                                ws.send(JSON.stringify(response));
                            }
                            else {
                                console.error('[Backend] Missing serverName in connectConfigured params');
                                const error = {
                                    jsonrpc: '2.0',
                                    id: data.id,
                                    error: {
                                        code: -32000,
                                        message: 'Missing serverName parameter'
                                    }
                                };
                                ws.send(JSON.stringify(error));
                            }
                            return;
                        }
                        // Add handlers for other MCP methods as needed
                    }
                    // --- Handle our legacy internal message types ---
                    if (data.type === 'getConfiguredServers') {
                        sendConfiguredServersList(ws);
                    }
                    else if (data.type === 'connectConfigured') { // Changed connectStdio to connectConfigured
                        console.log("[Backend] Received 'connectConfigured' message:", data.payload);
                        const { serverName } = data.payload; // Expect serverName now
                        if (typeof serverName === 'string') {
                            await handleConnectConfigured(ws, serverName);
                        }
                        else {
                            sendWsError(ws, 'Invalid payload for connectConfigured, missing serverName');
                        }
                    }
                    else if (data.type === 'disconnect') {
                        const { connectionId } = data.payload; // Disconnect uses internal connectionId
                        if (typeof connectionId === 'string') {
                            handleDisconnect(connectionId);
                        }
                    }
                    else if (data.type === 'listResources') {
                        await handleListRequest(ws, data.payload?.connectionId, 'listResources', 'resourcesList');
                    }
                    else if (data.type === 'listPrompts') {
                        await handleListRequest(ws, data.payload?.connectionId, 'listPrompts', 'promptsList');
                    }
                    else if (data.type === 'readResource') {
                        const { connectionId, uri } = data.payload;
                        if (typeof connectionId === 'string' && typeof uri === 'string') {
                            await handleReadResource(ws, connectionId, uri);
                        }
                        else {
                            sendWsError(ws, 'Invalid payload for readResource');
                        }
                    }
                    else if (data.type === 'callTool') {
                        const { connectionId, toolName, args } = data.payload;
                        if (typeof connectionId === 'string' && typeof toolName === 'string' && typeof args === 'object') {
                            await handleCallTool(ws, connectionId, toolName, args);
                        }
                        else {
                            sendWsError(ws, 'Invalid payload for callTool');
                        }
                    }
                    else if (data.type === 'getPrompt') {
                        const { connectionId, promptName, args } = data.payload;
                        if (typeof connectionId === 'string' && typeof promptName === 'string' && typeof args === 'object') {
                            await handleGetPrompt(ws, connectionId, promptName, args);
                        }
                        else {
                            sendWsError(ws, 'Invalid payload for getPrompt');
                        }
                    }
                }
                catch (error) {
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
    }
    catch (error) {
        if (error.code === 'EADDRINUSE') {
            // --- MODIFIED: Exit on port collision ---
            console.error(`\n*** FATAL ERROR: Port ${WS_PORT} is already in use. ***`);
            console.error(`Please ensure no other process is using port ${WS_PORT}, or change the WS_PORT variable in run.sh`);
            process.exit(1); // Exit the backend process
        }
        else {
            console.error('Unexpected error starting WebSocket server:', error);
            throw error; // Rethrow other errors
        }
    }
}
// Start the WebSocket server (will exit if port is busy)
const wss = startWebSocketServer();
// --- NEW: Helper function to send the configured server list ---
function sendConfiguredServersList(ws) {
    const serverList = Array.from(configuredServers.values());
    console.log(`Sending configuredServersList to frontend. Count: ${serverList.length}`);
    sendWsMessage(ws, 'configuredServersList', { servers: serverList });
}
// Modify handleConnectConfigured to use serverName and the config map
async function handleConnectConfigured(ws, serverName) {
    const config = configuredServers.get(serverName);
    if (!config) {
        console.error(`Server configuration with name '${serverName}' not found.`);
        // Send specific status error for this server
        sendWsMessage(ws, 'connectionStatus', {
            id: `error-${randomUUID()}`, // Temporary ID for status update
            name: serverName,
            status: 'error',
            error: `Server configuration not found.`
        });
        return;
    }
    // Check if already connecting/connected (prevent duplicate connections)
    const existingConnection = Array.from(activeConnections.values()).find(conn => conn.configName === serverName && conn.status !== 'disconnected' && conn.status !== 'error');
    if (existingConnection) {
        console.warn(`Connection attempt for already active/connecting server: ${serverName}. Ignoring.`);
        sendWsMessage(ws, 'connectionStatus', {
            id: existingConnection.id,
            name: serverName,
            status: existingConnection.status,
            serverInfo: existingConnection.serverInfo,
            error: existingConnection.status === 'error' ? 'Existing connection error' : undefined
        });
        return;
    }
    console.log(`Connecting configured server: ${serverName} (Type: ${config.type})`);
    if (config.type === 'stdio') {
        if (!config.command || !config.args) {
            // Send specific status error for this server
            sendWsMessage(ws, 'connectionStatus', {
                id: `error-${randomUUID()}`, // Temporary ID
                name: serverName,
                status: 'error',
                error: `STDIO server config missing command or args.`
            });
            console.error(`STDIO server config '${serverName}' is missing command or args.`);
            return;
        }
        await handleConnectStdio(ws, config.command, config.args, config.name, config.cwd);
    }
    else if (config.type === 'websocket') {
        // Send specific status error for this server
        sendWsMessage(ws, 'connectionStatus', {
            id: `error-${randomUUID()}`, // Temporary ID
            name: serverName,
            status: 'error',
            error: 'WebSocket connections not yet implemented'
        });
        console.warn(`Attempted to connect WebSocket server: ${serverName}. Not implemented.`);
        // sendWsError(ws, `WebSocket server connections not yet implemented for server: ${serverName}`); // Replaced by status update
    }
    else {
        // Send specific status error for this server
        sendWsMessage(ws, 'connectionStatus', {
            id: `error-${randomUUID()}`, // Temporary ID
            name: serverName,
            status: 'error',
            error: `Unknown server type: ${config.type}`
        });
        console.error(`Unknown server type '${config.type}' for server: ${serverName}`);
        // sendWsError(ws, `Unknown server type '${config.type}' for server: ${serverName}`); // Replaced by status update
    }
}
// Modify handleConnectStdio to accept optional configName and cwd override
async function handleConnectStdio(ws, command, args, configName, configCwd) {
    console.log(`[Backend] Entering handleConnectStdio. Server: ${configName}, Command: ${command}, Args: ${args.join(' ')}, CWD Override: ${configCwd}`);
    const connectionId = randomUUID();
    const projectRoot = path.resolve(__dirname, '../../..'); // Calculate project root path
    const effectiveCwd = configCwd ? path.resolve(projectRoot, configCwd) : projectRoot; // Resolve custom CWD relative to root if provided
    console.log(`[Backend] Effective CWD for server process: ${effectiveCwd}`); // Log effective CWD
    // Check if effectiveCwd exists
    if (!fs.existsSync(effectiveCwd)) {
        console.error(`[Backend] Error: Calculated CWD does not exist: ${effectiveCwd}`);
        sendWsError(ws, `Configuration error: Specified working directory does not exist: ${effectiveCwd}`);
        return; // Stop connection attempt
    }
    let connection = undefined;
    try {
        // Send initial connecting status using configName
        sendWsMessage(ws, 'connectionStatus', { id: connectionId, name: configName, status: 'connecting' });
        // Create transport with the effective cwd
        const transport = new StdioClientTransport({
            command,
            args,
            cwd: effectiveCwd // Set the effective current working directory
        });
        console.log(`[Backend] Created StdioClientTransport for ${configName} with command: ${command}, args: [${args.join(', ')}], cwd: ${effectiveCwd}`);
        const handlers = {
            initialized: (event) => {
                if (!connection)
                    return;
                console.log(`[Backend][Handler Object] MCP Client ${connection.id} (${connection.configName}) Initialized.`);
                console.log(`[Backend] Server info received for ${connection.configName}:`, JSON.stringify(event.serverInfo));
                if (connection.status === 'connected')
                    return; // Already handled
                markConnectionAsConnected(connection, event.serverInfo);
            },
            protocolError: (event) => {
                if (!connection)
                    return;
                console.error(`MCP Protocol Error (${connection.configName} - ${connection.id}):`, event.error);
                sendWsMessage(connection.websocket, 'mcpError', { connectionId: connection.id, error: event.error });
                // Update status to error
                if (connection.status !== 'error') {
                    connection.status = 'error';
                    sendWsMessage(connection.websocket, 'connectionStatus', {
                        id: connection.id,
                        name: configName,
                        status: 'error',
                        error: event.error || 'Protocol Error'
                    });
                }
            },
            close: (event) => {
                if (!connection)
                    return;
                console.log(`MCP Connection ${connection.configName} (${connection.id}) Closed:`, event.reason, `Exit Code: ${event.code}`); // Log exit code
                // If the connection closed while still trying to connect, and there wasn't a protocol error,
                // treat it as a clean disconnect (likely a short-lived command like echo).
                if (connection.status === 'connecting') {
                    connection.status = 'disconnected';
                    sendWsMessage(connection.websocket, 'connectionStatus', {
                        id: connection.id,
                        name: configName,
                        status: 'disconnected',
                        reason: `Process exited cleanly (code ${event.code}) before full connection.`
                    });
                }
                else if (connection.status !== 'error') { // Don't overwrite error state if it closed due to an earlier error
                    connection.status = 'disconnected';
                    sendWsMessage(connection.websocket, 'connectionStatus', { id: connection.id, name: configName, status: 'disconnected', reason: event.reason });
                }
                activeConnections.delete(connection.id); // Clean up active connection
            },
            log: (event) => {
                if (!connection)
                    return;
                console.log(`MCP Log (${connection.configName} - ${connection.id}): [${event.level}]`, event.message);
                sendWsMessage(connection.websocket, 'mcpLog', { connectionId: connection.id, message: event.message, level: event.level });
            },
            'resources/listChanged': () => {
                if (!connection || connection.status !== 'connected')
                    return;
                console.log(`MCP Event (${connection.configName} - ${connection.id}): resources/listChanged received.`);
                handleListRequest(connection.websocket, connection.id, 'listResources', 'resourcesList', true);
            },
            'tools/listChanged': () => {
                if (!connection || connection.status !== 'connected')
                    return;
                console.log(`MCP Event (${connection.configName} - ${connection.id}): tools/listChanged received.`);
                handleListRequest(connection.websocket, connection.id, 'listTools', 'toolsList', true);
            },
            'prompts/listChanged': () => {
                if (!connection || connection.status !== 'connected')
                    return;
                console.log(`MCP Event (${connection.configName} - ${connection.id}): prompts/listChanged received.`);
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
            configName: configName, // Store the config name
            client,
            transport,
            websocket: ws,
            status: 'connecting',
        };
        activeConnections.set(connectionId, connection);
        console.log(`[Backend] Attempting client.connect for ${configName} (${connectionId})...`);
        await client.connect(transport);
        console.log(`[Backend] client.connect(transport) promise RESOLVED for ${configName} (${connectionId}). Waiting for initialized handler...`);
        // Add notification handler as before
        client.setNotificationHandler(InitializedNotificationSchema, (notification) => {
            console.log(`[Backend] setNotificationHandler triggered for 'initialized' event on ${configName} (${connectionId})`);
            if (!connection)
                return;
            if (connection.status === 'connected')
                return; // Already handled
            // Add proper null checks and type assertion
            if (!notification.params) {
                console.error(`[Backend] Received invalid initialization notification - params missing`);
                return;
            }
            const serverInfo = notification.params.serverInfo;
            if (!serverInfo) {
                console.error(`[Backend] Received invalid initialization notification - serverInfo missing`);
                return;
            }
            markConnectionAsConnected(connection, serverInfo);
        });
        console.log(`MCP Connection ${configName} (${connectionId}) establishment process initiated.`);
        // Add a backup mechanism to check if server is ready after a short delay
        setTimeout(async () => {
            try {
                if (connection && connection.status === 'connecting') {
                    console.log(`[Backend] Checking server readiness for ${configName} (${connectionId}) via test call...`);
                    // Try a simple operation to see if the server is responsive
                    const listResult = await connection.client.listTools();
                    if (listResult) {
                        console.log(`[Backend] Server ${configName} (${connectionId}) appears to be ready (listTools succeeded)`);
                        // Server responded to API call, so it must be ready
                        if (connection.status === 'connecting') {
                            console.log(`[Backend] Manually marking connection ${configName} (${connectionId}) as connected`);
                            // Create a basic server info object if we don't have one
                            const basicServerInfo = {
                                name: configName,
                                version: "1.0.0" // Default version
                            };
                            markConnectionAsConnected(connection, basicServerInfo);
                        }
                    }
                }
            }
            catch (error) {
                console.log(`[Backend] Test call to check server readiness failed for ${configName} (${connectionId}): ${error}`);
                // If test call fails, assume connection failed
                if (connection && connection.status === 'connecting') {
                    connection.status = 'error';
                    sendWsMessage(ws, 'connectionStatus', {
                        id: connectionId,
                        name: configName,
                        status: 'error',
                        error: error instanceof Error ? error.message : String(error)
                    });
                    console.error(`[Backend] Connection failed for ${configName} (${connectionId}) - test call failed.`);
                    // Clean up? Client might close itself.
                    // activeConnections.delete(connectionId);
                }
            }
        }, 3000); // Increase timeout slightly
    }
    catch (error) {
        // Any error during the connect attempt means the connection failed.
        console.error(`Connect attempt failed for ${configName} (${connectionId}):`, error);
        // Send error status for any connection failure during this phase
        sendWsMessage(ws, 'connectionStatus', {
            id: connectionId,
            name: configName,
            status: 'error',
            error: error instanceof Error ? error.message : String(error)
        });
        // Clean up connection state 
        if (connection) {
            // We need to ensure the transport is disposed if connect failed partially
            // Transport might not have a close method or it might throw, wrap in try-catch
            try {
                connection.transport?.close();
            }
            catch (transportCloseError) {
                console.error(`Error closing transport during connect failure cleanup for ${configName}:`, transportCloseError);
            }
            activeConnections.delete(connectionId);
        }
    }
}
async function handleListRequest(ws, connectionId, clientMethod, responseType, isNotification = false) {
    if (!connectionId) {
        if (!isNotification)
            sendWsError(ws, `Missing connectionId for ${clientMethod}`);
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
        console.warn(`[Backend] Attempting ${clientMethod} for connection ${connectionId} which is not marked as fully connected (status: ${connection?.status}). Proceeding anyway...`);
    }
    if (!connection) { // Still need the connection object
        if (!isNotification)
            sendWsError(ws, `Connection object not found for ID: ${connectionId}`);
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
        let dataToSend = {};
        if (clientMethod === 'listResources' && result.resources)
            dataToSend = { resources: result.resources };
        else if (clientMethod === 'listTools' && result.tools)
            dataToSend = { tools: result.tools };
        else if (clientMethod === 'listPrompts' && result.prompts)
            dataToSend = { prompts: result.prompts };
        sendWsMessage(ws, responseType, { connectionId, data: dataToSend });
    }
    catch (error) {
        console.error(`Error during ${clientMethod} for ${connection.configName} (${connectionId}):`, error);
        sendWsMessage(ws, 'mcpError', { connectionId, operation: clientMethod, error: error instanceof Error ? error.message : String(error) });
        // Update status if list request fails on a connected server? Maybe not.
    }
}
function handleDisconnect(connectionId) {
    const connection = activeConnections.get(connectionId);
    if (connection && connection.status !== 'disconnected') {
        console.log(`Disconnecting MCP server ${connection.configName} (${connectionId})...`);
        const previousStatus = connection.status;
        connection.status = 'disconnected'; // Mark as disconnected immediately
        connection.client.close().catch((err) => {
            console.error(`Error during explicit close for MCP connection ${connection.configName} (${connectionId}):`, err);
        });
        // Send status update unless it was already an error
        if (previousStatus !== 'error') {
            sendWsMessage(connection.websocket, 'connectionStatus', { id: connection.id, name: connection.configName, status: 'disconnected', reason: 'User initiated' });
        }
        // Don't delete immediately, let close handler do it.
        // activeConnections.delete(connectionId);
    }
    else if (!connection) {
        console.warn(`Attempted to disconnect non-existent connection: ${connectionId}`);
    }
    else {
        console.log(`Connection ${connection?.configName} (${connectionId}) already disconnecting/disconnected.`);
    }
}
function sendWsMessage(ws, type, payload) {
    if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type, payload }));
    }
    else {
        console.error(`WebSocket is not open for type: ${type}`);
    }
}
function sendWsError(ws, errorMessage) {
    sendWsMessage(ws, 'mcpError', { error: errorMessage });
}
function markConnectionAsConnected(connection, serverInfo) {
    connection.status = 'connected';
    connection.serverInfo = serverInfo;
    sendWsMessage(connection.websocket, 'connectionStatus', {
        id: connection.id,
        name: connection.configName,
        status: 'connected',
        serverInfo: serverInfo
    });
}
async function handleReadResource(ws, connectionId, uri) {
    const connection = activeConnections.get(connectionId);
    if (!connection || connection.status !== 'connected') {
        console.warn(`[Backend] Attempting readResource for connection ${connectionId} which is not marked as fully connected (status: ${connection?.status}). Proceeding anyway...`);
        // If not connected, we likely can't fulfill the request.
        // Send an error back to the frontend for this specific request.
        sendWsMessage(ws, 'resourceContent', { connectionId, uri, error: `Server not connected.` });
        return;
    }
    try {
        // Corrected call: Pass arguments as an object
        const result = await connection.client.readResource({ uri });
        const firstContent = result.contents && result.contents.length > 0 ? result.contents[0] : null;
        sendWsMessage(ws, 'resourceContent', { connectionId, uri, content: firstContent });
    }
    catch (error) {
        console.error(`Error during readResource for ${uri} on ${connection.configName} (${connectionId}):`, error);
        // Send error specific to this request
        sendWsMessage(ws, 'resourceContent', { connectionId, uri, error: error instanceof Error ? error.message : String(error) });
    }
}
async function handleCallTool(ws, connectionId, toolName, args) {
    const connection = activeConnections.get(connectionId);
    if (!connection || connection.status !== 'connected') {
        console.warn(`[Backend] Attempting callTool for connection ${connectionId} which is not marked as fully connected (status: ${connection?.status}). Proceeding anyway...`);
        sendWsMessage(ws, 'toolResult', { connectionId, toolName, error: `Server not connected.` });
        return;
    }
    try {
        // Corrected call: Pass arguments as an object
        const result = await connection.client.callTool({ name: toolName, arguments: args });
        sendWsMessage(ws, 'toolResult', { connectionId, toolName, result: result }); // Send the whole result object
    }
    catch (error) {
        console.error(`Error during callTool for ${toolName} on ${connection.configName} (${connectionId}):`, error);
        sendWsMessage(ws, 'toolResult', { connectionId, toolName, error: error instanceof Error ? error.message : String(error) });
    }
}
async function handleGetPrompt(ws, connectionId, promptName, args) {
    const connection = activeConnections.get(connectionId);
    if (!connection || connection.status !== 'connected') {
        console.warn(`[Backend] Attempting getPrompt for connection ${connectionId} which is not marked as fully connected (status: ${connection?.status}). Proceeding anyway...`);
        sendWsMessage(ws, 'promptMessages', { connectionId, promptName, error: `Server not connected.` });
        return;
    }
    try {
        // Corrected call: Pass arguments as an object
        const result = await connection.client.getPrompt({ name: promptName, arguments: args });
        sendWsMessage(ws, 'promptMessages', { connectionId, promptName, messages: result.messages });
    }
    catch (error) {
        console.error(`Error during getPrompt for ${promptName} on ${connection.configName} (${connectionId}):`, error);
        sendWsMessage(ws, 'promptMessages', { connectionId, promptName, error: error instanceof Error ? error.message : String(error) });
    }
}
