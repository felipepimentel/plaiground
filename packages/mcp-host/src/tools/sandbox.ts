import { McpError, McpErrorCode } from '@plaiground/common';
import { VM, VMScript } from 'vm2';
import { ToolExecutionContext, ToolExecutionFn } from './tool-registry';

/**
 * Configuration for the sandbox
 */
export interface SandboxConfig {
    /**
     * Timeout for script execution in milliseconds
     * @default 5000
     */
    timeout?: number;

    /**
     * Allow access to Node Buffer
     * @default false
     */
    allowBuffer?: boolean;

    /**
     * Allow access to Node.js built-in modules
     * @default []
     */
    allowedModules?: string[];

    /**
     * External modules to include in the sandbox
     * @default {}
     */
    external?: Record<string, unknown>;

    /**
     * Memory limit for the sandbox in MB
     * @default 128
     */
    memoryLimit?: number;
}

/**
 * Sandbox execution options
 */
export interface SandboxOptions {
    /**
     * Timeout for script execution in milliseconds
     * Overrides the default timeout
     */
    timeout?: number;

    /**
     * Additional external objects to include in the sandbox context
     */
    external?: Record<string, unknown>;
}

/**
 * Default sandbox configuration
 */
export const DEFAULT_SANDBOX_CONFIG: SandboxConfig = {
    timeout: 5000,
    allowBuffer: false,
    allowedModules: [],
    external: {},
    memoryLimit: 128,
};

/**
 * Result of sandbox execution
 */
export interface SandboxResult<T = unknown> {
    /**
     * Execution result
     */
    result: T;

    /**
     * Execution logs
     */
    logs: string[];

    /**
     * Execution errors
     */
    errors: string[];

    /**
     * Execution time in milliseconds
     */
    executionTime: number;

    /**
     * Memory usage in bytes
     */
    memoryUsage?: number;
}

/**
 * A secure sandbox for executing code safely
 */
export class Sandbox {
    private readonly config: SandboxConfig;
    private consoleLogs: string[] = [];
    private consoleErrors: string[] = [];

    /**
     * Create a new sandbox instance
     */
    constructor(config: Partial<SandboxConfig> = {}) {
        this.config = {
            ...DEFAULT_SANDBOX_CONFIG,
            ...config,
        };
    }

    /**
     * Execute code in the sandbox
     */
    public async execute(
        code: string,
        context: Record<string, unknown> = {},
        options: SandboxOptions = {}
    ): Promise<unknown> {
        try {
            // Create VM with specified options
            const vm = new VM({
                timeout: options.timeout ?? this.config.timeout,
                sandbox: {
                    ...this.config.external,
                    ...options.external,
                    ...context,
                    console: {
                        log: (...args: unknown[]) => console.log('[SANDBOX]', ...args),
                        error: (...args: unknown[]) => console.error('[SANDBOX]', ...args),
                        warn: (...args: unknown[]) => console.warn('[SANDBOX]', ...args),
                        info: (...args: unknown[]) => console.info('[SANDBOX]', ...args),
                    },
                },
                allowAsync: true,
            });

            // Add allowed Node.js modules if specified
            if (this.config.allowedModules?.length) {
                this.config.allowedModules.forEach((moduleName) => {
                    try {
                        // eslint-disable-next-line @typescript-eslint/no-var-requires
                        const module = require(moduleName);
                        vm.freeze(module, moduleName);
                    } catch (err) {
                        console.warn(`[Sandbox] Failed to load module ${moduleName}:`, err);
                    }
                });
            }

            // Allow Buffer if specified
            if (this.config.allowBuffer) {
                vm.freeze(Buffer, 'Buffer');
            }

            // Compile and run the script
            const script = new VMScript(code);
            return vm.run(script);
        } catch (error) {
            if (error instanceof Error) {
                if (error.message.includes('Script execution timed out')) {
                    throw new McpError(
                        McpErrorCode.ToolExecutionTimeout,
                        'Script execution timed out',
                        error
                    );
                }

                throw new McpError(
                    McpErrorCode.SandboxExecutionError,
                    `Sandbox execution error: ${error.message}`,
                    error
                );
            }

            throw new McpError(
                McpErrorCode.SandboxExecutionError,
                `Sandbox execution error: ${String(error)}`,
                error
            );
        }
    }

    /**
     * Create a wrapper function to execute a tool in the sandbox
     */
    public createSandboxedFunction<T extends (...args: any[]) => any>(
        fn: T
    ): T {
        return (async (...args: Parameters<T>): Promise<ReturnType<T>> => {
            const serializedArgs = JSON.stringify(args);

            const code = `
                const args = JSON.parse('${serializedArgs.replace(/'/g, "\\'")}');
                const fn = arguments[0];
                return fn(...args);
            `;

            return await this.execute(code, { fn }) as ReturnType<T>;
        }) as T;
    }

    /**
     * Execute a function in the sandbox
     */
    public async execute<T = unknown>(
        fn: Function | string,
        args: Record<string, unknown> = {},
        context?: ToolExecutionContext
    ): Promise<SandboxResult<T>> {
        // Reset console logs
        this.consoleLogs = [];
        this.consoleErrors = [];

        const startTime = Date.now();
        const startMemory = process.memoryUsage().heapUsed;

        try {
            // Configure VM
            const vm = this.createVM();

            // Prepare function code
            const fnCode = typeof fn === 'function'
                ? `(${fn.toString()})`
                : fn;

            // Create execution code
            const code = `
                (async function() {
                    try {
                        const fn = ${fnCode};
                        const args = ${JSON.stringify(args)};
                        const context = ${JSON.stringify(context || {})};
                        const result = await fn(args, context);
                        return { success: true, result };
                    } catch (error) {
                        return { 
                            success: false, 
                            error: {
                                name: error.name,
                                message: error.message,
                                stack: error.stack
                            }
                        };
                    }
                })();
            `;

            // Create script
            const script = new VMScript(code);

            // Execute script
            const result = await vm.run(script);
            const endTime = Date.now();
            const endMemory = process.memoryUsage().heapUsed;

            if (!result.success) {
                throw new McpError(
                    McpErrorCode.ToolExecutionError,
                    result.error.message,
                    result.error
                );
            }

            return {
                result: result.result as T,
                logs: [...this.consoleLogs],
                errors: [...this.consoleErrors],
                executionTime: endTime - startTime,
                memoryUsage: endMemory - startMemory,
            };
        } catch (error) {
            const endTime = Date.now();

            if (error instanceof McpError) {
                throw error;
            }

            throw new McpError(
                McpErrorCode.ToolExecutionError,
                error instanceof Error ? error.message : String(error),
                error
            );
        }
    }

    /**
     * Execute a tool function in the sandbox
     */
    public createSandboxedToolExecutor(fn: ToolExecutionFn): ToolExecutionFn {
        return async (args: Record<string, unknown>, context?: ToolExecutionContext) => {
            const result = await this.execute(fn, args, context);
            return result.result;
        };
    }

    /**
     * Execute code in the sandbox
     */
    public async executeCode<T = unknown>(
        code: string,
        args: Record<string, unknown> = {},
        context?: ToolExecutionContext
    ): Promise<SandboxResult<T>> {
        // Create a function from code
        const fnCode = `
            async function sandboxedFunction(args, context) {
                ${code}
            }
            sandboxedFunction
        `;

        return this.execute<T>(fnCode, args, context);
    }

    /**
     * Create a VM instance with the specified configuration
     */
    private createVM(): VM {
        const sandbox: Record<string, unknown> = {
            // Provide a safe subset of globals
            Date,
            Object,
            Array,
            Map,
            Set,
            JSON,
            Math,
            Number,
            String,
            RegExp,
            Error,
            Buffer,
            Promise,
            Uint8Array,
            // Other safe globals can be added here
        };

        // Configure console
        if (this.config.console === 'redirect') {
            sandbox.console = {
                log: (...args: any[]) => {
                    this.consoleLogs.push(args.map(arg =>
                        typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
                    ).join(' '));
                },
                error: (...args: any[]) => {
                    this.consoleErrors.push(args.map(arg =>
                        typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
                    ).join(' '));
                },
                info: (...args: any[]) => {
                    this.consoleLogs.push(args.map(arg =>
                        typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
                    ).join(' '));
                },
                warn: (...args: any[]) => {
                    this.consoleErrors.push(args.map(arg =>
                        typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
                    ).join(' '));
                },
            };
        } else if (this.config.console === 'inherit') {
            sandbox.console = console;
        } else {
            // Disable console
            sandbox.console = {
                log: () => { },
                error: () => { },
                info: () => { },
                warn: () => { },
            };
        }

        // Create VM with sandbox
        const vm = new VM({
            timeout: this.config.timeout,
            sandbox,
            wasm: this.config.allowWasm,
            eval: false,
            fixAsync: true,
        });

        return vm;
    }
} 