import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { z } from "zod";

// --- Configuration & Security --- 

// Determine the directory of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Define the base directory for filesystem operations relative to this server's location
// IMPORTANT: This restricts server operations to a specific 'sandbox' directory.
const BASE_DIR = path.resolve(__dirname, '..', 'sandbox'); // Go up one level from dist/ to src/, then into sandbox
console.log(`[FS Server] Base directory set to: ${BASE_DIR}`);

// Ensure the base directory exists
async function ensureBaseDir() {
    try {
        await fs.mkdir(BASE_DIR, { recursive: true });
        console.log(`[FS Server] Ensured base directory exists: ${BASE_DIR}`);
    } catch (error) {
        console.error(`[FS Server] FATAL: Could not create base directory ${BASE_DIR}:`, error);
        process.exit(1); // Exit if we can't create the sandbox
    }
}

// Security helper: Resolves a user-provided path against BASE_DIR and prevents path traversal.
function resolvePath(userPath: string): string {
    const resolved = path.resolve(BASE_DIR, userPath);
    // Check if the resolved path is still within the BASE_DIR
    if (!resolved.startsWith(BASE_DIR)) {
        throw new Error(`Access denied: Path is outside the allowed base directory. Attempted path: ${userPath}`);
    }
    return resolved;
}

// --- Server Initialization --- 

const server = new McpServer({
    name: "Filesystem Server",
    version: "1.0.0",
    capabilities: {
        resources: {},
        tools: {}
    }
});

// --- Resources --- 

// fs://list/{directoryPath} - Lists directory contents
server.resource(
    "fsList",
    new ResourceTemplate("fs://list/{+directoryPath}", { list: undefined }), // Use {+path} for multi-segment paths
    async (uri, { directoryPath }) => {
        console.log(`[FS Server] Received fsList request for path: ${directoryPath}`);
        const targetDir = resolvePath(directoryPath || '.'); // Default to base dir if no path
        console.log(`[FS Server] Resolved path to: ${targetDir}`);
        try {
            const entries = await fs.readdir(targetDir, { withFileTypes: true });
            const content = entries.map(entry =>
                `${entry.isDirectory() ? '[D]' : '[F]'} ${entry.name}`
            ).join('\n');

            return {
                contents: [{ uri: uri.href, text: content || '(Directory is empty)' }]
            };
        } catch (error: any) {
            console.error(`[FS Server] Error listing ${targetDir}:`, error);
            return {
                contents: [{ uri: uri.href, text: `Error listing directory: ${error.message}` }],
                isError: true // Indicate error state if needed by client
            };
        }
    }
);

// fs://read/{filePath} - Reads file content
server.resource(
    "fsRead",
    new ResourceTemplate("fs://read/{+filePath}", { list: undefined }),
    async (uri, { filePath }) => {
        console.log(`[FS Server] Received fsRead request for path: ${filePath}`);
        if (!filePath) {
            return { contents: [{ uri: uri.href, text: 'Error: File path is required.' }], isError: true };
        }
        const targetFile = resolvePath(filePath);
        console.log(`[FS Server] Resolved path to: ${targetFile}`);
        try {
            // Basic protection against reading huge files - adjust limit as needed
            const stats = await fs.stat(targetFile);
            if (stats.isDirectory()) throw new Error('Cannot read a directory as a file.');
            if (stats.size > 1024 * 1024) { // 1MB limit
                throw new Error('File size exceeds the 1MB limit.');
            }
            const content = await fs.readFile(targetFile, 'utf-8');
            return {
                contents: [{ uri: uri.href, text: content }]
            };
        } catch (error: any) {
            console.error(`[FS Server] Error reading ${targetFile}:`, error);
            return {
                contents: [{ uri: uri.href, text: `Error reading file: ${error.message}` }],
                isError: true
            };
        }
    }
);

// --- Tools --- 

// writeFile Tool
server.tool(
    "writeFile",
    z.object({
        filePath: z.string().min(1, "File path is required."),
        content: z.string()
    }),
    async ({ filePath, content }) => {
        console.log(`[FS Server] Received writeFile request for path: ${filePath}`);
        const targetFile = resolvePath(filePath);
        console.log(`[FS Server] Resolved path to: ${targetFile}`);
        try {
            // Ensure the directory exists before writing
            await fs.mkdir(path.dirname(targetFile), { recursive: true });
            await fs.writeFile(targetFile, content, 'utf-8');
            console.log(`[FS Server] Successfully wrote file: ${targetFile}`);
            return {
                content: [{ type: "text", text: `Successfully wrote file: ${filePath}` }]
            };
        } catch (error: any) {
            console.error(`[FS Server] Error writing ${targetFile}:`, error);
            return {
                content: [{ type: "text", text: `Error writing file: ${error.message}` }],
                isError: true
            };
        }
    }
);

// createDirectory Tool
server.tool(
    "createDirectory",
    z.object({
        directoryPath: z.string().min(1, "Directory path is required.")
    }),
    async ({ directoryPath }) => {
        console.log(`[FS Server] Received createDirectory request for path: ${directoryPath}`);
        const targetDir = resolvePath(directoryPath);
        console.log(`[FS Server] Resolved path to: ${targetDir}`);
        try {
            await fs.mkdir(targetDir, { recursive: true });
            console.log(`[FS Server] Successfully created directory: ${targetDir}`);
            return {
                content: [{ type: "text", text: `Successfully created directory: ${directoryPath}` }]
            };
        } catch (error: any) {
            console.error(`[FS Server] Error creating directory ${targetDir}:`, error);
            return {
                content: [{ type: "text", text: `Error creating directory: ${error.message}` }],
                isError: true
            };
        }
    }
);

// --- Start Server --- 

async function startServer() {
    await ensureBaseDir(); // Make sure sandbox exists before starting
    const transport = new StdioServerTransport();
    console.log("[FS Server] Starting with StdioTransport...");
    await server.connect(transport);
    console.log("[FS Server] Connected and ready.");
}

startServer().catch(error => {
    console.error("[FS Server] Failed to start:", error);
    process.exit(1);
}); 