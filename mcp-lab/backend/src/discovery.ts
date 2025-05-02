// MCP Server Auto Discovery Module
import { watch } from 'chokidar';
import fs from 'fs';
import path from 'path';

// Define interfaces for auto-discovery configuration
export interface AutoDiscoveryConfig {
    enabled: boolean;
    directories: string[];
    conventions: {
        lookFor: string[];
        packageSignatures: string[];
    };
    hotReload: {
        enabled: boolean;
        watchFiles: boolean;
        debounceMs: number;
    };
    defaultCategory?: string;
}

export interface McpServerDefinition {
    name: string;
    type: 'stdio' | 'websocket';
    description?: string;
    command?: string;
    args?: string[];
    cwd?: string;
    url?: string;
    env?: Record<string, string>;
    autoDiscovered?: boolean;
    category?: string;
}

// File watchers for hot reload
let watchers: { [dir: string]: any } = {};

/**
 * Discover MCP servers in the specified directories based on convention rules
 */
export async function discoverServers(
    configDir: string,
    autoDiscoveryConfig: AutoDiscoveryConfig
): Promise<Map<string, McpServerDefinition>> {
    if (!autoDiscoveryConfig?.enabled) {
        console.log('[Discovery] Auto-discovery disabled');
        return new Map();
    }

    const discoveredServers = new Map<string, McpServerDefinition>();

    for (const relativeDir of autoDiscoveryConfig.directories) {
        // Resolve directory relative to the mcp-lab-config.json location
        const baseDir = path.dirname(configDir);
        const directory = path.resolve(baseDir, relativeDir);

        console.log(`[Discovery] Scanning directory: ${directory}`);

        try {
            if (!fs.existsSync(directory)) {
                console.warn(`[Discovery] Directory does not exist: ${directory}`);
                continue;
            }

            const subdirs = fs.readdirSync(directory, { withFileTypes: true })
                .filter(dirent => dirent.isDirectory())
                .map(dirent => path.join(directory, dirent.name));

            for (const serverDir of subdirs) {
                const serverName = path.basename(serverDir);
                const serverConfig = await detectMcpServer(
                    serverDir, 
                    autoDiscoveryConfig.conventions,
                    autoDiscoveryConfig.defaultCategory
                );

                if (serverConfig) {
                    discoveredServers.set(serverName, {
                        ...serverConfig,
                        name: serverName,
                        autoDiscovered: true
                    });
                    console.log(`[Discovery] Found MCP server: ${serverName} at ${serverDir}`);
                }
            }

            // Setup file watching for hot reload if enabled
            if (autoDiscoveryConfig.hotReload.enabled && autoDiscoveryConfig.hotReload.watchFiles) {
                setupWatcher(directory, autoDiscoveryConfig.hotReload.debounceMs);
            }
        } catch (error) {
            console.error(`[Discovery] Error scanning directory ${directory}:`, error);
        }
    }

    return discoveredServers;
}

/**
 * Check if a directory contains an MCP server based on conventions
 */
async function detectMcpServer(
    directory: string,
    conventions: { lookFor: string[]; packageSignatures: string[] },
    defaultCategory?: string
): Promise<McpServerDefinition | null> {
    // Check for package.json signature first
    const packageJsonPath = path.join(directory, 'package.json');

    if (fs.existsSync(packageJsonPath)) {
        try {
            const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
            const hasMcpDependency = conventions.packageSignatures.some(signature =>
                (packageJson.dependencies && signature in packageJson.dependencies) ||
                (packageJson.devDependencies && signature in packageJson.devDependencies)
            );

            if (hasMcpDependency) {
                // Find the main entry point
                const mainFile = packageJson.main || 'index.js';
                const mainPath = path.join(directory, mainFile);

                if (fs.existsSync(mainPath)) {
                    return {
                        type: 'stdio',
                        command: 'node',
                        args: [mainPath, '--stdio'],
                        cwd: directory,
                        description: packageJson.description || `Auto-discovered MCP server: ${path.basename(directory)}`,
                        category: defaultCategory
                    };
                }
            }
        } catch (error) {
            console.error(`[Discovery] Error parsing package.json in ${directory}:`, error);
        }
    }

    // Look for conventional entry points
    for (const entryPoint of conventions.lookFor) {
        const entryPath = path.join(directory, entryPoint);

        if (fs.existsSync(entryPath)) {
            // Try to determine the type of server based on the file extension
            if (entryPath.endsWith('.py')) {
                return {
                    type: 'stdio',
                    command: 'python',
                    args: [entryPath, '--stdio'],
                    cwd: directory,
                    description: `Auto-discovered Python MCP server: ${path.basename(directory)}`,
                    category: defaultCategory
                };
            } else if (entryPath.endsWith('.js')) {
                return {
                    type: 'stdio',
                    command: 'node',
                    args: [entryPath, '--stdio'],
                    cwd: directory,
                    description: `Auto-discovered JavaScript MCP server: ${path.basename(directory)}`,
                    category: defaultCategory
                };
            }
        }
    }

    return null;
}

/**
 * Set up a file watcher for a directory
 */
function setupWatcher(directory: string, debounceMs: number) {
    // Close existing watcher if any
    if (watchers[directory]) {
        watchers[directory].close();
    }

    // Create a new watcher with debounce
    const watcher = watch(directory, {
        persistent: true,
        ignoreInitial: true,
        depth: 3,
        awaitWriteFinish: {
            stabilityThreshold: debounceMs,
            pollInterval: 100
        }
    });

    let timeout: NodeJS.Timeout;

    const debouncedEmit = () => {
        clearTimeout(timeout);
        timeout = setTimeout(() => {
            console.log(`[HotReload] Changes detected in ${directory}`);
            process.emit('mcp:reload', { directory });
        }, debounceMs);
    };

    watcher.on('add', debouncedEmit);
    watcher.on('change', debouncedEmit);
    watcher.on('unlink', debouncedEmit);

    watchers[directory] = watcher;
    console.log(`[HotReload] Watching ${directory} for changes`);
}

/**
 * Close all file watchers
 */
export function closeWatchers() {
    Object.values(watchers).forEach(watcher => {
        if (watcher && typeof watcher.close === 'function') {
            watcher.close();
        }
    });
    watchers = {};
}

/**
 * Refresh discovered servers without full restart
 */
export async function refreshServers(
    configDir: string,
    autoDiscoveryConfig: AutoDiscoveryConfig,
    currentAutoServers: Map<string, McpServerDefinition>
): Promise<Map<string, McpServerDefinition>> {
    const freshServers = await discoverServers(configDir, autoDiscoveryConfig);

    // Find changed and new servers
    const changes = new Map<string, McpServerDefinition>();

    // Add servers that are new or changed
    for (const [name, server] of freshServers.entries()) {
        const current = currentAutoServers.get(name);
        // If server is new or command/args/cwd changed
        if (!current ||
            current.command !== server.command ||
            JSON.stringify(current.args) !== JSON.stringify(server.args) ||
            current.cwd !== server.cwd) {
            changes.set(name, server);
        }
    }

    // Find removed servers
    const removed = new Set<string>();
    for (const [name, server] of currentAutoServers.entries()) {
        if (server.autoDiscovered && !freshServers.has(name)) {
            removed.add(name);
        }
    }

    console.log(`[HotReload] Refresh found ${changes.size} new/changed servers and ${removed.size} removed servers`);

    return { changes, removed, all: freshServers };
} 