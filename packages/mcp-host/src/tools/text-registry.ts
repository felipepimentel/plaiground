import { SandboxedToolRegistry } from './sandboxed-tool-registry';
import { TEXT_TOOLS, TEXT_TOOL_HANDLERS } from './text-tools';
import { ToolRegistry } from './tool-registry';

/**
 * Register all text tools with a tool registry
 * 
 * @param registry Tool registry to register with
 * @param sandbox Whether to use sandboxed execution
 */
export function registerTextTools(
    registry: ToolRegistry | SandboxedToolRegistry,
    sandbox: boolean = true
): void {
    // Register each text tool with its handler
    for (const [name, tool] of Object.entries(TEXT_TOOLS)) {
        const handler = TEXT_TOOL_HANDLERS[name];
        if (!handler) {
            console.warn(`No handler found for text tool: ${name}`);
            continue;
        }

        if (registry instanceof SandboxedToolRegistry) {
            registry.registerTool(tool, { sandbox });
        } else {
            registry.registerTool(tool, handler);
        }
    }
} 