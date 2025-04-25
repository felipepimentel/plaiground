/**
 * API Documentation Generator
 * 
 * Provides tools to generate OpenAPI documentation for MCP API endpoints
 * and serves an interactive Swagger UI to explore them.
 */

import { Tool, ToolParameter } from '@plaiground/common';
import { SandboxedToolRegistry } from '@plaiground/mcp-host';
import * as express from 'express';
import { Router } from 'express';
import * as fs from 'fs';
import * as fsPromises from 'fs/promises';
import { OpenAPIV3 } from 'openapi-types';
import * as path from 'path';
import * as swaggerUi from 'swagger-ui-express';

/**
 * OpenAPI specification types
 */
interface OpenAPISpec {
    openapi: string;
    info: {
        title: string;
        description: string;
        version: string;
        contact?: {
            name?: string;
            url?: string;
            email?: string;
        };
    };
    servers: {
        url: string;
        description: string;
    }[];
    paths: Record<string, any>;
    components: {
        schemas: Record<string, any>;
        securitySchemes?: Record<string, any>;
    };
    tags: {
        name: string;
        description: string;
    }[];
}

/**
 * Configuration for API docs generator
 */
export interface APIDocsConfig {
    title: string;
    description: string;
    version: string;
    baseUrl: string;
    outputPath: string;
    includeExamples?: boolean;
    includeMethods?: string[];
    excludeMethods?: string[];
    contact?: {
        name?: string;
        url?: string;
        email?: string;
    };
}

/**
 * API Endpoint metadata
 */
export interface ApiEndpoint {
    path: string;
    method: 'get' | 'post' | 'put' | 'delete' | 'patch';
    summary: string;
    description?: string;
    operationId?: string;
    tags?: string[];
    parameters?: ApiParameter[];
    requestBody?: {
        required?: boolean;
        content: {
            [mediaType: string]: {
                schema: any;
                examples?: {
                    [name: string]: {
                        value: any;
                        summary?: string;
                    };
                };
            };
        };
    };
    responses: {
        [statusCode: string]: {
            description: string;
            content?: {
                [mediaType: string]: {
                    schema: any;
                    examples?: {
                        [name: string]: {
                            value: any;
                            summary?: string;
                        };
                    };
                };
            };
        };
    };
    security?: Array<{
        [name: string]: string[];
    }>;
}

/**
 * API Parameter metadata
 */
export interface ApiParameter {
    name: string;
    in: 'query' | 'header' | 'path' | 'cookie';
    description?: string;
    required?: boolean;
    schema: any;
    example?: any;
}

/**
 * API Documentation Generator options
 */
export interface ApiDocsOptions {
    title: string;
    description?: string;
    version: string;
    baseUrl?: string;
    outputPath?: string;
    securitySchemes?: {
        [name: string]: OpenAPIV3.SecuritySchemeObject;
    };
    tags?: Array<{
        name: string;
        description?: string;
    }>;
    servers?: Array<{
        url: string;
        description?: string;
    }>;
    termsOfService?: string;
    contact?: {
        name?: string;
        url?: string;
        email?: string;
    };
    license?: {
        name: string;
        url?: string;
    };
}

/**
 * Generate OpenAPI documentation from MCP tools
 */
export class APIDocsGenerator {
    private config: APIDocsConfig;
    private toolRegistry: SandboxedToolRegistry;
    private spec: OpenAPISpec;

    constructor(toolRegistry: SandboxedToolRegistry, config: APIDocsConfig) {
        this.toolRegistry = toolRegistry;
        this.config = {
            includeExamples: true,
            ...config,
        };

        // Initialize OpenAPI spec
        this.spec = {
            openapi: '3.0.0',
            info: {
                title: this.config.title,
                description: this.config.description,
                version: this.config.version,
                contact: this.config.contact,
            },
            servers: [
                {
                    url: this.config.baseUrl,
                    description: 'MCP API Server',
                },
            ],
            paths: {},
            components: {
                schemas: {},
                securitySchemes: {
                    bearerAuth: {
                        type: 'http',
                        scheme: 'bearer',
                        bearerFormat: 'JWT',
                    },
                },
            },
            tags: [],
        };
    }

    /**
     * Generate the complete OpenAPI documentation
     */
    async generate(): Promise<OpenAPISpec> {
        const tools = this.toolRegistry.listTools();

        // Group tools by namespace for tags
        const namespaces = new Map<string, string[]>();

        for (const tool of tools) {
            // Skip if in exclude list or not in include list
            if (this.shouldSkipTool(tool.name)) {
                continue;
            }

            const namespace = this.getNamespaceFromToolName(tool.name);
            if (!namespaces.has(namespace)) {
                namespaces.set(namespace, []);
            }
            namespaces.get(namespace)!.push(tool.name);
        }

        // Create tags from namespaces
        Array.from(namespaces.entries()).forEach(([namespace, _]) => {
            this.spec.tags.push({
                name: namespace,
                description: `Tools in the ${namespace} namespace`,
            });
        });

        // Generate paths and schemas
        for (const tool of tools) {
            if (this.shouldSkipTool(tool.name)) {
                continue;
            }

            this.addToolToSpec(tool);
        }

        return this.spec;
    }

    /**
     * Save the generated OpenAPI spec to a file
     */
    async saveToFile(filePath?: string): Promise<string> {
        const outputPath = filePath || this.config.outputPath;
        const spec = await this.generate();

        const outputDir = path.dirname(outputPath);
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }

        fs.writeFileSync(outputPath, JSON.stringify(spec, null, 2));
        console.log(`OpenAPI spec saved to ${outputPath}`);

        return outputPath;
    }

    /**
     * Generate HTML documentation
     */
    async generateHTML(outputPath?: string): Promise<string> {
        const spec = await this.generate();
        const htmlPath = outputPath || path.join(path.dirname(this.config.outputPath), 'api-docs.html');

        // Create a simple HTML wrapper with ReDoc or Swagger UI
        const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${spec.info.title} - API Documentation</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link href="https://fonts.googleapis.com/css?family=Montserrat:300,400,700|Roboto:300,400,700" rel="stylesheet">
  <style>
    body { margin: 0; padding: 0; }
    #redoc-container { max-width: 1200px; margin: 0 auto; }
  </style>
</head>
<body>
  <div id="redoc-container"></div>
  <script src="https://cdn.jsdelivr.net/npm/redoc@next/bundles/redoc.standalone.js"></script>
  <script>
    Redoc.init(
      ${JSON.stringify(spec)},
      {
        scrollYOffset: 50,
        hideDownloadButton: false,
        expandResponses: "all",
        pathInMiddlePanel: true,
        theme: { 
          colors: { primary: { main: '#2C3E50' } },
          typography: { fontSize: '16px', fontFamily: 'Roboto, sans-serif' }
        }
      },
      document.getElementById('redoc-container')
    );
  </script>
</body>
</html>
    `;

        const outputDir = path.dirname(htmlPath);
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }

        fs.writeFileSync(htmlPath, html);
        console.log(`HTML documentation saved to ${htmlPath}`);

        return htmlPath;
    }

    /**
     * Check if a tool should be included
     */
    private shouldSkipTool(toolName: string): boolean {
        if (this.config.excludeMethods && this.config.excludeMethods.includes(toolName)) {
            return true;
        }

        if (this.config.includeMethods && !this.config.includeMethods.includes(toolName)) {
            return true;
        }

        return false;
    }

    /**
     * Extract namespace from tool name
     */
    private getNamespaceFromToolName(toolName: string): string {
        const parts = toolName.split('.');
        return parts.length > 1 ? parts[0] : 'default';
    }

    /**
     * Add a tool to the OpenAPI spec
     */
    private addToolToSpec(tool: Tool): void {
        const namespace = this.getNamespaceFromToolName(tool.name);
        const operationId = tool.name.replace(/\./g, '_');

        // Create path entry
        const path = `/api/mcp/tools/${tool.name}`;

        // Parameter schema
        const requestSchema = this.convertParametersToSchema(tool.parameters);
        const schemaName = `${operationId}Request`;
        this.spec.components.schemas[schemaName] = requestSchema;

        // Add to paths
        this.spec.paths[path] = {
            post: {
                tags: [namespace],
                summary: tool.description,
                operationId,
                requestBody: {
                    description: `Parameters for ${tool.name}`,
                    required: true,
                    content: {
                        'application/json': {
                            schema: {
                                $ref: `#/components/schemas/${schemaName}`,
                            },
                        },
                    },
                },
                responses: {
                    '200': {
                        description: 'Successful operation',
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    additionalProperties: true,
                                },
                            },
                        },
                    },
                    '400': {
                        description: 'Bad request',
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    properties: {
                                        error: {
                                            type: 'string',
                                        },
                                        code: {
                                            type: 'integer',
                                        },
                                    },
                                },
                            },
                        },
                    },
                    '500': {
                        description: 'Internal server error',
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    properties: {
                                        error: {
                                            type: 'string',
                                        },
                                        code: {
                                            type: 'integer',
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
                security: [
                    {
                        bearerAuth: [],
                    },
                ],
            },
        };

        // Add examples if enabled
        if (this.config.includeExamples) {
            this.addExamples(tool, path);
        }
    }

    /**
     * Convert JSON Schema parameters to OpenAPI schema
     */
    private convertParametersToSchema(parameters: ToolParameter): any {
        // If parameters is already in the right format, return it
        if (parameters.type === 'object') {
            // Recursive processing of nested schemas
            const properties = parameters.properties || {};
            const processedProperties: Record<string, any> = {};

            for (const [key, prop] of Object.entries(properties)) {
                if (typeof prop === 'object' && 'type' in prop) {
                    if (prop.type === 'object' && prop.properties) {
                        processedProperties[key] = this.convertParametersToSchema(prop as any);
                    } else {
                        processedProperties[key] = prop;
                    }
                } else {
                    processedProperties[key] = prop;
                }
            }

            return {
                type: 'object',
                properties: processedProperties,
                required: parameters.required || [],
            };
        }

        // Default empty schema
        return {
            type: 'object',
            properties: {},
        };
    }

    /**
     * Add example requests and responses to a path
     */
    private addExamples(tool: Tool, path: string): void {
        // Simple example based on required parameters
        const example: Record<string, any> = {};

        if (tool.parameters.type === 'object' && tool.parameters.properties) {
            const requiredFields = tool.parameters.required || [];

            for (const field of requiredFields) {
                const propSchema = tool.parameters.properties[field];
                if (propSchema) {
                    // Generate a sample value based on the type
                    example[field] = this.generateSampleValue(propSchema);
                }
            }
        }

        // Add the example to the path
        if (Object.keys(example).length > 0) {
            this.spec.paths[path].post.requestBody.content['application/json'].examples = {
                default: {
                    summary: 'Example request',
                    value: example,
                },
            };
        }
    }

    /**
     * Generate a sample value based on JSON Schema type
     */
    private generateSampleValue(schema: any): any {
        if (!schema.type) return null;

        switch (schema.type) {
            case 'string':
                if (schema.enum) return schema.enum[0];
                if (schema.format === 'date-time') return new Date().toISOString();
                if (schema.format === 'date') return new Date().toISOString().split('T')[0];
                if (schema.format === 'email') return 'user@example.com';
                if (schema.format === 'uri') return 'https://example.com';
                return schema.example || 'string';

            case 'number':
            case 'integer':
                if (schema.enum) return schema.enum[0];
                return schema.example || 0;

            case 'boolean':
                return schema.example !== undefined ? schema.example : true;

            case 'array':
                if (schema.items) {
                    return [this.generateSampleValue(schema.items)];
                }
                return [];

            case 'object':
                if (schema.properties) {
                    const result: Record<string, any> = {};
                    for (const [key, prop] of Object.entries(schema.properties)) {
                        result[key] = this.generateSampleValue(prop);
                    }
                    return result;
                }
                return {};

            default:
                return null;
        }
    }
}

/**
 * Interactive API Documentation Generator
 */
export class ApiDocsGenerator {
    private endpoints: ApiEndpoint[] = [];
    private options: ApiDocsOptions;
    private spec: OpenAPIV3.Document;

    constructor(options: ApiDocsOptions) {
        this.options = options;
        this.spec = this.createBaseSpec();
    }

    /**
     * Create the base OpenAPI specification
     */
    private createBaseSpec(): OpenAPIV3.Document {
        return {
            openapi: '3.0.3',
            info: {
                title: this.options.title,
                description: this.options.description || '',
                version: this.options.version,
                termsOfService: this.options.termsOfService,
                contact: this.options.contact,
                license: this.options.license,
            },
            servers: this.options.servers || [
                {
                    url: this.options.baseUrl || '/',
                    description: 'Default server',
                },
            ],
            paths: {},
            components: {
                schemas: {},
                securitySchemes: this.options.securitySchemes || {},
            },
            tags: this.options.tags || [],
        };
    }

    /**
     * Add an API endpoint to the documentation
     */
    addEndpoint(endpoint: ApiEndpoint): void {
        this.endpoints.push(endpoint);
        this.updateSpec(endpoint);
    }

    /**
     * Add multiple API endpoints to the documentation
     */
    addEndpoints(endpoints: ApiEndpoint[]): void {
        for (const endpoint of endpoints) {
            this.addEndpoint(endpoint);
        }
    }

    /**
     * Update the OpenAPI specification with the endpoint
     */
    private updateSpec(endpoint: ApiEndpoint): void {
        const { path, method, ...rest } = endpoint;

        // Create the path if it doesn't exist
        if (!this.spec.paths[path]) {
            this.spec.paths[path] = {};
        }

        // Add the method to the path
        this.spec.paths[path][method.toLowerCase() as OpenAPIV3.HttpMethods] = rest as any;
    }

    /**
     * Generate the OpenAPI specification
     */
    generateSpec(): OpenAPIV3.Document {
        return this.spec;
    }

    /**
     * Save the OpenAPI specification to a file
     */
    async saveSpec(outputPath?: string): Promise<void> {
        const filePath = outputPath || this.options.outputPath || path.resolve(process.cwd(), 'openapi.json');
        const spec = this.generateSpec();

        // Create the directory if it doesn't exist
        await fsPromises.mkdir(path.dirname(filePath), { recursive: true });

        // Write the spec to a file
        await fsPromises.writeFile(filePath, JSON.stringify(spec, null, 2), 'utf-8');
    }

    /**
     * Create an Express router for the API documentation
     */
    createDocsRouter(): Router {
        const router = express.Router();
        const spec = this.generateSpec();

        // Serve the OpenAPI specification as JSON
        router.get('/openapi.json', (req, res) => {
            res.json(spec);
        });

        // Serve the Swagger UI
        router.use('/', swaggerUi.serve, swaggerUi.setup(spec, {
            explorer: true,
            customCss: '.swagger-ui .topbar { display: none }',
        }));

        return router;
    }

    /**
     * Create a markdown documentation file
     */
    async generateMarkdown(outputPath?: string): Promise<string> {
        const spec = this.generateSpec();
        let markdown = `# ${spec.info.title}\n\n`;

        // Add description
        if (spec.info.description) {
            markdown += `${spec.info.description}\n\n`;
        }

        // Add version
        markdown += `**Version:** ${spec.info.version}\n\n`;

        // Add servers
        if (spec.servers && spec.servers.length > 0) {
            markdown += `## Servers\n\n`;
            for (const server of spec.servers) {
                markdown += `- ${server.url}${server.description ? ` - ${server.description}` : ''}\n`;
            }
            markdown += '\n';
        }

        // Add tags
        if (spec.tags && spec.tags.length > 0) {
            markdown += `## Tags\n\n`;
            for (const tag of spec.tags) {
                markdown += `- **${tag.name}**${tag.description ? ` - ${tag.description}` : ''}\n`;
            }
            markdown += '\n';
        }

        // Add paths
        markdown += `## Endpoints\n\n`;

        for (const [path, methods] of Object.entries(spec.paths)) {
            for (const [method, operation] of Object.entries(methods as any)) {
                const op = operation as OpenAPIV3.OperationObject;

                // Add endpoint header
                markdown += `### ${method.toUpperCase()} ${path}\n\n`;

                // Add summary and description
                if (op.summary) {
                    markdown += `**Summary:** ${op.summary}\n\n`;
                }

                if (op.description) {
                    markdown += `${op.description}\n\n`;
                }

                // Add tags
                if (op.tags && op.tags.length > 0) {
                    markdown += `**Tags:** ${op.tags.join(', ')}\n\n`;
                }

                // Add parameters
                if (op.parameters && op.parameters.length > 0) {
                    markdown += `#### Parameters\n\n`;
                    markdown += `| Name | Located in | Description | Required | Schema |\n`;
                    markdown += `| ---- | ---------- | ----------- | -------- | ------ |\n`;

                    for (const param of op.parameters) {
                        const parameter = param as OpenAPIV3.ParameterObject;
                        markdown += `| ${parameter.name} | ${parameter.in} | ${parameter.description || ''} | ${parameter.required ? 'Yes' : 'No'} | ${JSON.stringify(parameter.schema)} |\n`;
                    }

                    markdown += '\n';
                }

                // Add request body
                if (op.requestBody) {
                    const requestBody = op.requestBody as OpenAPIV3.RequestBodyObject;
                    markdown += `#### Request Body\n\n`;
                    markdown += `**Required:** ${requestBody.required ? 'Yes' : 'No'}\n\n`;

                    for (const [mediaType, content] of Object.entries(requestBody.content || {})) {
                        markdown += `**Content Type:** ${mediaType}\n\n`;
                        markdown += `**Schema:**\n\`\`\`json\n${JSON.stringify(content.schema, null, 2)}\n\`\`\`\n\n`;

                        if (content.examples) {
                            markdown += `**Examples:**\n\n`;
                            for (const [name, example] of Object.entries(content.examples)) {
                                markdown += `*${name}*\n\`\`\`json\n${JSON.stringify(example.value, null, 2)}\n\`\`\`\n\n`;
                            }
                        }
                    }
                }

                // Add responses
                markdown += `#### Responses\n\n`;
                for (const [statusCode, response] of Object.entries(op.responses || {})) {
                    const resp = response as OpenAPIV3.ResponseObject;
                    markdown += `**${statusCode}** - ${resp.description}\n\n`;

                    if (resp.content) {
                        for (const [mediaType, content] of Object.entries(resp.content)) {
                            markdown += `**Content Type:** ${mediaType}\n\n`;
                            markdown += `**Schema:**\n\`\`\`json\n${JSON.stringify(content.schema, null, 2)}\n\`\`\`\n\n`;

                            if (content.examples) {
                                markdown += `**Examples:**\n\n`;
                                for (const [name, example] of Object.entries(content.examples)) {
                                    markdown += `*${name}*\n\`\`\`json\n${JSON.stringify(example.value, null, 2)}\n\`\`\`\n\n`;
                                }
                            }
                        }
                    }
                }

                // Add security
                if (op.security && op.security.length > 0) {
                    markdown += `#### Security\n\n`;
                    for (const security of op.security) {
                        for (const [name, scopes] of Object.entries(security)) {
                            markdown += `- **${name}**${scopes.length > 0 ? ` Scopes: ${scopes.join(', ')}` : ''}\n`;
                        }
                    }
                    markdown += '\n';
                }
            }
        }

        // Write to file if outputPath is provided
        if (outputPath) {
            // Create the directory if it doesn't exist
            await fsPromises.mkdir(path.dirname(outputPath), { recursive: true });

            // Write the markdown to a file
            await fsPromises.writeFile(outputPath, markdown, 'utf-8');
        }

        return markdown;
    }
}

/**
 * Create an API documentation generator with sample endpoints
 */
export function createSampleApiDocs(): ApiDocsGenerator {
    const apiDocs = new ApiDocsGenerator({
        title: 'Plaiground MCP API',
        description: 'API for the Plaiground Message Control Protocol',
        version: '1.0.0',
        baseUrl: '/api',
        tags: [
            { name: 'sessions', description: 'Session management endpoints' },
            { name: 'tools', description: 'Tool management endpoints' },
            { name: 'resources', description: 'Resource management endpoints' }
        ],
        securitySchemes: {
            apiKey: {
                type: 'apiKey',
                in: 'header',
                name: 'X-API-Key'
            }
        }
    });

    // Add sample endpoints
    apiDocs.addEndpoints([
        {
            path: '/sessions',
            method: 'get',
            summary: 'List all sessions',
            description: 'Returns a list of all active sessions',
            tags: ['sessions'],
            responses: {
                '200': {
                    description: 'Successful operation',
                    content: {
                        'application/json': {
                            schema: {
                                type: 'array',
                                items: {
                                    type: 'object',
                                    properties: {
                                        id: { type: 'string' },
                                        createdAt: { type: 'string', format: 'date-time' },
                                        status: { type: 'string', enum: ['active', 'inactive'] }
                                    }
                                }
                            },
                            examples: {
                                'default': {
                                    value: [
                                        { id: 'session-1', createdAt: '2023-01-01T00:00:00Z', status: 'active' },
                                        { id: 'session-2', createdAt: '2023-01-02T00:00:00Z', status: 'inactive' }
                                    ]
                                }
                            }
                        }
                    }
                },
                '401': {
                    description: 'Unauthorized'
                }
            },
            security: [{ apiKey: [] }]
        },
        {
            path: '/sessions',
            method: 'post',
            summary: 'Create a new session',
            description: 'Creates a new MCP session',
            tags: ['sessions'],
            requestBody: {
                required: true,
                content: {
                    'application/json': {
                        schema: {
                            type: 'object',
                            properties: {
                                clientId: { type: 'string' },
                                options: {
                                    type: 'object',
                                    properties: {
                                        timeout: { type: 'integer' }
                                    }
                                }
                            },
                            required: ['clientId']
                        },
                        examples: {
                            'default': {
                                value: {
                                    clientId: 'client-123',
                                    options: {
                                        timeout: 30000
                                    }
                                }
                            }
                        }
                    }
                }
            },
            responses: {
                '201': {
                    description: 'Session created successfully',
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                properties: {
                                    id: { type: 'string' },
                                    createdAt: { type: 'string', format: 'date-time' },
                                    status: { type: 'string', enum: ['active'] }
                                }
                            },
                            examples: {
                                'default': {
                                    value: {
                                        id: 'session-3',
                                        createdAt: '2023-01-03T00:00:00Z',
                                        status: 'active'
                                    }
                                }
                            }
                        }
                    }
                },
                '400': {
                    description: 'Invalid request'
                },
                '401': {
                    description: 'Unauthorized'
                }
            },
            security: [{ apiKey: [] }]
        },
        {
            path: '/sessions/{sessionId}',
            method: 'get',
            summary: 'Get session by ID',
            description: 'Returns details of a specific session',
            tags: ['sessions'],
            parameters: [
                {
                    name: 'sessionId',
                    in: 'path',
                    description: 'ID of the session to retrieve',
                    required: true,
                    schema: {
                        type: 'string'
                    }
                }
            ],
            responses: {
                '200': {
                    description: 'Successful operation',
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                properties: {
                                    id: { type: 'string' },
                                    createdAt: { type: 'string', format: 'date-time' },
                                    status: { type: 'string', enum: ['active', 'inactive'] },
                                    clients: {
                                        type: 'array',
                                        items: {
                                            type: 'object',
                                            properties: {
                                                id: { type: 'string' },
                                                connected: { type: 'boolean' }
                                            }
                                        }
                                    }
                                }
                            },
                            examples: {
                                'default': {
                                    value: {
                                        id: 'session-1',
                                        createdAt: '2023-01-01T00:00:00Z',
                                        status: 'active',
                                        clients: [
                                            { id: 'client-123', connected: true }
                                        ]
                                    }
                                }
                            }
                        }
                    }
                },
                '404': {
                    description: 'Session not found'
                },
                '401': {
                    description: 'Unauthorized'
                }
            },
            security: [{ apiKey: [] }]
        },
        // Tool endpoints
        {
            path: '/tools',
            method: 'get',
            summary: 'List all available tools',
            description: 'Returns a list of all available tools',
            tags: ['tools'],
            responses: {
                '200': {
                    description: 'Successful operation',
                    content: {
                        'application/json': {
                            schema: {
                                type: 'array',
                                items: {
                                    type: 'object',
                                    properties: {
                                        name: { type: 'string' },
                                        description: { type: 'string' },
                                        parameters: {
                                            type: 'object',
                                            additionalProperties: true
                                        }
                                    }
                                }
                            },
                            examples: {
                                'default': {
                                    value: [
                                        {
                                            name: 'weather',
                                            description: 'Get weather information',
                                            parameters: {
                                                type: 'object',
                                                properties: {
                                                    location: {
                                                        type: 'string',
                                                        description: 'City or location name'
                                                    }
                                                },
                                                required: ['location']
                                            }
                                        }
                                    ]
                                }
                            }
                        }
                    }
                },
                '401': {
                    description: 'Unauthorized'
                }
            },
            security: [{ apiKey: [] }]
        }
    ]);

    return apiDocs;
}

/**
 * Mount the API documentation on an Express app
 */
export function mountApiDocs(app: express.Application, path: string = '/api-docs'): void {
    const apiDocs = createSampleApiDocs();
    app.use(path, apiDocs.createDocsRouter());

    // Log that the API docs are available
    console.log(`API Documentation available at ${path}`);
}

/**
 * Generate standalone API documentation
 */
export async function generateDocs(config: APIDocsConfig, toolRegistry: SandboxedToolRegistry): Promise<void> {
    const generator = new APIDocsGenerator(toolRegistry, config);

    // Generate and save the OpenAPI spec
    await generator.saveToFile();

    // Generate HTML documentation
    await generator.generateHTML();

    console.log('API documentation generated successfully');
} 