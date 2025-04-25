import {
    Resource,
    ResourceDescriptor,
    ResourceError,
    ResourceErrorType,
    ResourceManager,
    ResourceMetadata,
    ResourceQueryOptions
} from '@plaidev/common';

/**
 * Interface for a registry that manages multiple resource managers
 */
export interface ResourceRegistryManager {
    /**
     * Register a resource manager for a specific resource type
     */
    registerManager(resourceType: string, manager: ResourceManager): void;

    /**
     * Unregister a resource manager for a specific resource type
     */
    unregisterManager(resourceType: string): void;

    /**
     * Get a resource manager for a specific resource type
     */
    getManager(resourceType: string): ResourceManager | undefined;

    /**
     * Check if a resource manager is registered for a specific resource type
     */
    hasManager(resourceType: string): boolean;

    /**
     * Create a resource using the appropriate manager based on the resource type
     */
    createResource(resource: Resource): Promise<ResourceMetadata>;

    /**
     * Get a resource using the appropriate manager based on the resource type
     */
    getResource(descriptor: ResourceDescriptor): Promise<Resource>;

    /**
     * Get resource metadata using the appropriate manager based on the resource type
     */
    getResourceMetadata(descriptor: ResourceDescriptor): Promise<ResourceMetadata>;

    /**
     * Update a resource using the appropriate manager based on the resource type
     */
    updateResource(resource: Resource): Promise<ResourceMetadata>;

    /**
     * Delete a resource using the appropriate manager based on the resource type
     */
    deleteResource(descriptor: ResourceDescriptor): Promise<void>;

    /**
     * List resources across all managers, optionally filtered by query options
     */
    listResources(options?: ResourceQueryOptions): Promise<ResourceMetadata[]>;
}

/**
 * Implementation of the ResourceRegistryManager interface
 */
export class DefaultResourceRegistryManager implements ResourceRegistryManager {
    private managers: Map<string, ResourceManager> = new Map();

    registerManager(resourceType: string, manager: ResourceManager): void {
        this.managers.set(resourceType, manager);
    }

    unregisterManager(resourceType: string): void {
        this.managers.delete(resourceType);
    }

    getManager(resourceType: string): ResourceManager | undefined {
        return this.managers.get(resourceType);
    }

    hasManager(resourceType: string): boolean {
        return this.managers.has(resourceType);
    }

    async createResource(resource: Resource): Promise<ResourceMetadata> {
        const manager = this.getManagerOrThrow(resource.descriptor.type);
        return manager.createResource(resource);
    }

    async getResource(descriptor: ResourceDescriptor): Promise<Resource> {
        const manager = this.getManagerOrThrow(descriptor.type);
        return manager.getResource(descriptor);
    }

    async getResourceMetadata(descriptor: ResourceDescriptor): Promise<ResourceMetadata> {
        const manager = this.getManagerOrThrow(descriptor.type);
        return manager.getResourceMetadata(descriptor);
    }

    async updateResource(resource: Resource): Promise<ResourceMetadata> {
        const manager = this.getManagerOrThrow(resource.descriptor.type);
        return manager.updateResource(resource);
    }

    async deleteResource(descriptor: ResourceDescriptor): Promise<void> {
        const manager = this.getManagerOrThrow(descriptor.type);
        return manager.deleteResource(descriptor);
    }

    async listResources(options?: ResourceQueryOptions): Promise<ResourceMetadata[]> {
        // If type is specified, only query that specific manager
        if (options?.type && this.hasManager(options.type)) {
            const manager = this.getManager(options.type)!;
            return manager.listResources(options);
        }

        // Otherwise, query all managers and combine results
        const allPromises = Array.from(this.managers.entries()).map(async ([type, manager]) => {
            // Create a copy of options with the type set to the current manager's type
            const managerOptions = options
                ? { ...options, type }
                : { type };

            try {
                return await manager.listResources(managerOptions);
            } catch (error) {
                console.error(`Error listing resources from manager for type ${type}:`, error);
                return [] as ResourceMetadata[];
            }
        });

        const results = await Promise.all(allPromises);

        // Flatten the results
        let allResources = results.flat();

        // Apply any remaining filters that weren't applied by individual managers
        if (options) {
            // Apply offset and limit here after combining all results
            if (options.offset !== undefined) {
                allResources = allResources.slice(options.offset);
            }

            if (options.limit !== undefined) {
                allResources = allResources.slice(0, options.limit);
            }
        }

        return allResources;
    }

    /**
     * Get a manager for a resource type or throw if not found
     */
    private getManagerOrThrow(resourceType: string): ResourceManager {
        const manager = this.getManager(resourceType);

        if (!manager) {
            throw new ResourceError(
                ResourceErrorType.INVALID_RESOURCE_TYPE,
                `No resource manager registered for type: ${resourceType}`
            );
        }

        return manager;
    }
} 