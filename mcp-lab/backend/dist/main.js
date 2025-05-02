// MCP Lab Backend
// This will eventually host the MCP client logic
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { randomUUID } from 'crypto';
import fs from 'fs'; // Import fs for file reading
import path from 'path'; // Import path for resolving file path
// Use import.meta.url to get the current module's path
import { fileURLToPath } from 'url';
import { WebSocket, WebSocketServer } from 'ws';
import { closeWatchers, discoverServers, refreshServers } from './discovery.js';
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
let autoDiscoveredServers = new Map();
// Rate limiting for list requests
const listRequestRateLimits = new Map();
// Store connection config
let connectionConfig;
// Record of reconnection attempts for each server
const reconnectionAttempts = new Map();
// Add categories to the config loading
let categoryConfig;
/**
 * Load and parse the main configuration file
 */
async function loadServerConfigs() {
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
                // Handle auto-discovery if configured
                if (parsedConfig.autoDiscovery && typeof parsedConfig.autoDiscovery === 'object') {
                    const autoDiscoveryConfig = parsedConfig.autoDiscovery;
                    if (autoDiscoveryConfig.enabled) {
                        console.log('[Discovery] Auto-discovery enabled, scanning for servers...');
                        autoDiscoveredServers = await discoverServers(CONFIG_FILE_PATH, autoDiscoveryConfig);
                        console.log(`[Discovery] Found ${autoDiscoveredServers.size} auto-discovered MCP servers`);
                        // Set up event listener for hot reload if enabled
                        if (autoDiscoveryConfig.hotReload?.enabled) {
                            process.on('mcp:reload', async ({ directory }) => {
                                console.log(`[HotReload] Refreshing servers from ${directory}`);
                                const result = await refreshServers(CONFIG_FILE_PATH, autoDiscoveryConfig, autoDiscoveredServers);
                                // Handle changed servers
                                if (result.changes && result.changes.size > 0) {
                                    // Update the server map with new/changed servers
                                    for (const [name, server] of result.changes.entries()) {
                                        autoDiscoveredServers.set(name, server);
                                        // Disconnect any existing connections to this server
                                        disconnectServerConnections(name);
                                    }
                                    // Notify all connected WebSocket clients about server list changes
                                    const connectedWebSockets = getConnectedWebSockets();
                                    for (const ws of connectedWebSockets) {
                                        sendConfiguredServersList(ws);
                                    }
                                    // Auto-connect to newly discovered servers if enabled
                                    if (connectionConfig?.autoConnect.enabled && connectionConfig.autoConnect.onDiscovery) {
                                        // Get the first connected WebSocket for auto-connect
                                        const websocket = Array.from(connectedWebSockets)[0];
                                        if (websocket) {
                                            // Only auto-connect to newly discovered servers
                                            const changedServerNames = Array.from(result.changes.keys());
                                            const serverNamesToConnect = connectionConfig.autoConnect.servers.length > 0
                                                ? changedServerNames.filter(name => connectionConfig.autoConnect.servers.includes(name))
                                                : changedServerNames;
                                            if (serverNamesToConnect.length > 0) {
                                                console.log(`[AutoConnect] Auto-connecting to newly discovered servers: ${serverNamesToConnect.join(', ')}`);
                                                // Connect to each server with a slight delay between connections
                                                for (let i = 0; i < serverNamesToConnect.length; i++) {
                                                    const serverName = serverNamesToConnect[i];
                                                    console.log(`[AutoConnect] Connecting to server '${serverName}'`);
                                                    await handleConnectConfigured(websocket, serverName);
                                                    // Add a small delay between connections
                                                    if (i < serverNamesToConnect.length - 1) {
                                                        await new Promise(resolve => setTimeout(resolve, 500));
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                                // Handle removed servers
                                if (result.removed && result.removed.size > 0) {
                                    for (const name of result.removed) {
                                        autoDiscoveredServers.delete(name);
                                        disconnectServerConnections(name);
                                    }
                                    // Notify all connected WebSocket clients about server list changes
                                    for (const ws of getConnectedWebSockets()) {
                                        sendConfiguredServersList(ws);
                                    }
                                }
                            });
                        }
                    }
                }
                if (parsedConfig.connection && typeof parsedConfig.connection === 'object') {
                    connectionConfig = parsedConfig.connection;
                    console.log('[Config] Connection configuration loaded:', connectionConfig);
                }
                // Modify loadServerConfigs function to load category configuration
                if (parsedConfig.categories && typeof parsedConfig.categories === 'object') {
                    categoryConfig = parsedConfig.categories;
                    console.log('[Config] Category configuration loaded:', categoryConfig);
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
await loadServerConfigs();
const activeConnections = new Map();
/**
 * Get a merged map of all MCP servers (configured + auto-discovered)
 */
function getAllServers() {
    const allServers = new Map();
    // Add manually configured servers
    for (const [name, config] of configuredServers.entries()) {
        allServers.set(name, config);
    }
    // Add auto-discovered servers (will override manual configs with same name)
    for (const [name, config] of autoDiscoveredServers.entries()) {
        allServers.set(name, config);
    }
    return allServers;
}
/**
 * Get all active WebSocket connections
 */
function getConnectedWebSockets() {
    const sockets = new Set();
    for (const conn of activeConnections.values()) {
        if (conn.websocket && conn.websocket.readyState === WebSocket.OPEN) {
            sockets.add(conn.websocket);
        }
    }
    return sockets;
}
/**
 * Disconnect all active connections to a specific server
 */
function disconnectServerConnections(serverName) {
    const connectionsToClose = Array.from(activeConnections.entries())
        .filter(([_, conn]) => conn.configName === serverName);
    for (const [id, conn] of connectionsToClose) {
        console.log(`[HotReload] Disconnecting server connection ${id} (${serverName})`);
        handleDisconnect(id);
        // Notify UI of disconnect
        if (conn.websocket && conn.websocket.readyState === WebSocket.OPEN) {
            sendWsMessage(conn.websocket, 'connectionStatus', {
                id,
                name: serverName,
                status: 'disconnected',
                message: 'Server disconnected due to hot reload'
            });
        }
    }
}
// Create a function to start the WebSocket server
function startWebSocketServer() {
    try {
        const wss = new WebSocketServer({ port: WS_PORT });
        console.log(`WebSocket server started successfully on ws://localhost:${WS_PORT}`);
        wss.on('connection', (ws) => {
            console.log('Frontend connected via WebSocket.');
            // Send the list of configured servers on new connection immediately
            sendConfiguredServersList(ws);
            // Auto-connect to servers if enabled for startup
            if (connectionConfig?.autoConnect.enabled && connectionConfig.autoConnect.onStartup) {
                // Slight delay to ensure the frontend has initialized
                setTimeout(() => autoConnectServers(ws), 1000);
            }
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
                        // New method for refreshing servers
                        else if (data.method === 'refreshServers') {
                            console.log('[Backend] Received request to refresh servers');
                            await loadServerConfigs(); // Reload config and auto-discovered servers
                            sendConfiguredServersList(ws); // Send updated list
                            // Send a proper JSON-RPC 2.0 response
                            const response = {
                                jsonrpc: '2.0',
                                id: data.id,
                                result: { success: true }
                            };
                            ws.send(JSON.stringify(response));
                            return;
                        }
                        // Add handlers for other MCP methods as needed
                    }
                    // --- Handle our legacy internal message types ---
                    if (data.type === 'getConfiguredServers') {
                        sendConfiguredServersList(ws);
                    }
                    else if (data.type === 'refreshServers') {
                        await loadServerConfigs(); // Reload config and auto-discovered servers
                        sendConfiguredServersList(ws); // Send updated list
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
    const allServers = getAllServers();
    const serverList = Array.from(allServers.values());
    console.log(`Sending configuredServersList to frontend. Count: ${serverList.length}`);
    sendWsMessage(ws, 'configuredServersList', {
        servers: serverList,
        categoryConfig // Include category configuration 
    });
}
// Modify handleConnectConfigured to use serverName and the config map
async function handleConnectConfigured(ws, serverName) {
    const allServers = getAllServers();
    const config = allServers.get(serverName);
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
    // Create a unique ID for this connection
    const connectionId = randomUUID();
    console.log(`[Backend] Creating new MCP connection ${configName} (${connectionId})`);
    let transport;
    let client;
    let connection = null;
    try {
        // Inform UI that we're starting to connect
        sendWsMessage(ws, 'connectionStatus', {
            id: connectionId,
            name: configName,
            status: 'connecting'
        });
        // Create a transport and client
        transport = new StdioClientTransport({
            command,
            args,
            cwd: configCwd
        });
        // Initialize client with required parameters
        client = new Client({
            name: "MCP Lab",
            version: "1.0.0"
        });
        // Store this connection
        connection = {
            id: connectionId,
            configName,
            client,
            transport,
            websocket: ws,
            status: 'connecting'
        };
        activeConnections.set(connectionId, connection);
        // Connect
        console.log(`[Backend] Connecting to MCP server at ${command} ${args.join(' ')})`);
        await client.connect(transport);
        console.log(`[Backend] Connected to server ${configName} (${connectionId}) successfully.`);
        // This delay ensures the server has time to fully initialize before requesting capabilities
        setTimeout(async () => {
            try {
                console.log(`[Backend] Initializing MCP client for ${configName} (${connectionId})...`);
                // Debug log the client structure
                console.log(`[Debug] Client object structure:`, JSON.stringify(Object.keys(client)));
                // Use a safer approach to get capabilities
                const serverCapabilities = [];
                // Try to get tools capability
                try {
                    const toolsResult = await client.listTools();
                    console.log(`[Debug] Tools result:`, toolsResult);
                    if (toolsResult && toolsResult.tools) {
                        serverCapabilities.push('tools');
                    }
                }
                catch (err) {
                    console.log(`[Debug] Tools not supported:`, err);
                }
                // Try to get resources capability
                try {
                    const resourcesResult = await client.listResources();
                    console.log(`[Debug] Resources result:`, resourcesResult);
                    if (resourcesResult && resourcesResult.resources) {
                        serverCapabilities.push('resources');
                    }
                }
                catch (err) {
                    console.log(`[Debug] Resources not supported:`, err);
                }
                // Try to get prompts capability
                try {
                    const promptsResult = await client.listPrompts();
                    console.log(`[Debug] Prompts result:`, promptsResult);
                    if (promptsResult && promptsResult.prompts) {
                        serverCapabilities.push('prompts');
                    }
                }
                catch (err) {
                    console.log(`[Debug] Prompts not supported:`, err);
                }
                console.log(`[Backend] Successfully initialized MCP client for ${configName} (${connectionId}).`);
                console.log(`[Backend] Server capabilities:`, serverCapabilities);
                // Create SimpleServerInfo from server info
                const serverInfo = {
                    name: configName,
                    version: "unknown",
                    capabilities: serverCapabilities
                };
                if (connection && connection.status === 'connecting') {
                    // Mark this connection as connected
                    markConnectionAsConnected(connection, serverInfo);
                    // Log if any capabilities are missing
                    const expectedCapabilities = ['resources', 'tools', 'prompts'];
                    const missingCapabilities = expectedCapabilities.filter(cap => !serverInfo.capabilities.includes(cap));
                    if (missingCapabilities.length > 0) {
                        console.warn(`[Backend] Server ${configName} is missing capabilities: ${missingCapabilities.join(', ')}`);
                        sendWsMessage(ws, 'mcpLog', {
                            connectionId,
                            message: `Server is missing capabilities: ${missingCapabilities.join(', ')}`
                        });
                    }
                    // No need to request these again as we've already tried them above
                    // Just update the connection data if we have it
                    if (serverCapabilities.includes('tools')) {
                        const toolsResult = await client.listTools();
                        sendWsMessage(ws, 'toolsList', {
                            connectionId,
                            data: { tools: toolsResult.tools }
                        });
                    }
                    if (serverCapabilities.includes('resources')) {
                        const resourcesResult = await client.listResources();
                        sendWsMessage(ws, 'resourcesList', {
                            connectionId,
                            data: { resources: resourcesResult.resources }
                        });
                    }
                    if (serverCapabilities.includes('prompts')) {
                        const promptsResult = await client.listPrompts();
                        sendWsMessage(ws, 'promptsList', {
                            connectionId,
                            data: { prompts: promptsResult.prompts }
                        });
                    }
                }
            }
            catch (err) {
                console.error(`[Backend] Failed to initialize MCP client for ${configName}:`, err);
                sendWsError(ws, `Error initializing client for ${configName}: ${err}`);
            }
        }, 1000);
    }
    catch (error) {
        console.error(`[Backend] Error connecting to server ${configName}:`, error);
        sendWsMessage(ws, 'connectionStatus', {
            id: connectionId,
            name: configName,
            status: 'error',
            error: `Connection error: ${error}`
        });
        if (connection) {
            connection.status = 'error';
            // Remove after a delay to allow error message propagation
            setTimeout(() => {
                activeConnections.delete(connectionId);
            }, 5000);
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
        // If this wasn't a user-initiated disconnect and reconnect is enabled, try to reconnect
        if (previousStatus === 'error' && connectionConfig?.reconnect.enabled) {
            handleAutoReconnect(connection.websocket, connection.configName);
        }
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
// Add a cleanup handler for proper shutdown
process.on('SIGINT', () => {
    console.log('Shutting down MCP Lab backend...');
    closeWatchers();
    process.exit(0);
});
/**
 * Auto-connect to servers based on configuration
 */
async function autoConnectServers(websocket) {
    if (!connectionConfig?.autoConnect.enabled) {
        console.log('[AutoConnect] Auto-connect disabled, skipping');
        return;
    }
    const allServers = getAllServers();
    const serverNames = connectionConfig.autoConnect.servers.length > 0
        ? connectionConfig.autoConnect.servers
        : Array.from(allServers.keys());
    console.log(`[AutoConnect] Auto-connecting to servers: ${serverNames.join(', ')}`);
    // Connect to each server with a slight delay between connections
    for (let i = 0; i < serverNames.length; i++) {
        const serverName = serverNames[i];
        const server = allServers.get(serverName);
        if (!server) {
            console.warn(`[AutoConnect] Server '${serverName}' not found in configuration`);
            continue;
        }
        // Check if already connected
        const existingConnection = Array.from(activeConnections.values()).find(conn => conn.configName === serverName && conn.status !== 'disconnected' && conn.status !== 'error');
        if (existingConnection) {
            console.log(`[AutoConnect] Server '${serverName}' is already connected/connecting, skipping`);
            continue;
        }
        console.log(`[AutoConnect] Connecting to server '${serverName}'`);
        await handleConnectConfigured(websocket, serverName);
        // Add a small delay between connections to avoid overwhelming the system
        if (i < serverNames.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 500));
        }
    }
}
/**
 * Handle auto-reconnection for a disconnected server
 */
async function handleAutoReconnect(websocket, serverName) {
    if (!connectionConfig?.reconnect.enabled) {
        return;
    }
    const attempts = reconnectionAttempts.get(serverName) || 0;
    if (attempts >= connectionConfig.reconnect.maxAttempts) {
        console.log(`[Reconnect] Maximum reconnection attempts (${connectionConfig.reconnect.maxAttempts}) reached for '${serverName}'`);
        reconnectionAttempts.delete(serverName);
        return;
    }
    console.log(`[Reconnect] Attempting to reconnect to '${serverName}' (attempt ${attempts + 1}/${connectionConfig.reconnect.maxAttempts})`);
    reconnectionAttempts.set(serverName, attempts + 1);
    // Wait before reconnecting
    await new Promise(resolve => setTimeout(resolve, connectionConfig.reconnect.delayMs));
    // Check if any existing connection exists before reconnecting
    const existingConnection = Array.from(activeConnections.values()).find(conn => conn.configName === serverName && (conn.status === 'connected' || conn.status === 'connecting'));
    if (existingConnection) {
        console.log(`[Reconnect] Server '${serverName}' is already connected/connecting, cancelling reconnection`);
        reconnectionAttempts.delete(serverName);
        return;
    }
    try {
        await handleConnectConfigured(websocket, serverName);
        reconnectionAttempts.delete(serverName);
    }
    catch (error) {
        console.error(`[Reconnect] Failed to reconnect to '${serverName}':`, error);
    }
}
