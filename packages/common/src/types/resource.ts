/**
 * Resource descriptor uniquely identifies a resource
 */
export interface ResourceDescriptor {
    id: string;
    type: string;
}

/**
 * Resource metadata containing information about a resource
 */
export interface ResourceMetadata {
    descriptor: ResourceDescriptor;
    name: string;
    mimeType?: string;
    size?: number;
    createdAt: number;
    updatedAt: number;
    tags?: string[];
}

/**
 * Resource data interface
 */
export interface Resource {
    metadata: ResourceMetadata;
    data: Uint8Array | string | object;
}

/**
 * Resource query options for filtering resources
 */
export interface ResourceQueryOptions {
    type?: string;
    tags?: string[];
    namePattern?: string;
    limit?: number;
    offset?: number;
}

/**
 * Resource storage capabilities
 */
export enum ResourceStorageCapability {
    CREATE = 'create',
    READ = 'read',
    UPDATE = 'update',
    DELETE = 'delete',
    LIST = 'list',
    QUERY = 'query',
    PERSISTENT = 'persistent',
}

/**
 * Resource error types
 */
export enum ResourceErrorType {
    NOT_FOUND = 'resource_not_found',
    ALREADY_EXISTS = 'resource_already_exists',
    INVALID_RESOURCE = 'invalid_resource',
    PERMISSION_DENIED = 'permission_denied',
    STORAGE_ERROR = 'storage_error',
    UNKNOWN = 'unknown',
}

/**
 * Error class for resource operations
 */
export class ResourceError extends Error {
    constructor(
        public type: ResourceErrorType,
        message: string,
        public descriptor?: ResourceDescriptor
    ) {
        super(message);
        this.name = 'ResourceError';
    }
} 