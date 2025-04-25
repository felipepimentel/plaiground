import {
    Resource,
    ResourceDescriptor,
    ResourceError,
    ResourceErrorType,
    ResourceManager,
    ResourceMetadata,
    ResourceQueryOptions,
    ResourceStorageCapability
} from '@plaidev/common';

/**
 * In-memory implementation of the ResourceManager interface
 */
export class InMemoryResourceManager implements ResourceManager {
    private resources: Map<string, Resource> = new Map();

    constructor(private readonly capabilities: ResourceStorageCapability[] = [
        ResourceStorageCapability.CREATE,
        ResourceStorageCapability.READ,
        ResourceStorageCapability.UPDATE,
        ResourceStorageCapability.DELETE,
        ResourceStorageCapability.LIST,
        ResourceStorageCapability.QUERY,
    ]) { }

    getCapabilities(): ResourceStorageCapability[] {
        return [...this.capabilities];
    }

    hasCapability(capability: ResourceStorageCapability): boolean {
        return this.capabilities.includes(capability);
    }

    async createResource(resource: Resource): Promise<ResourceMetadata> {
        this.validateCapability(ResourceStorageCapability.CREATE);

        const { descriptor } = resource;
        const key = this.getResourceKey(descriptor);

        if (this.resources.has(key)) {
            throw new ResourceError(
                ResourceErrorType.ALREADY_EXISTS,
                `Resource with id ${descriptor.id} and type ${descriptor.type} already exists`,
                descriptor
            );
        }

        // Clone the resource to prevent external mutations
        const newResource = this.cloneResource(resource);

        // Set creation and update timestamp if not provided
        if (!newResource.createdAt) {
            newResource.createdAt = new Date();
        }

        if (!newResource.updatedAt) {
            newResource.updatedAt = new Date();
        }

        this.resources.set(key, newResource);

        return this.extractMetadata(newResource);
    }

    async getResource(descriptor: ResourceDescriptor): Promise<Resource> {
        this.validateCapability(ResourceStorageCapability.READ);

        const key = this.getResourceKey(descriptor);
        const resource = this.resources.get(key);

        if (!resource) {
            throw new ResourceError(
                ResourceErrorType.NOT_FOUND,
                `Resource with id ${descriptor.id} and type ${descriptor.type} not found`,
                descriptor
            );
        }

        return this.cloneResource(resource);
    }

    async getResourceMetadata(descriptor: ResourceDescriptor): Promise<ResourceMetadata> {
        this.validateCapability(ResourceStorageCapability.READ);

        const resource = await this.getResource(descriptor);
        return this.extractMetadata(resource);
    }

    async updateResource(resource: Resource): Promise<ResourceMetadata> {
        this.validateCapability(ResourceStorageCapability.UPDATE);

        const { descriptor } = resource;
        const key = this.getResourceKey(descriptor);

        if (!this.resources.has(key)) {
            throw new ResourceError(
                ResourceErrorType.NOT_FOUND,
                `Resource with id ${descriptor.id} and type ${descriptor.type} not found`,
                descriptor
            );
        }

        // Clone and update the resource
        const updatedResource = this.cloneResource(resource);

        // Preserve creation timestamp from the existing resource
        const existingResource = this.resources.get(key)!;
        updatedResource.createdAt = existingResource.createdAt;

        // Update the timestamp
        updatedResource.updatedAt = new Date();

        this.resources.set(key, updatedResource);

        return this.extractMetadata(updatedResource);
    }

    async deleteResource(descriptor: ResourceDescriptor): Promise<void> {
        this.validateCapability(ResourceStorageCapability.DELETE);

        const key = this.getResourceKey(descriptor);

        if (!this.resources.has(key)) {
            throw new ResourceError(
                ResourceErrorType.NOT_FOUND,
                `Resource with id ${descriptor.id} and type ${descriptor.type} not found`,
                descriptor
            );
        }

        this.resources.delete(key);
    }

    async listResources(options?: ResourceQueryOptions): Promise<ResourceMetadata[]> {
        this.validateCapability(ResourceStorageCapability.LIST);

        let resources = Array.from(this.resources.values());

        // Apply filters if options are provided
        if (options) {
            if (options.type) {
                resources = resources.filter(resource => resource.descriptor.type === options.type);
            }

            if (options.tags && options.tags.length > 0) {
                resources = resources.filter(resource => {
                    if (!resource.tags) return false;
                    return options.tags!.some(tag => resource.tags!.includes(tag));
                });
            }

            if (options.namePattern) {
                const pattern = new RegExp(options.namePattern, 'i');
                resources = resources.filter(resource => pattern.test(resource.name));
            }

            // Apply offset and limit
            if (options.offset !== undefined) {
                resources = resources.slice(options.offset);
            }

            if (options.limit !== undefined) {
                resources = resources.slice(0, options.limit);
            }
        }

        return resources.map(resource => this.extractMetadata(resource));
    }

    /**
     * Generate a unique key for a resource descriptor
     */
    private getResourceKey(descriptor: ResourceDescriptor): string {
        return `${descriptor.type}:${descriptor.id}`;
    }

    /**
     * Clone a resource to prevent external mutations
     */
    private cloneResource(resource: Resource): Resource {
        const cloned: Resource = {
            descriptor: { ...resource.descriptor },
            name: resource.name,
            data: this.cloneData(resource.data),
            createdAt: resource.createdAt ? new Date(resource.createdAt.getTime()) : undefined,
            updatedAt: resource.updatedAt ? new Date(resource.updatedAt.getTime()) : undefined,
        };

        if (resource.mimeType) {
            cloned.mimeType = resource.mimeType;
        }

        if (resource.size !== undefined) {
            cloned.size = resource.size;
        }

        if (resource.tags) {
            cloned.tags = [...resource.tags];
        }

        return cloned;
    }

    /**
     * Clone resource data based on its type
     */
    private cloneData(data: Resource['data']): Resource['data'] {
        if (data instanceof Uint8Array) {
            return new Uint8Array(data);
        } else if (typeof data === 'string') {
            return data;
        } else if (typeof data === 'object' && data !== null) {
            return JSON.parse(JSON.stringify(data));
        }
        return data;
    }

    /**
     * Extract metadata from a resource
     */
    private extractMetadata(resource: Resource): ResourceMetadata {
        const metadata: ResourceMetadata = {
            descriptor: { ...resource.descriptor },
            name: resource.name,
            createdAt: resource.createdAt,
            updatedAt: resource.updatedAt,
        };

        if (resource.mimeType) {
            metadata.mimeType = resource.mimeType;
        }

        if (resource.size !== undefined) {
            metadata.size = resource.size;
        }

        if (resource.tags) {
            metadata.tags = [...resource.tags];
        }

        return metadata;
    }

    /**
     * Validate that the manager has the required capability
     */
    private validateCapability(capability: ResourceStorageCapability): void {
        if (!this.hasCapability(capability)) {
            throw new ResourceError(
                ResourceErrorType.PERMISSION_DENIED,
                `Resource manager does not support the ${ResourceStorageCapability[capability]} capability`
            );
        }
    }
} 