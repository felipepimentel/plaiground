// MCP Lab Backend
// This will eventually host the MCP client logic
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { randomUUID } from 'crypto';
import { WebSocket, WebSocketServer } from 'ws';
console.log("MCP Lab Backend Starting...");
const WS_PORT = 8080; // Port for WebSocket communication with frontend
const activeConnections = new Map();
const wss = new WebSocketServer({ port: WS_PORT });
console.log(`WebSocket server started on ws://localhost:${WS_PORT}`);
wss.on('connection', (ws) => {
    console.log('Frontend connected via WebSocket.');
    ws.on('message', async (message) => {
        const rawMessage = message.toString();
        console.log('[WS RECV RAW]:', rawMessage); // Log raw incoming message
        sendWsMessage(ws, 'rawLog', { direction: 'recv', data: rawMessage });
        try {
            const data = JSON.parse(rawMessage);
            console.log('Received message from frontend:', data);
            if (data.type === 'connectStdio') {
                const { command, args } = data.payload;
                if (typeof command === 'string' && Array.isArray(args)) {
                    await handleConnectStdio(ws, command, args);
                }
                else {
                    sendWsError(ws, 'Invalid payload for connectStdio');
                }
            }
            else if (data.type === 'disconnect') {
                const { connectionId } = data.payload;
                if (typeof connectionId === 'string') {
                    handleDisconnect(connectionId);
                }
            }
            else if (data.type === 'listResources') {
                await handleListRequest(ws, data.payload?.connectionId, 'listResources', 'resourcesList');
            }
            else if (data.type === 'listTools') {
                await handleListRequest(ws, data.payload?.connectionId, 'listTools', 'toolsList');
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
async function handleConnectStdio(ws, command, args) {
    const connectionId = randomUUID();
    console.log(`Attempting to connect MCP server (id: ${connectionId}) via stdio: ${command} ${args.join(' ')}`);
    let connection = undefined;
    try {
        sendWsMessage(ws, 'connectionStatus', { id: connectionId, name: command, status: 'connecting' });
        const transport = new StdioClientTransport({ command, args });
        const handlers = {
            initialized: (event) => {
                if (!connection)
                    return;
                console.log(`MCP Client ${connection.id} Initialized. Server: ${event.serverInfo.name} v${event.serverInfo.version}`);
                connection.status = 'connected';
                connection.serverInfo = event.serverInfo;
                sendWsMessage(connection.websocket, 'connectionStatus', {
                    id: connection.id,
                    name: connection.command,
                    status: 'connected',
                    serverInfo: event.serverInfo,
                    capabilities: event.serverInfo.capabilities
                });
            },
            protocolError: (event) => {
                if (!connection)
                    return;
                console.error(`MCP Protocol Error (${connection.id}):`, event.error);
                sendWsMessage(connection.websocket, 'mcpError', { connectionId: connection.id, error: event.error });
            },
            close: (event) => {
                if (!connection)
                    return;
                console.log(`MCP Connection ${connection.id} Closed:`, event.reason);
                connection.status = 'disconnected';
                sendWsMessage(connection.websocket, 'connectionStatus', { id: connection.id, status: 'disconnected', reason: event.reason });
                activeConnections.delete(connection.id);
            },
            log: (event) => {
                if (!connection)
                    return;
                console.log(`MCP Log (${connection.id}): [${event.level}]`, event.message);
                sendWsMessage(connection.websocket, 'mcpLog', { connectionId: connection.id, message: event.message, level: event.level });
            },
            'resources/listChanged': () => {
                if (!connection || connection.status !== 'connected')
                    return;
                console.log(`MCP Event (${connection.id}): resources/listChanged received.`);
                handleListRequest(connection.websocket, connection.id, 'listResources', 'resourcesList', true);
            },
            'tools/listChanged': () => {
                if (!connection || connection.status !== 'connected')
                    return;
                console.log(`MCP Event (${connection.id}): tools/listChanged received.`);
                handleListRequest(connection.websocket, connection.id, 'listTools', 'toolsList', true);
            },
            'prompts/listChanged': () => {
                if (!connection || connection.status !== 'connected')
                    return;
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
            status: 'connecting',
        };
        activeConnections.set(connectionId, connection);
        await client.connect(transport);
        console.log(`MCP Connection ${connectionId} establishment process initiated.`);
    }
    catch (error) {
        console.error(`Failed to connect MCP server ${connectionId}:`, error);
        if (connection) {
            activeConnections.delete(connectionId);
            connection.status = 'error';
        }
        sendWsMessage(ws, 'connectionStatus', { id: connectionId, name: command, status: 'error', error: error instanceof Error ? error.message : String(error) });
    }
}
async function handleListRequest(ws, connectionId, clientMethod, responseType, isNotification = false) {
    if (!connectionId) {
        if (!isNotification)
            sendWsError(ws, `Missing connectionId for ${clientMethod}`);
        return;
    }
    const connection = activeConnections.get(connectionId);
    if (!connection || connection.status !== 'connected') {
        if (!isNotification)
            sendWsError(ws, `Invalid or not connected connectionId: ${connectionId} for ${clientMethod}`);
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
        console.error(`Error during ${clientMethod} for ${connectionId}:`, error);
        sendWsMessage(ws, 'mcpError', { connectionId, operation: clientMethod, error: error instanceof Error ? error.message : String(error) });
    }
}
function handleDisconnect(connectionId) {
    const connection = activeConnections.get(connectionId);
    if (connection && connection.status !== 'disconnected') {
        console.log(`Disconnecting MCP server ${connectionId}...`);
        connection.status = 'disconnected';
        connection.client.close().catch((err) => {
            console.error(`Error during explicit close for MCP connection ${connectionId}:`, err);
        });
    }
    else if (!connection) {
        console.warn(`Attempted to disconnect non-existent connection: ${connectionId}`);
    }
    else {
        console.log(`Connection ${connectionId} already disconnecting/disconnected.`);
    }
}
function sendWsMessage(ws, type, payload) {
    if (ws.readyState === WebSocket.OPEN) {
        const messageToSend = JSON.stringify({ type, payload });
        console.log('[WS SEND RAW]:', messageToSend);
        if (type !== 'rawLog') {
            try {
                ws.send(JSON.stringify({ type: 'rawLog', payload: { direction: 'send', data: messageToSend } }));
            }
            catch (e) {
                console.error("Failed to send rawLog message:", e);
            }
        }
        try {
            ws.send(messageToSend);
        }
        catch (e) {
            console.error(`Failed to send message of type ${type}:`, e);
        }
    }
    else {
        console.warn(`WebSocket not open. Cannot send message type: ${type}`);
    }
}
function sendWsError(ws, message) {
    sendWsMessage(ws, 'error', { message });
}
async function handleReadResource(ws, connectionId, uri) {
    const connection = activeConnections.get(connectionId);
    if (!connection || connection.status !== 'connected') {
        sendWsError(ws, `Invalid or not connected connectionId: ${connectionId} for readResource`);
        return;
    }
    try {
        const result = await connection.client.readResource({ uri });
        const firstContent = result.contents && result.contents.length > 0 ? result.contents[0] : null;
        sendWsMessage(ws, 'resourceContent', { connectionId, uri, content: firstContent });
    }
    catch (error) {
        console.error(`Error during readResource for ${uri} on ${connectionId}:`, error);
        sendWsMessage(ws, 'resourceContent', { connectionId, uri, error: error instanceof Error ? error.message : String(error) });
    }
}
async function handleCallTool(ws, connectionId, toolName, args) {
    const connection = activeConnections.get(connectionId);
    if (!connection || connection.status !== 'connected') {
        sendWsError(ws, `Invalid or not connected connectionId: ${connectionId} for callTool`);
        return;
    }
    try {
        const result = await connection.client.callTool({ name: toolName, arguments: args });
        sendWsMessage(ws, 'toolResult', { connectionId, toolName, result: result });
    }
    catch (error) {
        console.error(`Error during callTool for ${toolName} on ${connectionId}:`, error);
        sendWsMessage(ws, 'toolResult', { connectionId, toolName, error: error instanceof Error ? error.message : String(error) });
    }
}
async function handleGetPrompt(ws, connectionId, promptName, args) {
    const connection = activeConnections.get(connectionId);
    if (!connection || connection.status !== 'connected') {
        sendWsError(ws, `Invalid or not connected connectionId: ${connectionId} for getPrompt`);
        return;
    }
    try {
        const result = await connection.client.getPrompt({ name: promptName, arguments: args });
        sendWsMessage(ws, 'promptMessages', { connectionId, promptName, messages: result.messages });
    }
    catch (error) {
        console.error(`Error during getPrompt for ${promptName} on ${connectionId}:`, error);
        sendWsMessage(ws, 'promptMessages', { connectionId, promptName, error: error instanceof Error ? error.message : String(error) });
    }
}
console.log("Backend setup complete. Waiting for frontend connections...");
