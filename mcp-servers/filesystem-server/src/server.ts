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
    console.error('[FS Server] Attempting to ensure base directory...'); // Log start
    try {
        await fs.mkdir(BASE_DIR, { recursive: true });
        console.error(`[FS Server] Ensured base directory exists: ${BASE_DIR}`); // Log success
    } catch (error) {
        console.error(`[FS Server] FATAL: Could not create/access base directory ${BASE_DIR}:`, error); // Log error
        process.exit(1); // Exit if we can't create the sandbox
    }
}

// Security helper: Resolves a user-provided path against BASE_DIR and prevents path traversal.
function resolvePath(userPath: string | string[]): string {
    // Join array segments if necessary
    const pathString = Array.isArray(userPath) ? path.join(...userPath) : userPath;
    const resolved = path.resolve(BASE_DIR, pathString);
    if (!resolved.startsWith(BASE_DIR)) {
        throw new Error(`Access denied: Path is outside the allowed base directory. Attempted path: ${pathString}`);
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
    new ResourceTemplate("fs://list/{+directoryPath}", { list: undefined }),
    async (uri, { directoryPath }) => {
        console.log(`[FS Server] Received fsList request for path: ${directoryPath}`);
        // Handle potential array path and default value
        const effectivePath = directoryPath && (Array.isArray(directoryPath) ? directoryPath.length > 0 : true) ? directoryPath : '.';
        const targetDir = resolvePath(effectivePath);
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
                isError: true
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
        if (!filePath || (Array.isArray(filePath) && filePath.length === 0)) {
            return { contents: [{ uri: uri.href, text: 'Error: File path is required.' }], isError: true };
        }
        // Handle potential array path
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

// Define types for validated arguments explicitly
type WriteFileArgs = { filePath: string; content: string };
type CreateDirectoryArgs = { directoryPath: string };

// writeFile Tool
server.tool(
    "writeFile",
    z.object({
        filePath: z.string().min(1, "File path is required."),
        content: z.string()
    }).shape,
    async (args: WriteFileArgs, _extra: any) => {
        const { filePath, content } = args;
        console.log(`[FS Server] Received writeFile request for path: ${filePath}`);
        const targetFile = resolvePath(filePath);
        console.log(`[FS Server] Resolved path to: ${targetFile}`);
        try {
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
    }).shape,
    async (args: CreateDirectoryArgs, _extra: any) => {
        const { directoryPath } = args;
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
    console.error('[FS Server] Running ensureBaseDir()...'); // Log before ensure
    await ensureBaseDir(); // Make sure sandbox exists before starting
    console.error('[FS Server] ensureBaseDir() completed. Creating StdioServerTransport...'); // Log after ensure
    const transport = new StdioServerTransport();
    console.error("[FS Server] StdioServerTransport created. Calling server.connect(transport)..."); // Log before connect
    try {
        await server.connect(transport);
        console.error("[FS Server] server.connect(transport) completed successfully. Server is ready."); // Log after connect success

    } catch (connectError) {
        console.error("[FS Server] FATAL: Error during server.connect(transport):", connectError); // Log connect error
        process.exit(1);
    }
}

console.error('[FS Server] Script loaded. Calling startServer()...'); // Log script start
startServer().catch(error => {
    // This catch might be redundant if connect errors exit, but keep for safety
    console.error("[FS Server] FATAL: Unhandled error during startup:", error);
    process.exit(1);
}); 