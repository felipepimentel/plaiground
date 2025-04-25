/**
 * Plaiground Common Package
 * 
 * This package contains shared types, utilities, and constants used across
 * all Plaiground packages. It serves as the foundation for type consistency
 * and shared functionality.
 */

// Export MCP types
export * from './mcp/types';

// Export utility functions
export * from './utils/errors';

// Resource types
export * from './types/enhanced-resource';
export * from './types/resource';

// Version information
export const VERSION = '0.1.0'; 