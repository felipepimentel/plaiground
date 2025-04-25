import { Resource, ResourceDescriptor, ResourceErrorType } from '@plaidev/common';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { FileSystemResourceManager } from '../file-system-resource-manager';

describe('FileSystemResourceManager', () => {
    let resourceManager: FileSystemResourceManager;
    let testDir: string;

    beforeEach(async () => {
        // Create a temporary directory for testing
        testDir = path.join(os.tmpdir(), `resource-manager-test-${Date.now()}`);
        fs.mkdirSync(testDir, { recursive: true });

        resourceManager = new FileSystemResourceManager(testDir);
        await resourceManager.initialize();
    });

    afterEach(() => {
        // Clean up the temporary directory
        if (fs.existsSync(testDir)) {
            fs.rmSync(testDir, { recursive: true, force: true });
        }
    });

    test('should create and retrieve a text resource', async () => {
        // Create a text resource
        const descriptor: ResourceDescriptor = {
            id: 'test-text-1',
            type: 'text'
        };

        const textResource: Resource = {
            descriptor,
            name: 'Test Text Resource',
            data: 'This is a test text resource',
            mimeType: 'text/plain',
            createdAt: new Date(),
            updatedAt: new Date()
        };

        // Create the resource
        const metadata = await resourceManager.createResource(textResource);

        // Verify metadata
        expect(metadata).toBeDefined();
        expect(metadata.descriptor.id).toBe(descriptor.id);
        expect(metadata.descriptor.type).toBe(descriptor.type);
        expect(metadata.name).toBe('Test Text Resource');
        expect(metadata.mimeType).toBe('text/plain');

        // Retrieve the resource
        const retrieved = await resourceManager.getResource(descriptor);

        // Verify retrieved resource
        expect(retrieved).toBeDefined();
        expect(retrieved.descriptor.id).toBe(descriptor.id);
        expect(retrieved.descriptor.type).toBe(descriptor.type);
        expect(retrieved.name).toBe('Test Text Resource');
        expect(retrieved.data).toBe('This is a test text resource');
        expect(retrieved.mimeType).toBe('text/plain');
    });

    test('should create and retrieve a binary resource', async () => {
        // Create a binary resource
        const descriptor: ResourceDescriptor = {
            id: 'test-binary-1',
            type: 'binary'
        };

        const binaryData = new Uint8Array([1, 2, 3, 4, 5]);
        const binaryResource: Resource = {
            descriptor,
            name: 'Test Binary Resource',
            data: binaryData,
            mimeType: 'application/octet-stream',
            createdAt: new Date(),
            updatedAt: new Date()
        };

        // Create the resource
        const metadata = await resourceManager.createResource(binaryResource);

        // Verify metadata
        expect(metadata).toBeDefined();
        expect(metadata.descriptor.id).toBe(descriptor.id);
        expect(metadata.descriptor.type).toBe(descriptor.type);
        expect(metadata.name).toBe('Test Binary Resource');
        expect(metadata.size).toBe(5);

        // Retrieve the resource
        const retrieved = await resourceManager.getResource(descriptor);

        // Verify retrieved resource
        expect(retrieved).toBeDefined();
        expect(retrieved.descriptor.id).toBe(descriptor.id);
        expect(retrieved.descriptor.type).toBe(descriptor.type);
        expect(retrieved.name).toBe('Test Binary Resource');
        expect(retrieved.data instanceof Uint8Array).toBe(true);

        const retrievedData = retrieved.data as Uint8Array;
        expect(retrievedData.length).toBe(5);
        expect(Array.from(retrievedData)).toEqual([1, 2, 3, 4, 5]);
    });

    test('should create and retrieve a JSON resource', async () => {
        // Create a JSON resource
        const descriptor: ResourceDescriptor = {
            id: 'test-json-1',
            type: 'json'
        };

        const jsonData = {
            name: 'Test Object',
            values: [1, 2, 3],
            nested: {
                property: 'value'
            }
        };

        const jsonResource: Resource = {
            descriptor,
            name: 'Test JSON Resource',
            data: jsonData,
            mimeType: 'application/json',
            createdAt: new Date(),
            updatedAt: new Date()
        };

        // Create the resource
        const metadata = await resourceManager.createResource(jsonResource);

        // Verify metadata
        expect(metadata).toBeDefined();
        expect(metadata.descriptor.id).toBe(descriptor.id);
        expect(metadata.descriptor.type).toBe(descriptor.type);
        expect(metadata.name).toBe('Test JSON Resource');

        // Retrieve the resource
        const retrieved = await resourceManager.getResource(descriptor);

        // Verify retrieved resource
        expect(retrieved).toBeDefined();
        expect(retrieved.descriptor.id).toBe(descriptor.id);
        expect(retrieved.descriptor.type).toBe(descriptor.type);
        expect(retrieved.name).toBe('Test JSON Resource');
        expect(retrieved.data).toEqual(jsonData);
    });

    test('should update an existing resource', async () => {
        // Create a resource
        const descriptor: ResourceDescriptor = {
            id: 'test-update-1',
            type: 'text'
        };

        const originalResource: Resource = {
            descriptor,
            name: 'Original Resource',
            data: 'Original content',
            mimeType: 'text/plain',
            createdAt: new Date(),
            updatedAt: new Date()
        };

        // Create the resource
        await resourceManager.createResource(originalResource);

        // Update the resource
        const updatedResource: Resource = {
            descriptor,
            name: 'Updated Resource',
            data: 'Updated content',
            mimeType: 'text/plain',
            createdAt: new Date(), // This should be ignored and the original preserved
            updatedAt: new Date()
        };

        const updatedMetadata = await resourceManager.updateResource(updatedResource);

        // Verify the metadata was updated
        expect(updatedMetadata.name).toBe('Updated Resource');

        // Retrieve the updated resource
        const retrieved = await resourceManager.getResource(descriptor);

        // Verify the resource was updated
        expect(retrieved.name).toBe('Updated Resource');
        expect(retrieved.data).toBe('Updated content');

        // Verify the creation date was preserved
        expect(retrieved.createdAt!.getTime()).toBe(originalResource.createdAt!.getTime());

        // Verify the update date was changed
        expect(retrieved.updatedAt!.getTime()).not.toBe(originalResource.updatedAt!.getTime());
    });

    test('should delete a resource', async () => {
        // Create a resource
        const descriptor: ResourceDescriptor = {
            id: 'test-delete-1',
            type: 'text'
        };

        const resource: Resource = {
            descriptor,
            name: 'Resource to Delete',
            data: 'Delete me',
            mimeType: 'text/plain',
            createdAt: new Date(),
            updatedAt: new Date()
        };

        // Create the resource
        await resourceManager.createResource(resource);

        // Verify it exists
        const exists = await resourceManager.getResource(descriptor);
        expect(exists).toBeDefined();

        // Delete the resource
        await resourceManager.deleteResource(descriptor);

        // Verify it was deleted
        try {
            await resourceManager.getResource(descriptor);
            fail('Expected resource to be deleted');
        } catch (error) {
            expect(error.type).toBe(ResourceErrorType.NOT_FOUND);
        }
    });

    test('should list resources with filtering', async () => {
        // Create multiple resources
        const resources: Resource[] = [
            {
                descriptor: { id: 'test-list-1', type: 'text' },
                name: 'Text Resource 1',
                data: 'Content 1',
                mimeType: 'text/plain',
                tags: ['test', 'text'],
                createdAt: new Date(),
                updatedAt: new Date()
            },
            {
                descriptor: { id: 'test-list-2', type: 'text' },
                name: 'Text Resource 2',
                data: 'Content 2',
                mimeType: 'text/plain',
                tags: ['test', 'important'],
                createdAt: new Date(),
                updatedAt: new Date()
            },
            {
                descriptor: { id: 'test-list-3', type: 'json' },
                name: 'JSON Resource',
                data: { key: 'value' },
                mimeType: 'application/json',
                tags: ['test', 'json'],
                createdAt: new Date(),
                updatedAt: new Date()
            }
        ];

        // Create all resources
        for (const resource of resources) {
            await resourceManager.createResource(resource);
        }

        // List all resources
        const allResources = await resourceManager.listResources();
        expect(allResources.length).toBe(3);

        // Filter by type
        const textResources = await resourceManager.listResources({ type: 'text' });
        expect(textResources.length).toBe(2);
        expect(textResources[0].descriptor.type).toBe('text');
        expect(textResources[1].descriptor.type).toBe('text');

        // Filter by tag
        const importantResources = await resourceManager.listResources({ tags: ['important'] });
        expect(importantResources.length).toBe(1);
        expect(importantResources[0].descriptor.id).toBe('test-list-2');

        // Filter by name pattern
        const resource2 = await resourceManager.listResources({ namePattern: 'Resource 2' });
        expect(resource2.length).toBe(1);
        expect(resource2[0].descriptor.id).toBe('test-list-2');

        // Limit results
        const limitedResources = await resourceManager.listResources({ limit: 2 });
        expect(limitedResources.length).toBe(2);

        // Offset results
        const offsetResources = await resourceManager.listResources({ offset: 1 });
        expect(offsetResources.length).toBe(2);
    });

    test('should persist resources across manager instances', async () => {
        // Create a resource with the first manager instance
        const descriptor: ResourceDescriptor = {
            id: 'persistence-test',
            type: 'text'
        };

        const resource: Resource = {
            descriptor,
            name: 'Persistent Resource',
            data: 'This data should persist',
            mimeType: 'text/plain',
            createdAt: new Date(),
            updatedAt: new Date()
        };

        // Create the resource
        await resourceManager.createResource(resource);

        // Create a new manager instance pointed at the same directory
        const newManager = new FileSystemResourceManager(testDir);
        await newManager.initialize();

        // Try to retrieve the resource with the new manager
        const retrieved = await newManager.getResource(descriptor);

        // Verify the resource was successfully retrieved
        expect(retrieved).toBeDefined();
        expect(retrieved.descriptor.id).toBe(descriptor.id);
        expect(retrieved.name).toBe('Persistent Resource');
        expect(retrieved.data).toBe('This data should persist');
    });
}); 