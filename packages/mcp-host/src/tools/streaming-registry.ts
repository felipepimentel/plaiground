import { createToolError } from '@plaiground/common';
import { EventEmitter } from 'events';
import { v4 as uuid } from 'uuid';
import { SandboxedToolRegistry } from './sandboxed-tool-registry';

// Stream events
export enum StreamEventType {
    DATA = 'data',
    ERROR = 'error',
    END = 'end',
    METADATA = 'metadata',
}

// Stream data type
export interface StreamData {
    type: StreamEventType;
    data?: any;
    metadata?: Record<string, any>;
    error?: Error;
    timestamp: number;
}

// Tool execution result for streaming operations
export interface StreamingResult {
    streamId: string;
    metadata?: Record<string, any>;
}

// Context for streaming operations
export interface StreamingContext {
    clientId?: string;
    sessionId?: string;
    streamId: string;
    sendMessage: (message: any) => Promise<void>;
}

// Registry for streaming tools
export class StreamingToolRegistry {
    private streams = new Map<string, EventEmitter>();
    private toolRegistry: SandboxedToolRegistry;

    constructor(toolRegistry: SandboxedToolRegistry) {
        this.toolRegistry = toolRegistry;
    }

    /**
     * Register a streaming tool
     */
    registerStreamingTool(
        name: string,
        description: string,
        parameters: any,
        streamExecutor: (params: any, context: StreamingContext) => Promise<void>
    ): void {
        // Register the tool with the regular tool registry
        this.toolRegistry.registerTool({
            name,
            description,
            parameters,
            execute: async (params, baseContext) => {
                // Create a stream ID
                const streamId = uuid();

                // Create a new event emitter for this stream
                const emitter = new EventEmitter();
                this.streams.set(streamId, emitter);

                // Create streaming context
                const context: StreamingContext = {
                    clientId: baseContext.clientId,
                    sessionId: baseContext.sessionId,
                    streamId,
                    sendMessage: async (message: any) => {
                        // Forward to client via base context
                        await baseContext.sendMessage(baseContext.clientId!, {
                            type: 'stream',
                            streamId,
                            ...message,
                        });
                    },
                };

                // Start streaming in background
                this.executeStream(streamExecutor, params, context).catch((error) => {
                    console.error(`Error in streaming execution for ${name}:`, error);
                    emitter.emit(StreamEventType.ERROR, {
                        type: StreamEventType.ERROR,
                        error,
                        timestamp: Date.now(),
                    });

                    // Clean up stream on error
                    this.streams.delete(streamId);
                });

                // Return stream ID to client
                return {
                    streamId,
                    metadata: {
                        toolName: name,
                        startedAt: new Date().toISOString(),
                    },
                };
            },
        });
    }

    /**
     * Execute a streaming operation
     */
    private async executeStream(
        executor: (params: any, context: StreamingContext) => Promise<void>,
        params: any,
        context: StreamingContext
    ): Promise<void> {
        const emitter = this.streams.get(context.streamId);
        if (!emitter) {
            throw createToolError(
                `Stream not found: ${context.streamId}`,
                'streaming',
                context.sessionId
            );
        }

        try {
            // Set up event listeners to forward events to client
            emitter.on(StreamEventType.DATA, async (data: StreamData) => {
                await context.sendMessage({
                    type: StreamEventType.DATA,
                    data: data.data,
                    timestamp: Date.now(),
                });
            });

            emitter.on(StreamEventType.METADATA, async (data: StreamData) => {
                await context.sendMessage({
                    type: StreamEventType.METADATA,
                    metadata: data.metadata,
                    timestamp: Date.now(),
                });
            });

            emitter.on(StreamEventType.ERROR, async (data: StreamData) => {
                await context.sendMessage({
                    type: StreamEventType.ERROR,
                    error: data.error?.message || 'Unknown error',
                    timestamp: Date.now(),
                });
            });

            emitter.on(StreamEventType.END, async () => {
                await context.sendMessage({
                    type: StreamEventType.END,
                    timestamp: Date.now(),
                });

                // Clean up after stream ends
                this.streams.delete(context.streamId);
            });

            // Execute the streaming function
            await executor(params, {
                ...context,
                // Add helper methods for the executor
                sendData: (data: any) => {
                    emitter.emit(StreamEventType.DATA, {
                        type: StreamEventType.DATA,
                        data,
                        timestamp: Date.now(),
                    });
                },
                sendMetadata: (metadata: Record<string, any>) => {
                    emitter.emit(StreamEventType.METADATA, {
                        type: StreamEventType.METADATA,
                        metadata,
                        timestamp: Date.now(),
                    });
                },
                sendError: (error: Error) => {
                    emitter.emit(StreamEventType.ERROR, {
                        type: StreamEventType.ERROR,
                        error,
                        timestamp: Date.now(),
                    });
                },
                end: () => {
                    emitter.emit(StreamEventType.END, {
                        type: StreamEventType.END,
                        timestamp: Date.now(),
                    });
                },
            });

        } catch (error) {
            // Emit error and end the stream
            emitter.emit(StreamEventType.ERROR, {
                type: StreamEventType.ERROR,
                error,
                timestamp: Date.now(),
            });

            emitter.emit(StreamEventType.END, {
                type: StreamEventType.END,
                timestamp: Date.now(),
            });

            // Clean up
            this.streams.delete(context.streamId);
        }
    }

    /**
     * Cancel a stream
     */
    async cancelStream(streamId: string): Promise<boolean> {
        const emitter = this.streams.get(streamId);
        if (!emitter) {
            return false;
        }

        // Emit end event
        emitter.emit(StreamEventType.END, {
            type: StreamEventType.END,
            timestamp: Date.now(),
        });

        // Clean up
        this.streams.delete(streamId);
        return true;
    }

    /**
     * Get active stream count
     */
    getActiveStreamCount(): number {
        return this.streams.size;
    }
}

/**
 * Example streaming tools
 */
export function registerStreamingExamples(registry: StreamingToolRegistry): void {
    // Streaming counter - sends incremental numbers
    registry.registerStreamingTool(
        'stream.counter',
        'Stream a sequence of numbers',
        {
            type: 'object',
            properties: {
                count: {
                    type: 'integer',
                    description: 'Number of values to send'
                },
                delay: {
                    type: 'integer',
                    description: 'Delay between values in ms'
                },
            },
            required: ['count'],
        },
        async (params, context) => {
            const { count, delay = 500 } = params;
            const { sendData, sendMetadata, end } = context as any;

            // Send metadata about the stream
            sendMetadata({
                totalItems: count,
                startTime: new Date().toISOString(),
            });

            // Stream numbers with delay
            for (let i = 0; i < count; i++) {
                sendData({ value: i, percentage: Math.round((i / count) * 100) });

                if (i < count - 1) {
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }

            // End the stream
            end();
        }
    );

    // Text chunking - simulates breaking large text into chunks
    registry.registerStreamingTool(
        'stream.textChunks',
        'Stream text in chunks',
        {
            type: 'object',
            properties: {
                text: {
                    type: 'string',
                    description: 'Text to stream'
                },
                chunkSize: {
                    type: 'integer',
                    description: 'Size of each chunk'
                },
                delay: {
                    type: 'integer',
                    description: 'Delay between chunks in ms'
                },
            },
            required: ['text'],
        },
        async (params, context) => {
            const { text, chunkSize = 20, delay = 300 } = params;
            const { sendData, sendMetadata, end } = context as any;

            // Split text into chunks
            const chunks = [];
            for (let i = 0; i < text.length; i += chunkSize) {
                chunks.push(text.substring(i, i + chunkSize));
            }

            // Send metadata
            sendMetadata({
                totalChunks: chunks.length,
                totalLength: text.length,
            });

            // Stream chunks with delay
            for (let i = 0; i < chunks.length; i++) {
                sendData({
                    chunk: chunks[i],
                    index: i,
                    percentage: Math.round((i / chunks.length) * 100)
                });

                if (i < chunks.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }

            // End the stream
            end();
        }
    );
} 