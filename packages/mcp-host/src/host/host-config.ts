/**
 * Configuration for the MCP Host
 */
export interface HostConfig {
    /**
     * Host name (used for identification)
     */
    name: string;

    /**
     * Host version
     */
    version: string;

    /**
     * Host description
     */
    description?: string;

    /**
     * Default timeout for requests in milliseconds
     */
    defaultRequestTimeout?: number;

    /**
     * Default user ID if not specified
     */
    defaultUserId?: string;

    /**
     * Whether to automatically grant permissions to resources
     */
    autoGrantPermissions?: boolean;

    /**
     * Whether to allow multiple clients with the same ID
     */
    allowDuplicateClientIds?: boolean;

    /**
     * Maximum number of clients per user
     */
    maxClientsPerUser?: number;

    /**
     * Session timeout in milliseconds (0 = never)
     */
    sessionTimeout?: number;

    /**
     * Event logging configuration
     */
    logging?: {
        /**
         * Whether to log connection events
         */
        connections?: boolean;

        /**
         * Whether to log session events
         */
        sessions?: boolean;

        /**
         * Whether to log permission events
         */
        permissions?: boolean;

        /**
         * Whether to log request/response events
         */
        requests?: boolean;
    };
}

/**
 * Default host configuration
 */
export const DEFAULT_HOST_CONFIG: HostConfig = {
    name: 'MCP Host',
    version: '0.1.0',
    description: 'Model Context Protocol Host',
    defaultRequestTimeout: 30000,
    defaultUserId: 'anonymous',
    autoGrantPermissions: false,
    allowDuplicateClientIds: false,
    maxClientsPerUser: 10,
    sessionTimeout: 0, // never
    logging: {
        connections: true,
        sessions: true,
        permissions: true,
        requests: false,
    },
}; 