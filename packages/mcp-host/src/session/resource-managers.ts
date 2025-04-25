import { ResourceManager, ResourceStorageCapability } from '@plaidev/common';
import { FileSystemResourceManager } from './file-system-resource-manager';
import { InMemoryResourceManager } from './in-memory-resource-manager';
import { DefaultResourceRegistryManager, ResourceRegistryManager } from './resource-registry-manager';

/**
 * Configuration for resource managers
 */
export interface ResourceManagerConfig {
    /**
     * Type of resource manager to use
     */
    type: 'memory' | 'filesystem';

    /**
     * Storage path for filesystem resource manager
     * Required if type is 'filesystem'
     */
    storagePath?: string;

    /**
     * Capabilities to enable for the resource manager
     * If not specified, all capabilities will be enabled
     */
    capabilities?: ResourceStorageCapability[];
}

/**
 * Configuration for the resource registry manager
 */
export interface ResourceRegistryConfig {
    /**
     * Default resource manager configuration
     * This will be used for any resource type that doesn't have a specific configuration
     */
    defaultManager: ResourceManagerConfig;

    /**
     * Resource type specific manager configurations
     * These will override the default manager for specific resource types
     */
    typeManagers?: Record<string, ResourceManagerConfig>;
}

/**
 * Create a resource manager based on configuration
 */
export function createResourceManager(config: ResourceManagerConfig): ResourceManager {
    const { type, capabilities } = config;

    switch (type) {
        case 'memory':
            return new InMemoryResourceManager(capabilities);

        case 'filesystem':
            if (!config.storagePath) {
                throw new Error('Storage path is required for filesystem resource manager');
            }
            const manager = new FileSystemResourceManager(config.storagePath, capabilities);
            // Initialize immediately
            manager.initialize().catch(err => {
                console.error('Failed to initialize filesystem resource manager:', err);
            });
            return manager;

        default:
            throw new Error(`Unknown resource manager type: ${type}`);
    }
}

/**
 * Create a resource registry manager based on configuration
 */
export async function createResourceRegistry(config: ResourceRegistryConfig): Promise<ResourceRegistryManager> {
    const registry = new DefaultResourceRegistryManager();

    // Create the default manager
    const defaultManager = createResourceManager(config.defaultManager);

    // Create type-specific managers if specified
    if (config.typeManagers) {
        for (const [type, managerConfig] of Object.entries(config.typeManagers)) {
            const manager = createResourceManager(managerConfig);
            registry.registerManager(type, manager);
        }
    }

    return registry;
}

// Export all resource manager implementations
export {
    DefaultResourceRegistryManager, FileSystemResourceManager, InMemoryResourceManager
};
