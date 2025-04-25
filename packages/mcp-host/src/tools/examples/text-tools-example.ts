import { SandboxedToolRegistry } from '../sandboxed-tool-registry';
import { registerTextTools } from '../text-registry';
import { ToolManager } from '../tool-manager';

/**
 * Example of setting up and using text tools
 */
async function textToolsExample() {
    console.log('Starting text tools example...');

    // Create a sandboxed tool registry
    const toolRegistry = new SandboxedToolRegistry({
        sandboxAllTools: true, // Execute all tools in sandbox
        sandboxConfig: {
            timeout: 5000, // 5 second timeout
            memoryLimit: 64, // 64MB memory limit
        },
    });

    // Create tool manager
    const toolManager = new ToolManager({
        toolRegistry,
        logging: {
            rpcCalls: true,
            toolCalls: true,
        },
    });

    // Register text tools
    registerTextTools(toolRegistry);

    console.log('Text tools registered:');
    console.log(toolManager.listTools().map(tool => tool.name));

    // Example: Count characters in text
    const text = 'Hello, world! This is an example text.';

    try {
        const charCountResult = await toolRegistry.executeTool('text.countChars', { text });
        console.log(`Character count: ${charCountResult.result}`);

        const wordCountResult = await toolRegistry.executeTool('text.countWords', { text });
        console.log(`Word count: ${wordCountResult.result}`);

        const uppercaseResult = await toolRegistry.executeTool('text.changeCase', {
            text,
            case: 'upper'
        });
        console.log(`Uppercase: ${uppercaseResult.result}`);

        const splitResult = await toolRegistry.executeTool('text.split', {
            text,
            delimiter: ' '
        });
        console.log(`Split words:`, splitResult.result);

        const matchResult = await toolRegistry.executeTool('text.match', {
            text,
            pattern: '\\w+',
            global: true
        });
        console.log(`Matched words:`, matchResult.result);
    } catch (error) {
        console.error('Error executing text tools:', error);
    }
}

// Run the example if this script is executed directly
if (require.main === module) {
    textToolsExample().catch(error => {
        console.error('Example failed:', error);
        process.exit(1);
    });
} 