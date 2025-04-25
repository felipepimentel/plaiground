/**
 * Metrics collection and monitoring for MCP
 */

// Types of metrics
export enum MetricType {
    COUNTER = 'counter',
    GAUGE = 'gauge',
    HISTOGRAM = 'histogram',
    SUMMARY = 'summary',
}

// Basic metric definition
export interface MetricDefinition {
    name: string;
    help: string;
    type: MetricType;
    labelNames?: string[];
}

// Metric value - either a single value or a map of values with labels
export type MetricValue = number | Map<string, number>;

// Interface for external metric reporter implementations
export interface MetricReporter {
    register(definition: MetricDefinition): void;
    record(name: string, value: number, labels?: Record<string, string>): void;
    recordDuration(name: string, durationMs: number, labels?: Record<string, string>): void;
    clear(): void;
}

/**
 * In-memory metric reporter for simple use cases
 */
export class InMemoryMetricReporter implements MetricReporter {
    private metrics: Map<string, MetricDefinition> = new Map();
    private values: Map<string, Map<string, number>> = new Map();

    register(definition: MetricDefinition): void {
        this.metrics.set(definition.name, definition);
        this.values.set(definition.name, new Map());
    }

    record(name: string, value: number, labels: Record<string, string> = {}): void {
        if (!this.metrics.has(name)) {
            throw new Error(`Metric ${name} not registered`);
        }

        const metricValues = this.values.get(name)!;
        const labelsKey = this.labelsToKey(labels);

        const definition = this.metrics.get(name)!;

        if (definition.type === MetricType.COUNTER) {
            // For counters, increment the existing value
            const currentValue = metricValues.get(labelsKey) || 0;
            metricValues.set(labelsKey, currentValue + value);
        } else {
            // For other types, replace the value
            metricValues.set(labelsKey, value);
        }
    }

    recordDuration(
        name: string,
        durationMs: number,
        labels: Record<string, string> = {}
    ): void {
        this.record(name, durationMs, labels);
    }

    // Get all values for a metric
    getMetric(name: string): Map<string, number> | undefined {
        return this.values.get(name);
    }

    // Get all metrics and their values
    getAllMetrics(): Record<string, { definition: MetricDefinition; values: Map<string, number> }> {
        const result: Record<string, any> = {};

        this.metrics.forEach((definition, name) => {
            result[name] = {
                definition,
                values: this.values.get(name) || new Map(),
            };
        });

        return result;
    }

    // Get a specific metric value
    getValue(name: string, labels: Record<string, string> = {}): number | undefined {
        const metricValues = this.values.get(name);
        if (!metricValues) return undefined;

        const labelsKey = this.labelsToKey(labels);
        return metricValues.get(labelsKey);
    }

    // Clear all metrics
    clear(): void {
        this.values.forEach(metric => metric.clear());
    }

    // Convert labels object to a string key
    private labelsToKey(labels: Record<string, string>): string {
        if (Object.keys(labels).length === 0) {
            return '';
        }

        return Object.entries(labels)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([k, v]) => `${k}=${v}`)
            .join(',');
    }
}

/**
 * MetricsManager - central metrics management
 */
export class MetricsManager {
    private reporter: MetricReporter;
    private timers: Map<string, number> = new Map();

    constructor(reporter?: MetricReporter) {
        this.reporter = reporter || new InMemoryMetricReporter();
    }

    /**
     * Register a new metric
     */
    register(definition: MetricDefinition): void {
        this.reporter.register(definition);
    }

    /**
     * Record a metric value
     */
    record(name: string, value: number, labels: Record<string, string> = {}): void {
        this.reporter.record(name, value, labels);
    }

    /**
     * Increment a counter metric
     */
    increment(name: string, incrementBy: number = 1, labels: Record<string, string> = {}): void {
        this.reporter.record(name, incrementBy, labels);
    }

    /**
     * Start a timer for measuring durations
     */
    startTimer(timerId: string): void {
        this.timers.set(timerId, performance.now());
    }

    /**
     * End a timer and record the duration
     */
    endTimer(
        timerId: string,
        metricName: string,
        labels: Record<string, string> = {}
    ): number | undefined {
        const startTime = this.timers.get(timerId);
        if (startTime === undefined) {
            return undefined;
        }

        const duration = performance.now() - startTime;
        this.reporter.recordDuration(metricName, duration, labels);
        this.timers.delete(timerId);

        return duration;
    }

    /**
     * Get the metric reporter
     */
    getReporter(): MetricReporter {
        return this.reporter;
    }
}

// Create default metrics instance
export const defaultMetrics = new MetricsManager();

// Pre-configured common metrics
export function registerCommonMetrics(manager: MetricsManager = defaultMetrics): void {
    // Tool execution metrics
    manager.register({
        name: 'tool_execution_count',
        help: 'Count of tool executions',
        type: MetricType.COUNTER,
        labelNames: ['tool_name', 'status'],
    });

    manager.register({
        name: 'tool_execution_time',
        help: 'Tool execution time in milliseconds',
        type: MetricType.HISTOGRAM,
        labelNames: ['tool_name'],
    });

    // Transport metrics
    manager.register({
        name: 'connection_count',
        help: 'Count of active connections',
        type: MetricType.GAUGE,
        labelNames: ['transport_type'],
    });

    manager.register({
        name: 'message_count',
        help: 'Count of messages sent/received',
        type: MetricType.COUNTER,
        labelNames: ['direction', 'message_type', 'transport_type'],
    });

    manager.register({
        name: 'message_size_bytes',
        help: 'Size of messages in bytes',
        type: MetricType.HISTOGRAM,
        labelNames: ['direction', 'message_type', 'transport_type'],
    });

    // Session metrics
    manager.register({
        name: 'session_count',
        help: 'Count of active sessions',
        type: MetricType.GAUGE,
    });

    manager.register({
        name: 'session_duration',
        help: 'Session duration in milliseconds',
        type: MetricType.HISTOGRAM,
    });

    // Resource metrics
    manager.register({
        name: 'resource_count',
        help: 'Count of resources',
        type: MetricType.GAUGE,
        labelNames: ['resource_type'],
    });

    manager.register({
        name: 'resource_size_bytes',
        help: 'Size of resources in bytes',
        type: MetricType.HISTOGRAM,
        labelNames: ['resource_type'],
    });
} 