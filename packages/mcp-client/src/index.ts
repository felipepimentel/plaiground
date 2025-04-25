/**
 * Plaiground MCP Client
 * 
 * This package provides a client implementation for the Model Context Protocol (MCP).
 * It handles connection management, protocol messaging, and provides a high-level API
 * for interacting with MCP servers.
 */

// Export main client
export { McpClient, ResourceSubscription, ResourceSubscriptionCallback } from './client/mcp-client';

// Export connection interfaces
export {
    ConnectionEvent,
    ConnectionEventHandler, ConnectionStatus
} from './connection/connection-manager';

// Export transport interfaces and config
export { HttpSseTransportConfig } from './connection/http-sse-transport';
export {
    McpTransport, McpTransportConfig, McpTransportEvent,
    McpTransportEventHandler
} from './connection/transport';
export { WebSocketTransportConfig } from './connection/websocket-transport';

// Export version
export const VERSION = '0.1.0'; 