import { McpClient } from '@plaiground/mcp-client';
import { ClientManager } from '../../client-manager/client-manager';
import { McpHost } from '../../host/mcp-host';
import { SandboxedToolRegistry } from '../../tools/sandboxed-tool-registry';
import { SessionManager } from '../session-manager';

// Performance test configuration
const TEST_CONFIG = {
    // Test durations and limits
    DURATION_MS: 10000, // 10 seconds test
    CONNECTION_LIMIT: 100, // Maximum concurrent connections to test
    REQUESTS_PER_CLIENT: 50, // Number of requests each client will make

    // Performance thresholds
    MIN_RPS: 50, // Minimum expected requests per second
    MAX_LATENCY_MS: 200, // Maximum acceptable average latency
    MAX_ERROR_RATE: 0.01, // Maximum acceptable error rate (1%)

    // Host setup
    HOST_PORT_HTTP: 5456,
    HOST_PORT_WS: 5457,
};

// Helper to wait
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Performance metrics collector
class PerformanceMetrics {
    startTime: number;
    endTime: number = 0;
    totalRequests: number = 0;
    successfulRequests: number = 0;
    failedRequests: number = 0;
    latencies: number[] = [];

    constructor() {
        this.startTime = Date.now();
    }

    recordSuccess(latencyMs: number) {
        this.totalRequests++;
        this.successfulRequests++;
        this.latencies.push(latencyMs);
    }

    recordFailure() {
        this.totalRequests++;
        this.failedRequests++;
    }

    finalize() {
        this.endTime = Date.now();
    }

    get durationSec() {
        return (this.endTime - this.startTime) / 1000;
    }

    get requestsPerSecond() {
        return this.totalRequests / this.durationSec;
    }

    get errorRate() {
        return this.failedRequests / this.totalRequests;
    }

    get avgLatencyMs() {
        if (this.latencies.length === 0) return 0;
        return this.latencies.reduce((sum, lat) => sum + lat, 0) / this.latencies.length;
    }

    get maxLatencyMs() {
        if (this.latencies.length === 0) return 0;
        return Math.max(...this.latencies);
    }

    get p95LatencyMs() {
        if (this.latencies.length === 0) return 0;
        const sorted = [...this.latencies].sort((a, b) => a - b);
        const idx = Math.floor(sorted.length * 0.95);
        return sorted[idx];
    }

    printSummary() {
        console.log('\n======== Performance Test Results ========');
        console.log(`Duration: ${this.durationSec.toFixed(2)}s`);
        console.log(`Total Requests: ${this.totalRequests}`);
        console.log(`Successful: ${this.successfulRequests}`);
        console.log(`Failed: ${this.failedRequests}`);
        console.log(`Error Rate: ${(this.errorRate * 100).toFixed(2)}%`);
        console.log(`Requests/sec: ${this.requestsPerSecond.toFixed(2)}`);
        console.log(`Avg Latency: ${this.avgLatencyMs.toFixed(2)}ms`);
        console.log(`P95 Latency: ${this.p95LatencyMs.toFixed(2)}ms`);
        console.log(`Max Latency: ${this.maxLatencyMs.toFixed(2)}ms`);
        console.log('==========================================\n');
    }
}

describe('MCP Performance & Stress Tests', () => {
    let host: McpHost;
    let toolRegistry: SandboxedToolRegistry;
    let metrics: PerformanceMetrics;

    beforeAll(async () => {
        console.log('Setting up performance test environment...');

        // Create and configure tool registry with test tools
        toolRegistry = new SandboxedToolRegistry({
            sandboxAllTools: true,
            sandboxConfig: {
                timeout: 2000,
                memoryLimit: 64,
            },
        });

        // Register test tools that we'll use for performance testing
        registerPerformanceTestTools(toolRegistry);

        // Create managers
        const clientManager = new ClientManager();
        const sessionManager = new SessionManager({ clientManager });

        // Create and start the host
        host = new McpHost({
            toolRegistry,
            clientManager,
            sessionManager,
            transports: [
                {
                    type: 'http',
                    port: TEST_CONFIG.HOST_PORT_HTTP,
                },
                {
                    type: 'websocket',
                    port: TEST_CONFIG.HOST_PORT_WS,
                },
            ],
        });

        // Start the host
        await host.start();
        console.log('Host started for performance testing');

        // Wait for host to initialize
        await wait(500);
    });

    afterAll(async () => {
        if (host) {
            await host.stop();
            console.log('Host stopped');
        }
    });

    // Register performance test tools
    function registerPerformanceTestTools(registry: SandboxedToolRegistry) {
        // Fast echo - low CPU, minimal processing
        registry.registerTool({
            name: 'perf.echo',
            description: 'Echo the input with minimal processing',
            parameters: {
                type: 'object',
                properties: {
                    message: { type: 'string' },
                },
                required: ['message'],
            },
            execute: async (params) => {
                return { message: params.message };
            },
        });

        // CPU intensive operation
        registry.registerTool({
            name: 'perf.compute',
            description: 'Perform CPU-intensive calculation',
            parameters: {
                type: 'object',
                properties: {
                    iterations: { type: 'number' },
                },
                required: ['iterations'],
            },
            execute: async (params) => {
                const { iterations = 1000000 } = params;
                let result = 0;

                // Simple CPU-bound work
                for (let i = 0; i < iterations; i++) {
                    result += Math.sin(i) * Math.cos(i);
                }

                return { result, iterations };
            },
        });

        // Simulated I/O with delay
        registry.registerTool({
            name: 'perf.io',
            description: 'Simulate I/O operation with delay',
            parameters: {
                type: 'object',
                properties: {
                    delayMs: { type: 'number' },
                    dataSize: { type: 'number' },
                },
                required: [],
            },
            execute: async (params) => {
                const { delayMs = 50, dataSize = 1000 } = params;

                // Simulate I/O delay
                await wait(delayMs);

                // Generate response data of requested size
                const data = 'X'.repeat(dataSize);

                return {
                    success: true,
                    timestamp: Date.now(),
                    data
                };
            },
        });
    }

    // Create a test client
    async function createTestClient(clientId: string): Promise<McpClient> {
        const client = new McpClient({
            clientId,
            transport: {
                type: 'http',
                endpoint: `http://localhost:${TEST_CONFIG.HOST_PORT_HTTP}/api/mcp`,
            },
            autoReconnect: false,
        });

        await client.connect();
        return client;
    }

    // Run a single client workload
    async function runClientWorkload(clientId: string, metrics: PerformanceMetrics) {
        const client = await createTestClient(`perf-client-${clientId}`);

        try {
            // Make a series of requests
            for (let i = 0; i < TEST_CONFIG.REQUESTS_PER_CLIENT; i++) {
                try {
                    const startTime = Date.now();

                    // Alternate between different tool calls
                    if (i % 3 === 0) {
                        // Fast echo request
                        await client.callTool('perf.echo', {
                            message: `Test message ${i} from client ${clientId}`
                        });
                    } else if (i % 3 === 1) {
                        // Compute request (lighter for perf test)
                        await client.callTool('perf.compute', {
                            iterations: 10000 // Small number for performance test
                        });
                    } else {
                        // I/O simulation request
                        await client.callTool('perf.io', {
                            delayMs: 10,
                            dataSize: 100
                        });
                    }

                    const latency = Date.now() - startTime;
                    metrics.recordSuccess(latency);
                } catch (error) {
                    metrics.recordFailure();
                }
            }
        } finally {
            await client.disconnect();
        }
    }

    // Connection scaling test - tests how system performs with increasing connections
    it('should handle connection scaling', async () => {
        metrics = new PerformanceMetrics();
        console.log(`Starting connection scaling test with up to ${TEST_CONFIG.CONNECTION_LIMIT} clients...`);

        const clientPromises = [];

        // Create and connect clients in batches
        for (let i = 1; i <= TEST_CONFIG.CONNECTION_LIMIT; i++) {
            clientPromises.push(runClientWorkload(i.toString(), metrics));

            // Progress logging
            if (i % 10 === 0) {
                console.log(`Created ${i} clients...`);
            }

            // Throttle client creation slightly to avoid overwhelming the server
            if (i % 5 === 0) {
                await wait(100);
            }
        }

        // Wait for all clients to complete their workloads
        await Promise.all(clientPromises);

        metrics.finalize();
        metrics.printSummary();

        // Assert performance expectations
        expect(metrics.requestsPerSecond).toBeGreaterThan(TEST_CONFIG.MIN_RPS);
        expect(metrics.avgLatencyMs).toBeLessThan(TEST_CONFIG.MAX_LATENCY_MS);
        expect(metrics.errorRate).toBeLessThan(TEST_CONFIG.MAX_ERROR_RATE);
    }, TEST_CONFIG.DURATION_MS + 5000); // Add 5 seconds buffer to test timeout

    // Sustained load test - tests how system performs under constant load
    it('should handle sustained load', async () => {
        metrics = new PerformanceMetrics();
        console.log('Starting sustained load test...');

        const testDuration = TEST_CONFIG.DURATION_MS;
        const endTime = Date.now() + testDuration;
        const clientPromises: Promise<void>[] = [];
        let activePromises: Promise<void>[] = [];

        // Keep sending requests for the specified duration
        let clientCounter = 0;
        while (Date.now() < endTime) {
            clientCounter++;
            const workload = runClientWorkload(`sustained-${clientCounter}`, metrics);
            clientPromises.push(workload);
            activePromises.push(workload);

            // Limit to 20 concurrent clients for sustained test
            if (activePromises.length >= 20) {
                await Promise.race(activePromises);

                // Find completed promises and remove them
                const stillPending = await Promise.all(
                    activePromises.map(async p => {
                        // Create a promise that resolves immediately if the workload is done
                        const status = await Promise.race([
                            p.then(() => 'done' as const),
                            Promise.resolve('pending' as const)
                        ]);
                        return { promise: p, status };
                    })
                );

                // Filter out completed promises
                activePromises = stillPending
                    .filter(item => item.status === 'pending')
                    .map(item => item.promise);
            }

            // Short delay between client creations
            await wait(50);
        }

        // Wait for all clients to complete
        await Promise.all(clientPromises);

        metrics.finalize();
        metrics.printSummary();

        // Assert performance expectations
        expect(metrics.requestsPerSecond).toBeGreaterThan(TEST_CONFIG.MIN_RPS);
        expect(metrics.avgLatencyMs).toBeLessThan(TEST_CONFIG.MAX_LATENCY_MS);
        expect(metrics.errorRate).toBeLessThan(TEST_CONFIG.MAX_ERROR_RATE);
    }, TEST_CONFIG.DURATION_MS + 10000); // Add 10 seconds buffer

    // Burst test - tests how system handles sudden spikes in traffic
    it('should handle traffic bursts', async () => {
        metrics = new PerformanceMetrics();
        console.log('Starting burst load test...');

        // Create several bursts of traffic
        for (let burst = 0; burst < 3; burst++) {
            console.log(`Initiating traffic burst ${burst + 1}...`);

            // Create a burst of clients (50 simultaneous)
            const burstPromises = [];
            for (let i = 0; i < 50; i++) {
                burstPromises.push(runClientWorkload(`burst-${burst}-${i}`, metrics));
            }

            // Wait for all clients in this burst to complete
            await Promise.all(burstPromises);

            // Wait between bursts
            if (burst < 2) {
                console.log('Waiting between bursts...');
                await wait(1000);
            }
        }

        metrics.finalize();
        metrics.printSummary();

        // Assert performance expectations
        expect(metrics.avgLatencyMs).toBeLessThan(TEST_CONFIG.MAX_LATENCY_MS * 1.5); // Allow higher latency for bursts
        expect(metrics.errorRate).toBeLessThan(TEST_CONFIG.MAX_ERROR_RATE);
    }, TEST_CONFIG.DURATION_MS + 10000); // Add buffer time
}); 