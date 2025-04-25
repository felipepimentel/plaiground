import { McpClient } from '../../../src/client.js';

// Utility function to generate random IDs
function generateId(prefix = 'res') {
    return `${prefix}-${Math.random().toString(36).substring(2, 10)}`;
}

// Client state
let client = null;
let currentSession = null;
let selectedResource = null;

// DOM Elements
const serverUrlInput = document.getElementById('serverUrl');
const sessionIdInput = document.getElementById('sessionId');
const connectBtn = document.getElementById('connectBtn');
const disconnectBtn = document.getElementById('disconnectBtn');
const connectionStatus = document.getElementById('connectionStatus');
const connectionInfo = document.getElementById('connectionInfo');
const resourcesList = document.getElementById('resourcesList');
const resourceDetails = document.getElementById('resourceDetails');
const resourceContentPreview = document.getElementById('resourceContentPreview');
const refreshResourcesBtn = document.getElementById('refreshResourcesBtn');
const createResourceBtn = document.getElementById('createResourceBtn');
const updateResourceBtn = document.getElementById('updateResourceBtn');
const deleteResourceBtn = document.getElementById('deleteResourceBtn');
const createResourceForm = document.getElementById('createResourceForm');
const contentTypeSelect = document.getElementById('contentType');
const textContentSection = document.getElementById('textContentSection');
const jsonContentSection = document.getElementById('jsonContentSection');
const fileContentSection = document.getElementById('fileContentSection');

// Event Listeners
connectBtn.addEventListener('click', connectToServer);
disconnectBtn.addEventListener('click', disconnectFromServer);
refreshResourcesBtn.addEventListener('click', loadResources);
createResourceForm.addEventListener('submit', handleCreateResource);
updateResourceBtn.addEventListener('click', handleUpdateResource);
deleteResourceBtn.addEventListener('click', handleDeleteResource);
contentTypeSelect.addEventListener('change', updateContentUI);

// Initialize UI
updateContentUI();

// Connect to MCP Server
async function connectToServer() {
    try {
        const serverUrl = serverUrlInput.value.trim();
        if (!serverUrl) {
            alert('Please enter a server URL');
            return;
        }

        // Create a new client instance
        client = new McpClient({
            url: serverUrl,
            transport: 'websocket', // or 'sse'
        });

        // Update UI
        connectionStatus.textContent = 'Connecting...';
        connectBtn.disabled = true;

        // Initialize client
        await client.initialize();

        // Create or join a session
        const sessionId = sessionIdInput.value.trim() || undefined;
        currentSession = await client.createSession({ sessionId });

        // Register for events
        client.on('error', handleError);
        client.on('disconnected', handleDisconnection);

        // Update UI
        connectionStatus.textContent = 'Connected';
        connectionStatus.className = 'mt-2 text-success';
        connectBtn.disabled = true;
        disconnectBtn.disabled = false;
        refreshResourcesBtn.disabled = false;
        createResourceBtn.disabled = false;

        // Display connection info
        connectionInfo.innerHTML = `
            <div>
                <strong>Session ID:</strong> ${currentSession.sessionId}
            </div>
            <div>
                <strong>Client ID:</strong> ${client.clientId}
            </div>
            <div>
                <strong>Connection Type:</strong> ${client.transportType}
            </div>
            <div>
                <strong>Server:</strong> ${serverUrl}
            </div>
        `;

        // Load resources
        await loadResources();
    } catch (error) {
        console.error('Connection error:', error);
        connectionStatus.textContent = `Connection failed: ${error.message}`;
        connectionStatus.className = 'mt-2 text-danger';
        connectBtn.disabled = false;
    }
}

// Disconnect from server
function disconnectFromServer() {
    if (client) {
        client.disconnect();
        client = null;
        currentSession = null;
        selectedResource = null;
    }

    // Reset UI
    connectionStatus.textContent = 'Disconnected';
    connectionStatus.className = 'mt-2 text-muted';
    connectionInfo.innerHTML = '<p class="text-muted">Connect to a server to see connection details.</p>';
    resourcesList.innerHTML = '<div class="p-3 text-muted">No resources available</div>';
    resourceDetails.innerHTML = '<p class="text-muted">Select a resource to view details</p>';
    resourceContentPreview.classList.add('d-none');

    // Update button states
    connectBtn.disabled = false;
    disconnectBtn.disabled = true;
    refreshResourcesBtn.disabled = true;
    createResourceBtn.disabled = true;
    updateResourceBtn.disabled = true;
    deleteResourceBtn.disabled = true;
}

// Handle server errors
function handleError(error) {
    console.error('Server error:', error);
    alert(`Server error: ${error.message}`);
}

// Handle disconnection
function handleDisconnection() {
    console.log('Disconnected from server');
    disconnectFromServer();
}

// Load resources from the server
async function loadResources() {
    if (!client || !currentSession) return;

    try {
        refreshResourcesBtn.disabled = true;

        // Call the listResources tool
        const result = await client.callTool('listResources', {});

        if (result.error) {
            throw new Error(result.error);
        }

        const resources = result.resources || [];

        if (resources.length === 0) {
            resourcesList.innerHTML = '<div class="p-3 text-muted">No resources available</div>';
            return;
        }

        // Display resources
        resourcesList.innerHTML = '';
        resources.forEach(resource => {
            const resourceItem = document.createElement('div');
            resourceItem.className = 'resource-item';
            resourceItem.dataset.id = resource.descriptor.id;
            resourceItem.dataset.type = resource.descriptor.type;

            // Format tags if any
            const tagsHtml = resource.tags && resource.tags.length
                ? resource.tags.map(tag => `<span class="tag">${tag}</span>`).join(' ')
                : '';

            resourceItem.innerHTML = `
                <div><strong>${resource.name}</strong></div>
                <div class="text-muted small">${resource.descriptor.type}/${resource.descriptor.id}</div>
                <div class="mt-1">${tagsHtml}</div>
            `;

            resourceItem.addEventListener('click', () => loadResourceDetails(resource.descriptor));
            resourcesList.appendChild(resourceItem);
        });
    } catch (error) {
        console.error('Error loading resources:', error);
        alert(`Failed to load resources: ${error.message}`);
    } finally {
        refreshResourcesBtn.disabled = false;
    }
}

// Load resource details
async function loadResourceDetails(descriptor) {
    if (!client || !currentSession) return;

    try {
        // Highlight selected resource
        const resourceItems = document.querySelectorAll('.resource-item');
        resourceItems.forEach(item => {
            if (item.dataset.id === descriptor.id && item.dataset.type === descriptor.type) {
                item.classList.add('active');
            } else {
                item.classList.remove('active');
            }
        });

        // Call the getResource tool
        const result = await client.callTool('getResource', {
            descriptor: descriptor
        });

        if (result.error) {
            throw new Error(result.error);
        }

        const resource = result.resource;
        if (!resource) {
            throw new Error('Resource not found');
        }

        // Store selected resource
        selectedResource = resource;

        // Update button states
        updateResourceBtn.disabled = false;
        deleteResourceBtn.disabled = false;

        // Format created and updated dates
        const createdDate = new Date(resource.createdAt).toLocaleString();
        const updatedDate = new Date(resource.updatedAt).toLocaleString();

        // Display resource metadata
        resourceDetails.innerHTML = `
            <div class="mb-3">
                <h5>${resource.name}</h5>
                <div><strong>Type:</strong> ${resource.descriptor.type}</div>
                <div><strong>ID:</strong> ${resource.descriptor.id}</div>
                <div><strong>MIME Type:</strong> ${resource.mimeType || 'N/A'}</div>
                <div><strong>Size:</strong> ${formatSize(resource.size)}</div>
                <div><strong>Created:</strong> ${createdDate}</div>
                <div><strong>Updated:</strong> ${updatedDate}</div>
                ${resource.tags && resource.tags.length
                ? `<div class="mt-2"><strong>Tags:</strong> ${resource.tags.map(tag => `<span class="tag">${tag}</span>`).join(' ')}</div>`
                : ''}
            </div>
        `;

        // Display resource content preview
        resourceContentPreview.classList.remove('d-none');
        renderResourcePreview(resource);
    } catch (error) {
        console.error('Error loading resource details:', error);
        alert(`Failed to load resource details: ${error.message}`);

        // Reset UI
        resourceDetails.innerHTML = '<p class="text-danger">Error loading resource details</p>';
        resourceContentPreview.classList.add('d-none');
        updateResourceBtn.disabled = true;
        deleteResourceBtn.disabled = true;
    }
}

// Render resource preview based on content type
function renderResourcePreview(resource) {
    const data = resource.data;
    const mimeType = resource.mimeType || '';

    let previewHtml = '';

    if (typeof data === 'string') {
        if (mimeType.startsWith('text/html')) {
            previewHtml = `
                <div class="alert alert-warning">HTML Content Preview</div>
                <iframe srcdoc="${escapeHtml(data)}" style="width: 100%; height: 180px; border: 1px solid #ddd;"></iframe>
            `;
        } else if (mimeType.startsWith('text/markdown')) {
            previewHtml = `
                <div class="alert alert-warning">Markdown Content</div>
                <pre>${escapeHtml(data)}</pre>
            `;
        } else {
            previewHtml = `<pre>${escapeHtml(data)}</pre>`;
        }
    } else if (typeof data === 'object' && data !== null) {
        if (data instanceof Uint8Array) {
            if (mimeType.startsWith('image/')) {
                // Convert Uint8Array to base64 for image display
                const base64 = arrayBufferToBase64(data);
                previewHtml = `<img src="data:${mimeType};base64,${base64}" class="image-preview" alt="Image preview">`;
            } else {
                previewHtml = `<div class="alert alert-info">Binary data (${formatSize(data.length)})</div>`;
            }
        } else {
            // Regular object (likely JSON)
            previewHtml = `<pre>${escapeHtml(JSON.stringify(data, null, 2))}</pre>`;
        }
    } else {
        previewHtml = '<div class="alert alert-warning">No preview available</div>';
    }

    resourceContentPreview.innerHTML = previewHtml;
}

// Handle create resource form submission
async function handleCreateResource(event) {
    event.preventDefault();
    if (!client || !currentSession) return;

    try {
        const resourceType = document.getElementById('resourceType').value.trim();
        const resourceId = document.getElementById('resourceId').value.trim() || generateId(resourceType);
        const resourceName = document.getElementById('resourceName').value.trim();
        const tagsString = document.getElementById('resourceTags').value.trim();
        const contentType = contentTypeSelect.value;

        // Validate inputs
        if (!resourceType || !resourceName) {
            alert('Resource type and name are required');
            return;
        }

        // Parse tags
        const tags = tagsString ? tagsString.split(',').map(tag => tag.trim()).filter(tag => tag) : [];

        // Create resource descriptor
        const descriptor = {
            id: resourceId,
            type: resourceType
        };

        // Get resource data based on content type
        let data;
        let mimeType;

        if (contentType === 'text') {
            data = document.getElementById('textContent').value || '';
            mimeType = 'text/plain';
        } else if (contentType === 'json') {
            const jsonText = document.getElementById('jsonContent').value || '{}';
            try {
                data = JSON.parse(jsonText);
                mimeType = 'application/json';
            } catch (err) {
                alert('Invalid JSON: ' + err.message);
                return;
            }
        } else if (contentType === 'image' || contentType === 'file') {
            const fileInput = document.getElementById('fileContent');
            if (!fileInput.files || fileInput.files.length === 0) {
                alert('Please select a file');
                return;
            }

            const file = fileInput.files[0];
            data = new Uint8Array(await file.arrayBuffer());
            mimeType = file.type || (contentType === 'image' ? 'image/png' : 'application/octet-stream');
        }

        // Create resource object
        const resource = {
            descriptor,
            name: resourceName,
            mimeType,
            data,
            tags
        };

        // Call the createResource tool
        const result = await client.callTool('createResource', { resource });

        if (result.error) {
            throw new Error(result.error);
        }

        alert('Resource created successfully!');
        createResourceForm.reset();
        updateContentUI();

        // Reload resources
        await loadResources();
    } catch (error) {
        console.error('Error creating resource:', error);
        alert(`Failed to create resource: ${error.message}`);
    }
}

// Handle resource update
async function handleUpdateResource() {
    if (!client || !currentSession || !selectedResource) return;

    // For simplicity, we'll just provide a text update
    const newContent = prompt('Enter new text content:',
        typeof selectedResource.data === 'string' ? selectedResource.data : '');

    if (newContent === null) return; // User cancelled

    try {
        // Update resource with new content
        const updatedResource = {
            ...selectedResource,
            data: newContent
        };

        const result = await client.callTool('updateResource', { resource: updatedResource });

        if (result.error) {
            throw new Error(result.error);
        }

        alert('Resource updated successfully!');

        // Reload resource details and list
        await loadResourceDetails(selectedResource.descriptor);
        await loadResources();
    } catch (error) {
        console.error('Error updating resource:', error);
        alert(`Failed to update resource: ${error.message}`);
    }
}

// Handle resource delete
async function handleDeleteResource() {
    if (!client || !currentSession || !selectedResource) return;

    const confirmed = confirm(`Are you sure you want to delete the resource "${selectedResource.name}"?`);
    if (!confirmed) return;

    try {
        const result = await client.callTool('deleteResource', {
            descriptor: selectedResource.descriptor
        });

        if (result.error) {
            throw new Error(result.error);
        }

        alert('Resource deleted successfully!');

        // Reset UI
        selectedResource = null;
        resourceDetails.innerHTML = '<p class="text-muted">Select a resource to view details</p>';
        resourceContentPreview.classList.add('d-none');
        updateResourceBtn.disabled = true;
        deleteResourceBtn.disabled = true;

        // Reload resources
        await loadResources();
    } catch (error) {
        console.error('Error deleting resource:', error);
        alert(`Failed to delete resource: ${error.message}`);
    }
}

// Update the content UI based on selected content type
function updateContentUI() {
    const contentType = contentTypeSelect.value;

    // Hide all content sections
    textContentSection.classList.add('d-none');
    jsonContentSection.classList.add('d-none');
    fileContentSection.classList.add('d-none');

    // Show the appropriate section
    if (contentType === 'text') {
        textContentSection.classList.remove('d-none');
    } else if (contentType === 'json') {
        jsonContentSection.classList.remove('d-none');
    } else if (contentType === 'image' || contentType === 'file') {
        fileContentSection.classList.remove('d-none');
    }
}

// Utility function to escape HTML
function escapeHtml(text) {
    if (!text) return '';
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
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

// Utility function to convert array buffer to base64
function arrayBufferToBase64(buffer) {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;

    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }

    return window.btoa(binary);
} 