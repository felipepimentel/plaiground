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
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

/**
 * File system implementation of the ResourceManager interface
 * Persists resources to disk in a specified directory
 */
export class FileSystemResourceManager implements ResourceManager {
    private basePath: string;
    private metadataCache: Map<string, ResourceMetadata> = new Map();
    private initialized = false;

    constructor(
        storagePath: string,
        private readonly capabilities: ResourceStorageCapability[] = [
            ResourceStorageCapability.CREATE,
            ResourceStorageCapability.READ,
            ResourceStorageCapability.UPDATE,
            ResourceStorageCapability.DELETE,
            ResourceStorageCapability.LIST,
            ResourceStorageCapability.QUERY,
            ResourceStorageCapability.PERSISTENT,
        ]
    ) {
        this.basePath = path.resolve(storagePath);
    }

    /**
     * Initialize the resource manager
     * Creates the storage directory if it doesn't exist and loads metadata cache
     */
    async initialize(): Promise<void> {
        if (this.initialized) return;

        // Create directory if it doesn't exist
        if (!fs.existsSync(this.basePath)) {
            fs.mkdirSync(this.basePath, { recursive: true });
        }

        // Create metadata directory if it doesn't exist
        const metadataDir = path.join(this.basePath, '_metadata');
        if (!fs.existsSync(metadataDir)) {
            fs.mkdirSync(metadataDir, { recursive: true });
        }

        // Load existing metadata
        await this.loadMetadataCache();

        this.initialized = true;
    }

    getCapabilities(): ResourceStorageCapability[] {
        return [...this.capabilities];
    }

    hasCapability(capability: ResourceStorageCapability): boolean {
        return this.capabilities.includes(capability);
    }

    async createResource(resource: Resource): Promise<ResourceMetadata> {
        await this.ensureInitialized();
        this.validateCapability(ResourceStorageCapability.CREATE);

        const { descriptor } = resource;
        const key = this.getResourceKey(descriptor);

        if (this.metadataCache.has(key)) {
            throw new ResourceError(
                ResourceErrorType.ALREADY_EXISTS,
                `Resource with id ${descriptor.id} and type ${descriptor.type} already exists`,
                descriptor
            );
        }

        // Set creation and update timestamp if not provided
        if (!resource.createdAt) {
            resource.createdAt = new Date();
        }

        if (!resource.updatedAt) {
            resource.updatedAt = new Date();
        }

        // Save the resource data and metadata
        await this.saveResourceToDisk(resource);

        const metadata = this.extractMetadata(resource);
        this.metadataCache.set(key, metadata);

        return metadata;
    }

    async getResource(descriptor: ResourceDescriptor): Promise<Resource> {
        await this.ensureInitialized();
        this.validateCapability(ResourceStorageCapability.READ);

        const key = this.getResourceKey(descriptor);
        const metadata = this.metadataCache.get(key);

        if (!metadata) {
            throw new ResourceError(
                ResourceErrorType.NOT_FOUND,
                `Resource with id ${descriptor.id} and type ${descriptor.type} not found`,
                descriptor
            );
        }

        // Load the resource data from disk
        const dataPath = this.getResourceDataPath(descriptor);

        if (!fs.existsSync(dataPath)) {
            throw new ResourceError(
                ResourceErrorType.STORAGE_ERROR,
                `Resource data file not found for ${descriptor.id} of type ${descriptor.type}`,
                descriptor
            );
        }

        let data: Resource['data'];

        try {
            const fileContent = fs.readFileSync(dataPath);
            data = this.deserializeData(fileContent, metadata.mimeType);
        } catch (error) {
            throw new ResourceError(
                ResourceErrorType.STORAGE_ERROR,
                `Failed to read resource data: ${error.message}`,
                descriptor
            );
        }

        return {
            ...metadata,
            data
        };
    }

    async getResourceMetadata(descriptor: ResourceDescriptor): Promise<ResourceMetadata> {
        await this.ensureInitialized();
        this.validateCapability(ResourceStorageCapability.READ);

        const key = this.getResourceKey(descriptor);
        const metadata = this.metadataCache.get(key);

        if (!metadata) {
            throw new ResourceError(
                ResourceErrorType.NOT_FOUND,
                `Resource with id ${descriptor.id} and type ${descriptor.type} not found`,
                descriptor
            );
        }

        return { ...metadata };
    }

    async updateResource(resource: Resource): Promise<ResourceMetadata> {
        await this.ensureInitialized();
        this.validateCapability(ResourceStorageCapability.UPDATE);

        const { descriptor } = resource;
        const key = this.getResourceKey(descriptor);

        if (!this.metadataCache.has(key)) {
            throw new ResourceError(
                ResourceErrorType.NOT_FOUND,
                `Resource with id ${descriptor.id} and type ${descriptor.type} not found`,
                descriptor
            );
        }

        // Get existing metadata
        const existingMetadata = this.metadataCache.get(key)!;

        // Update resource with preserved creation time
        const updatedResource = {
            ...resource,
            createdAt: existingMetadata.createdAt,
            updatedAt: new Date()
        };

        // Save the updated resource
        await this.saveResourceToDisk(updatedResource);

        // Update the metadata cache
        const metadata = this.extractMetadata(updatedResource);
        this.metadataCache.set(key, metadata);

        return metadata;
    }

    async deleteResource(descriptor: ResourceDescriptor): Promise<void> {
        await this.ensureInitialized();
        this.validateCapability(ResourceStorageCapability.DELETE);

        const key = this.getResourceKey(descriptor);

        if (!this.metadataCache.has(key)) {
            throw new ResourceError(
                ResourceErrorType.NOT_FOUND,
                `Resource with id ${descriptor.id} and type ${descriptor.type} not found`,
                descriptor
            );
        }

        // Delete data file
        const dataPath = this.getResourceDataPath(descriptor);
        if (fs.existsSync(dataPath)) {
            fs.unlinkSync(dataPath);
        }

        // Delete metadata file
        const metadataPath = this.getResourceMetadataPath(descriptor);
        if (fs.existsSync(metadataPath)) {
            fs.unlinkSync(metadataPath);
        }

        // Remove from cache
        this.metadataCache.delete(key);
    }

    async listResources(options?: ResourceQueryOptions): Promise<ResourceMetadata[]> {
        await this.ensureInitialized();
        this.validateCapability(ResourceStorageCapability.LIST);

        let resources = Array.from(this.metadataCache.values());

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

        return resources.map(metadata => ({ ...metadata }));
    }

    /**
     * Ensure the manager is initialized before performing operations
     */
    private async ensureInitialized(): Promise<void> {
        if (!this.initialized) {
            await this.initialize();
        }
    }

    /**
     * Generate a unique key for a resource descriptor
     */
    private getResourceKey(descriptor: ResourceDescriptor): string {
        return `${descriptor.type}:${descriptor.id}`;
    }

    /**
     * Get the file path for a resource's data
     */
    private getResourceDataPath(descriptor: ResourceDescriptor): string {
        // Create a hash of the key to avoid file system issues with special characters
        const key = this.getResourceKey(descriptor);
        const hash = crypto.createHash('md5').update(key).digest('hex');
        return path.join(this.basePath, `${hash}.data`);
    }

    /**
     * Get the file path for a resource's metadata
     */
    private getResourceMetadataPath(descriptor: ResourceDescriptor): string {
        const key = this.getResourceKey(descriptor);
        const hash = crypto.createHash('md5').update(key).digest('hex');
        return path.join(this.basePath, '_metadata', `${hash}.json`);
    }

    /**
     * Save a resource to disk
     */
    private async saveResourceToDisk(resource: Resource): Promise<void> {
        const dataPath = this.getResourceDataPath(resource.descriptor);
        const metadataPath = this.getResourceMetadataPath(resource.descriptor);

        // Serialize the data based on its type
        const serializedData = this.serializeData(resource.data);

        // Extract metadata
        const metadata = this.extractMetadata(resource);

        try {
            // Write data file
            fs.writeFileSync(dataPath, serializedData);

            // Write metadata file
            fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
        } catch (error) {
            throw new ResourceError(
                ResourceErrorType.STORAGE_ERROR,
                `Failed to save resource: ${error.message}`,
                resource.descriptor
            );
        }
    }

    /**
     * Load metadata cache from disk
     */
    private async loadMetadataCache(): Promise<void> {
        const metadataDir = path.join(this.basePath, '_metadata');

        if (!fs.existsSync(metadataDir)) {
            return;
        }

        try {
            const files = fs.readdirSync(metadataDir);

            for (const file of files) {
                if (file.endsWith('.json')) {
                    const filePath = path.join(metadataDir, file);
                    const content = fs.readFileSync(filePath, 'utf8');
                    const metadata = JSON.parse(content) as ResourceMetadata;

                    // Convert date strings back to Date objects
                    if (metadata.createdAt) {
                        metadata.createdAt = new Date(metadata.createdAt);
                    }
                    if (metadata.updatedAt) {
                        metadata.updatedAt = new Date(metadata.updatedAt);
                    }

                    const key = this.getResourceKey(metadata.descriptor);
                    this.metadataCache.set(key, metadata);
                }
            }
        } catch (error) {
            console.error('Failed to load metadata cache:', error);
            // Continue with an empty cache
        }
    }

    /**
     * Serialize resource data for storage
     */
    private serializeData(data: Resource['data']): Buffer {
        if (data instanceof Uint8Array) {
            return Buffer.from(data);
        } else if (typeof data === 'string') {
            return Buffer.from(data, 'utf8');
        } else {
            return Buffer.from(JSON.stringify(data), 'utf8');
        }
    }

    /**
     * Deserialize data from storage
     */
    private deserializeData(buffer: Buffer, mimeType?: string): Resource['data'] {
        if (mimeType) {
            // Handle different mime types
            if (mimeType.startsWith('image/') || mimeType.startsWith('audio/') ||
                mimeType.startsWith('video/') || mimeType.startsWith('application/octet-stream')) {
                return new Uint8Array(buffer);
            } else if (mimeType.startsWith('text/') || mimeType === 'application/json') {
                const text = buffer.toString('utf8');
                if (mimeType === 'application/json') {
                    try {
                        return JSON.parse(text);
                    } catch {
                        // Fall back to text if JSON parsing fails
                        return text;
                    }
                }
                return text;
            }
        }

        // Try to determine the type from content
        const text = buffer.toString('utf8');
        try {
            // Try to parse as JSON
            return JSON.parse(text);
        } catch {
            // If it's not valid JSON, return as text or binary
            // Check if it's likely text
            if (/^[\x20-\x7E\r\n\t]*$/.test(text)) {
                return text;
            } else {
                // Return as binary
                return new Uint8Array(buffer);
            }
        }
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
        } else if (resource.data) {
            // Calculate size based on data
            if (resource.data instanceof Uint8Array) {
                metadata.size = resource.data.length;
            } else if (typeof resource.data === 'string') {
                metadata.size = Buffer.from(resource.data, 'utf8').length;
            } else {
                metadata.size = Buffer.from(JSON.stringify(resource.data), 'utf8').length;
            }
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