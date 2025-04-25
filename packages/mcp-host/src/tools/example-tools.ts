import { Tool } from '@plaiground/common';
import { ToolExecutionFn, ToolRegistry } from './tool-registry';

/**
 * Example tools for demonstration purposes
 */

/**
 * Echo tool that returns the input data
 */
export const echoTool: Tool = {
    name: 'echo',
    description: 'Returns the input data back to the caller',
    parameters: {
        type: 'object',
        properties: {
            message: {
                type: 'string',
                description: 'Message to echo back'
            },
            times: {
                type: 'number',
                description: 'Number of times to repeat the message',
                default: 1
            }
        },
        required: ['message']
    }
};

/**
 * Echo tool implementation
 */
export const echoToolFn: ToolExecutionFn = async (args, context) => {
    const message = args.message as string;
    const times = (args.times as number) || 1;

    const result = Array(times).fill(message).join(' ');

    return {
        message: result,
        timestamp: new Date().toISOString(),
        context: {
            clientId: context?.clientId,
            sessionId: context?.sessionId,
            userId: context?.userId
        }
    };
};

/**
 * Calculator tool that performs basic math operations
 */
export const calculatorTool: Tool = {
    name: 'calculator',
    description: 'Performs basic math operations',
    parameters: {
        type: 'object',
        properties: {
            operation: {
                type: 'string',
                description: 'Math operation to perform',
                enum: ['add', 'subtract', 'multiply', 'divide']
            },
            a: {
                type: 'number',
                description: 'First operand'
            },
            b: {
                type: 'number',
                description: 'Second operand'
            }
        },
        required: ['operation', 'a', 'b']
    }
};

/**
 * Calculator tool implementation
 */
export const calculatorToolFn: ToolExecutionFn = async (args, context) => {
    const operation = args.operation as string;
    const a = args.a as number;
    const b = args.b as number;

    let result: number;

    switch (operation) {
        case 'add':
            result = a + b;
            break;
        case 'subtract':
            result = a - b;
            break;
        case 'multiply':
            result = a * b;
            break;
        case 'divide':
            if (b === 0) {
                throw new Error('Division by zero');
            }
            result = a / b;
            break;
        default:
            throw new Error(`Unknown operation: ${operation}`);
    }

    return {
        operation,
        a,
        b,
        result
    };
};

/**
 * Date tool that provides date and time utilities
 */
export const dateTool: Tool = {
    name: 'date',
    description: 'Provides date and time utilities',
    parameters: {
        type: 'object',
        properties: {
            format: {
                type: 'string',
                description: 'Date format (currently only "iso" is supported)',
                default: 'iso'
            },
            timezone: {
                type: 'string',
                description: 'Timezone (currently ignored, always uses UTC)',
                default: 'UTC'
            }
        }
    }
};

/**
 * Date tool implementation
 */
export const dateToolFn: ToolExecutionFn = async (args, context) => {
    const now = new Date();

    return {
        now: now.toISOString(),
        timestamp: now.getTime(),
        date: now.toDateString(),
        time: now.toTimeString()
    };
};

/**
 * Register all example tools with a tool registry
 */
export function registerExampleTools(registry: ToolRegistry): void {
    // Register echo tool
    registry.registerTool(echoTool, echoToolFn);

    // Register calculator tool
    registry.registerTool(calculatorTool, calculatorToolFn);

    // Register date tool
    registry.registerTool(dateTool, dateToolFn);

    console.log('[Example Tools] Registered example tools: echo, calculator, date');
} 