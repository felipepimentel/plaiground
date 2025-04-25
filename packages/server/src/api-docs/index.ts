/**
 * API Documentation Module Entry Point
 * 
 * This module provides tools to generate OpenAPI documentation for MCP API endpoints
 * and serves an interactive Swagger UI to explore them.
 */

import * as express from 'express';
import { SandboxedToolRegistry } from '@plaiground/mcp-host';
import { APIDocsConfig, mountApiDocs, generateDocs, ApiDocsGenerator, APIDocsGenerator } from './api-docs-generator';

/**
 * Initialize API documentation middleware for Express application
 * @param app Express application
 * @param basePath Base path for API documentation (default: '/api-docs')
 */
export function initializeApiDocs(app: express.Application, basePath: string = '/api-docs'): void {
  mountApiDocs(app, basePath);
}

/**
 * Generate API documentation from tool registry
 * @param config API documentation configuration
 * @param toolRegistry Tool registry
 */
export async function generateApiDocs(config: APIDocsConfig, toolRegistry: SandboxedToolRegistry): Promise<void> {
  await generateDocs(config, toolRegistry);
}

// Export everything from api-docs-generator
export * from './api-docs-generator';
