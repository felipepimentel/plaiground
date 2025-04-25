import {
    Resource,
    ResourceDescriptor,
    ResourceMetadata,
    ResourceQueryOptions,
    ResourceStorageCapability
} from '../types/resource';

/**
 * Resource manager interface for handling resource operations
 */
export interface ResourceManager {
    /**
     * Get supported capabilities of this resource manager
     */
    getCapabilities(): ResourceStorageCapability[];

    /**
     * Check if the resource manager has a specific capability
     */
    hasCapability(capability: ResourceStorageCapability): boolean;

    /**
     * Create a new resource
     * @throws ResourceError if creation fails
     */
    createResource(resource: Resource): Promise<ResourceMetadata>;

    /**
     * Get a resource by its descriptor
     * @throws ResourceError if resource doesn't exist
     */
    getResource(descriptor: ResourceDescriptor): Promise<Resource>;

    /**
     * Get resource metadata by descriptor
     * @throws ResourceError if resource doesn't exist
     */
    getResourceMetadata(descriptor: ResourceDescriptor): Promise<ResourceMetadata>;

    /**
     * Update an existing resource
     * @throws ResourceError if resource doesn't exist
     */
    updateResource(resource: Resource): Promise<ResourceMetadata>;

    /**
     * Delete a resource by its descriptor
     * @throws ResourceError if resource doesn't exist
     */
    deleteResource(descriptor: ResourceDescriptor): Promise<void>;

    /**
     * List resources based on query options
     */
    listResources(options?: ResourceQueryOptions): Promise<ResourceMetadata[]>;
} 