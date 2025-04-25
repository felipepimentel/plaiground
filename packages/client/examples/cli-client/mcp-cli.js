#!/usr/bin/env node

const { McpClient } = require('../../../dist');
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const crypto = require('crypto');

// Configuration defaults
const DEFAULT_CONFIG = {
    serverUrl: 'http://localhost:3000',
    transport: 'websocket',
    sessionId: '',
};

// Global state
let client = null;
let currentSession = null;
let config = { ...DEFAULT_CONFIG };

// Create readline interface
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
});

// Main function
async function main() {
    console.log('\x1b[36m%s\x1b[0m', '🚀 Plaiground MCP CLI Client');
    console.log('\x1b[36m%s\x1b[0m', '==============================');
    console.log('');

    // Load config if exists
    loadConfig();

    // Show main menu
    await showMainMenu();

    // Cleanup
    rl.close();
    if (client) {
        await client.disconnect();
    }
}

// Show main menu
async function showMainMenu() {
    while (true) {
        console.log('\n\x1b[33m=== Main Menu ===\x1b[0m');
        console.log('1. Connect to server');
        console.log('2. Resource management');
        console.log('3. Configure client');
        console.log('4. Exit');

        const choice = await prompt('Select an option (1-4): ');

        switch (choice) {
            case '1':
                await connectToServer();
                break;
            case '2':
                if (!client || !currentSession) {
                    console.log('\x1b[31mNot connected to a server. Please connect first.\x1b[0m');
                } else {
                    await resourceManagementMenu();
                }
                break;
            case '3':
                await configureClient();
                break;
            case '4':
                console.log('\x1b[36mGoodbye!\x1b[0m');
                return;
            default:
                console.log('\x1b[31mInvalid option. Please try again.\x1b[0m');
        }
    }
}

// Connect to server
async function connectToServer() {
    try {
        if (client) {
            await client.disconnect();
            client = null;
            currentSession = null;
            console.log('\x1b[33mDisconnected from previous session.\x1b[0m');
        }

        console.log('\n\x1b[33m=== Connecting to Server ===\x1b[0m');
        console.log(`Using server URL: ${config.serverUrl}`);
        console.log(`Transport: ${config.transport}`);

        // Create a new client instance
        client = new McpClient({
            url: config.serverUrl,
            transport: config.transport,
        });

        console.log('Initializing client...');
        await client.initialize();

        // Create or join a session
        const sessionId = config.sessionId || undefined;
        console.log(sessionId ? `Joining session: ${sessionId}` : 'Creating new session...');

        currentSession = await client.createSession({ sessionId });

        console.log('\x1b[32mConnected successfully!\x1b[0m');
        console.log(`Session ID: ${currentSession.sessionId}`);
        console.log(`Client ID: ${client.clientId}`);

        // Save the session ID to config if it was auto-generated
        if (!config.sessionId) {
            config.sessionId = currentSession.sessionId;
            saveConfig();
        }
    } catch (error) {
        console.error('\x1b[31mConnection error:\x1b[0m', error.message);
    }
}

// Resource management menu
async function resourceManagementMenu() {
    while (true) {
        console.log('\n\x1b[33m=== Resource Management ===\x1b[0m');
        console.log('1. List resources');
        console.log('2. Create resource');
        console.log('3. Get resource');
        console.log('4. Update resource');
        console.log('5. Delete resource');
        console.log('6. Back to main menu');

        const choice = await prompt('Select an option (1-6): ');

        switch (choice) {
            case '1':
                await listResources();
                break;
            case '2':
                await createResource();
                break;
            case '3':
                await getResource();
                break;
            case '4':
                await updateResource();
                break;
            case '5':
                await deleteResource();
                break;
            case '6':
                return;
            default:
                console.log('\x1b[31mInvalid option. Please try again.\x1b[0m');
        }
    }
}

// List resources
async function listResources() {
    try {
        console.log('\n\x1b[33m=== Listing Resources ===\x1b[0m');

        // Optional filtering
        const useFilters = (await prompt('Apply filters? (y/n): ')).toLowerCase() === 'y';

        let options = {};

        if (useFilters) {
            const type = await prompt('Filter by type (leave empty for all): ');
            if (type) options.type = type;

            const tagsStr = await prompt('Filter by tags (comma-separated, leave empty for all): ');
            if (tagsStr) options.tags = tagsStr.split(',').map(t => t.trim());

            const namePattern = await prompt('Filter by name pattern (regex, leave empty for all): ');
            if (namePattern) options.namePattern = namePattern;

            const limitStr = await prompt('Limit results (number, leave empty for all): ');
            if (limitStr) options.limit = parseInt(limitStr, 10);
        }

        // Call the listResources tool
        const result = await client.callTool('listResources', options);

        if (result.error) {
            throw new Error(result.error);
        }

        const resources = result.resources || [];

        if (resources.length === 0) {
            console.log('\x1b[33mNo resources found.\x1b[0m');
            return;
        }

        // Display resources
        console.log(`\nFound ${resources.length} resources:\n`);
        resources.forEach((resource, index) => {
            const tags = resource.tags ? ` [${resource.tags.join(', ')}]` : '';
            console.log(`${index + 1}. ${resource.name} (${resource.descriptor.type}/${resource.descriptor.id})${tags}`);
        });
    } catch (error) {
        console.error('\x1b[31mError listing resources:\x1b[0m', error.message);
    }
}

// Create a resource
async function createResource() {
    try {
        console.log('\n\x1b[33m=== Create Resource ===\x1b[0m');

        // Get resource details
        const resourceType = await prompt('Resource type: ');
        const resourceId = await prompt('Resource ID (leave empty for auto-generated): ') ||
            `${resourceType}-${crypto.randomUUID().substring(0, 8)}`;
        const resourceName = await prompt('Resource name: ');

        // Validate required fields
        if (!resourceType || !resourceName) {
            console.log('\x1b[31mResource type and name are required.\x1b[0m');
            return;
        }

        // Get tags
        const tagsStr = await prompt('Tags (comma-separated, leave empty for none): ');
        const tags = tagsStr ? tagsStr.split(',').map(t => t.trim()) : [];

        // Get content type
        console.log('\nContent type options:');
        console.log('1. Text');
        console.log('2. JSON');
        console.log('3. File (binary)');

        const contentTypeChoice = await prompt('Select content type (1-3): ');

        // Get content based on type
        let data;
        let mimeType;

        switch (contentTypeChoice) {
            case '1': // Text
                data = await prompt('Enter text content: ');
                mimeType = 'text/plain';
                break;

            case '2': // JSON
                try {
                    const jsonStr = await prompt('Enter JSON content: ');
                    data = JSON.parse(jsonStr);
                    mimeType = 'application/json';
                } catch (e) {
                    console.error('\x1b[31mInvalid JSON:\x1b[0m', e.message);
                    return;
                }
                break;

            case '3': // File
                try {
                    const filePath = await prompt('Enter file path: ');
                    data = fs.readFileSync(filePath);

                    // Try to determine mime type from extension
                    const ext = path.extname(filePath).toLowerCase();
                    switch (ext) {
                        case '.jpg':
                        case '.jpeg':
                            mimeType = 'image/jpeg';
                            break;
                        case '.png':
                            mimeType = 'image/png';
                            break;
                        case '.gif':
                            mimeType = 'image/gif';
                            break;
                        case '.txt':
                            mimeType = 'text/plain';
                            break;
                        case '.html':
                            mimeType = 'text/html';
                            break;
                        case '.json':
                            mimeType = 'application/json';
                            break;
                        case '.pdf':
                            mimeType = 'application/pdf';
                            break;
                        default:
                            mimeType = 'application/octet-stream';
                    }
                } catch (e) {
                    console.error('\x1b[31mError reading file:\x1b[0m', e.message);
                    return;
                }
                break;

            default:
                console.log('\x1b[31mInvalid content type.\x1b[0m');
                return;
        }

        // Create resource object
        const resource = {
            descriptor: {
                id: resourceId,
                type: resourceType
            },
            name: resourceName,
            mimeType,
            data,
            tags
        };

        // Call the createResource tool
        console.log('\nCreating resource...');
        const result = await client.callTool('createResource', { resource });

        if (result.error) {
            throw new Error(result.error);
        }

        console.log('\x1b[32mResource created successfully!\x1b[0m');
        console.log(`Type: ${resource.descriptor.type}`);
        console.log(`ID: ${resource.descriptor.id}`);
        console.log(`Name: ${resource.name}`);
    } catch (error) {
        console.error('\x1b[31mError creating resource:\x1b[0m', error.message);
    }
}

// Get a resource
async function getResource() {
    try {
        console.log('\n\x1b[33m=== Get Resource ===\x1b[0m');

        // Get resource descriptor
        const resourceType = await prompt('Resource type: ');
        const resourceId = await prompt('Resource ID: ');

        if (!resourceType || !resourceId) {
            console.log('\x1b[31mResource type and ID are required.\x1b[0m');
            return;
        }

        const descriptor = { type: resourceType, id: resourceId };

        // Call the getResource tool
        console.log('\nFetching resource...');
        const result = await client.callTool('getResource', { descriptor });

        if (result.error) {
            throw new Error(result.error);
        }

        const resource = result.resource;
        if (!resource) {
            throw new Error('Resource not found');
        }

        // Display resource details
        console.log('\n\x1b[32mResource details:\x1b[0m');
        console.log(`Name: ${resource.name}`);
        console.log(`Type: ${resource.descriptor.type}`);
        console.log(`ID: ${resource.descriptor.id}`);
        console.log(`MIME Type: ${resource.mimeType || 'N/A'}`);
        console.log(`Size: ${formatSize(resource.size)}`);
        console.log(`Created: ${new Date(resource.createdAt).toLocaleString()}`);
        console.log(`Updated: ${new Date(resource.updatedAt).toLocaleString()}`);

        if (resource.tags && resource.tags.length) {
            console.log(`Tags: ${resource.tags.join(', ')}`);
        }

        // Ask if user wants to view or export content
        console.log('\nContent options:');
        console.log('1. View content');
        console.log('2. Export to file');
        console.log('3. Skip');

        const contentChoice = await prompt('Select option (1-3): ');

        switch (contentChoice) {
            case '1': // View content
                await viewResourceContent(resource);
                break;

            case '2': // Export to file
                await exportResourceContent(resource);
                break;

            case '3': // Skip
                break;

            default:
                console.log('\x1b[31mInvalid option.\x1b[0m');
        }
    } catch (error) {
        console.error('\x1b[31mError getting resource:\x1b[0m', error.message);
    }
}

// View resource content
async function viewResourceContent(resource) {
    const data = resource.data;
    const mimeType = resource.mimeType || '';

    if (typeof data === 'string') {
        console.log('\n\x1b[33m=== Resource Content ===\x1b[0m');
        console.log(data);
    } else if (typeof data === 'object' && data !== null) {
        if (Buffer.isBuffer(data) || ArrayBuffer.isView(data)) {
            console.log('\n\x1b[33m=== Binary Content ===\x1b[0m');
            console.log(`Binary data (${formatSize(data.length)})`);
            console.log('First 50 bytes:', data.slice(0, 50));
        } else {
            console.log('\n\x1b[33m=== JSON Content ===\x1b[0m');
            console.log(JSON.stringify(data, null, 2));
        }
    } else {
        console.log('\n\x1b[33mNo content available for display.\x1b[0m');
    }
}

// Export resource content to file
async function exportResourceContent(resource) {
    const filePath = await prompt('Enter output file path: ');

    if (!filePath) {
        console.log('\x1b[31mNo file path provided.\x1b[0m');
        return;
    }

    try {
        const data = resource.data;

        if (Buffer.isBuffer(data) || ArrayBuffer.isView(data)) {
            // Binary data
            fs.writeFileSync(filePath, Buffer.from(data));
        } else if (typeof data === 'string') {
            // Text data
            fs.writeFileSync(filePath, data);
        } else if (typeof data === 'object' && data !== null) {
            // JSON data
            fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
        } else {
            throw new Error('Unsupported data format');
        }

        console.log(`\x1b[32mContent exported to ${filePath}\x1b[0m`);
    } catch (error) {
        console.error('\x1b[31mError exporting content:\x1b[0m', error.message);
    }
}

// Update a resource
async function updateResource() {
    try {
        console.log('\n\x1b[33m=== Update Resource ===\x1b[0m');

        // Get resource descriptor
        const resourceType = await prompt('Resource type: ');
        const resourceId = await prompt('Resource ID: ');

        if (!resourceType || !resourceId) {
            console.log('\x1b[31mResource type and ID are required.\x1b[0m');
            return;
        }

        const descriptor = { type: resourceType, id: resourceId };

        // Get the resource first
        console.log('\nFetching resource...');
        const getResult = await client.callTool('getResource', { descriptor });

        if (getResult.error) {
            throw new Error(getResult.error);
        }

        const resource = getResult.resource;
        if (!resource) {
            throw new Error('Resource not found');
        }

        console.log(`\x1b[32mResource found: ${resource.name}\x1b[0m`);

        // Update options
        console.log('\nUpdate options:');
        console.log('1. Update name');
        console.log('2. Update content');
        console.log('3. Update tags');
        console.log('4. Cancel');

        const updateChoice = await prompt('Select option (1-4): ');

        let updatedResource = { ...resource };

        switch (updateChoice) {
            case '1': // Update name
                updatedResource.name = await prompt(`New name (${resource.name}): `) || resource.name;
                break;

            case '2': // Update content
                // For simplicity, just update with text content
                updatedResource.data = await prompt('New content: ');
                updatedResource.mimeType = 'text/plain';
                break;

            case '3': // Update tags
                const currentTags = resource.tags ? resource.tags.join(', ') : '';
                const newTagsStr = await prompt(`New tags (${currentTags}): `);
                updatedResource.tags = newTagsStr ? newTagsStr.split(',').map(t => t.trim()) : [];
                break;

            case '4': // Cancel
                console.log('\x1b[33mUpdate cancelled.\x1b[0m');
                return;

            default:
                console.log('\x1b[31mInvalid option.\x1b[0m');
                return;
        }

        // Call the updateResource tool
        console.log('\nUpdating resource...');
        const updateResult = await client.callTool('updateResource', { resource: updatedResource });

        if (updateResult.error) {
            throw new Error(updateResult.error);
        }

        console.log('\x1b[32mResource updated successfully!\x1b[0m');
    } catch (error) {
        console.error('\x1b[31mError updating resource:\x1b[0m', error.message);
    }
}

// Delete a resource
async function deleteResource() {
    try {
        console.log('\n\x1b[33m=== Delete Resource ===\x1b[0m');

        // Get resource descriptor
        const resourceType = await prompt('Resource type: ');
        const resourceId = await prompt('Resource ID: ');

        if (!resourceType || !resourceId) {
            console.log('\x1b[31mResource type and ID are required.\x1b[0m');
            return;
        }

        const descriptor = { type: resourceType, id: resourceId };

        // Confirm deletion
        const confirmed = (await prompt(`Are you sure you want to delete ${resourceType}/${resourceId}? (y/n): `)).toLowerCase() === 'y';

        if (!confirmed) {
            console.log('\x1b[33mDeletion cancelled.\x1b[0m');
            return;
        }

        // Call the deleteResource tool
        console.log('\nDeleting resource...');
        const result = await client.callTool('deleteResource', { descriptor });

        if (result.error) {
            throw new Error(result.error);
        }

        console.log('\x1b[32mResource deleted successfully!\x1b[0m');
    } catch (error) {
        console.error('\x1b[31mError deleting resource:\x1b[0m', error.message);
    }
}

// Configure client
async function configureClient() {
    console.log('\n\x1b[33m=== Client Configuration ===\x1b[0m');
    console.log('Current configuration:');
    console.log(`Server URL: ${config.serverUrl}`);
    console.log(`Transport: ${config.transport}`);
    console.log(`Session ID: ${config.sessionId || '(auto-generated)'}`);

    console.log('\nUpdate configuration:');
    config.serverUrl = await prompt(`Server URL (${config.serverUrl}): `) || config.serverUrl;

    const transportPrompt = await prompt(`Transport (websocket/sse) (${config.transport}): `) || config.transport;
    if (transportPrompt === 'websocket' || transportPrompt === 'sse') {
        config.transport = transportPrompt;
    } else {
        console.log('\x1b[31mInvalid transport, keeping current value.\x1b[0m');
    }

    const clearSession = (await prompt('Clear saved session ID? (y/n): ')).toLowerCase() === 'y';
    if (clearSession) {
        config.sessionId = '';
        console.log('\x1b[33mSession ID cleared.\x1b[0m');
    }

    // Save configuration
    saveConfig();
    console.log('\x1b[32mConfiguration saved.\x1b[0m');
}

// Load configuration
function loadConfig() {
    const configPath = path.join(__dirname, '.mcp-cli-config.json');
    try {
        if (fs.existsSync(configPath)) {
            const data = fs.readFileSync(configPath, 'utf8');
            const savedConfig = JSON.parse(data);
            config = { ...DEFAULT_CONFIG, ...savedConfig };
            console.log('Configuration loaded.');
        }
    } catch (error) {
        console.error('Error loading configuration:', error.message);
    }
}

// Save configuration
function saveConfig() {
    const configPath = path.join(__dirname, '.mcp-cli-config.json');
    try {
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    } catch (error) {
        console.error('Error saving configuration:', error.message);
    }
}

// Utility function to format file size
function formatSize(bytes) {
    if (bytes === undefined || bytes === null) return 'Unknown';
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Utility function to prompt for input
function prompt(message) {
    return new Promise((resolve) => {
        rl.question(message, (answer) => {
            resolve(answer);
        });
    });
}

// Start the main function
main().catch((error) => {
    console.error('\x1b[31mFatal error:\x1b[0m', error);
    process.exit(1);
}); 