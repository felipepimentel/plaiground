import { McpClient } from '@plaiground/mcp-client';

/**
 * Example demonstrating resource operations with MCP
 */
async function resourceExamples() {
    console.log('Starting resource examples...');

    // Create MCP client
    const client = new McpClient({
        transport: {
            type: 'http',
            endpoint: 'http://localhost:3000/api/mcp',
        },
        autoReconnect: true,
    });

    // Connect to the MCP server
    await client.connect();
    console.log('Connected to MCP server');

    try {
        // Example 1: Create a text resource
        const textResourceId = await client.createResource({
            type: 'text/plain',
            content: 'This is a sample text resource.',
            metadata: {
                name: 'sample-text',
                description: 'A simple text resource example',
            },
        });
        console.log(`Created text resource: ${textResourceId}`);

        // Example 2: Create a JSON resource
        const jsonData = {
            name: 'Sample Data',
            values: [1, 2, 3, 4, 5],
            nested: {
                property: 'value',
            },
        };

        const jsonResourceId = await client.createResource({
            type: 'application/json',
            content: JSON.stringify(jsonData),
            metadata: {
                name: 'sample-json',
                description: 'A JSON data structure',
            },
        });
        console.log(`Created JSON resource: ${jsonResourceId}`);

        // Example 3: Retrieve a resource
        const retrievedResource = await client.getResource(textResourceId);
        console.log('Retrieved resource:', retrievedResource);

        // Example 4: Update a resource
        await client.updateResource(textResourceId, {
            content: 'This is updated text content.',
            metadata: {
                ...retrievedResource.metadata,
                lastModified: new Date().toISOString(),
            },
        });
        console.log(`Updated resource: ${textResourceId}`);

        // Example 5: List resources
        const resources = await client.listResources();
        console.log('Available resources:');
        resources.forEach(resource => {
            console.log(`- ${resource.id}: ${resource.metadata.name || 'Unnamed'}`);
        });

        // Example 6: Search resources by metadata
        const textResources = await client.searchResources({
            type: 'text/plain',
        });
        console.log('Text resources:', textResources.map(r => r.id));

        // Example 7: Delete a resource
        await client.deleteResource(jsonResourceId);
        console.log(`Deleted resource: ${jsonResourceId}`);

    } catch (error) {
        console.error('Error in resource examples:', error);
    } finally {
        // Disconnect when done
        await client.disconnect();
        console.log('Disconnected from MCP server');
    }
}

// Run the example if this script is executed directly
if (require.main === module) {
    resourceExamples().catch(error => {
        console.error('Example failed:', error);
        process.exit(1);
    });
} 