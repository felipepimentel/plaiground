import { Resource, ResourceDescriptor } from './resource';

/**
 * Enhanced MIME type definitions for resources
 */
export enum ResourceMimeType {
    // Text formats
    TEXT_PLAIN = 'text/plain',
    TEXT_HTML = 'text/html',
    TEXT_CSS = 'text/css',
    TEXT_JAVASCRIPT = 'text/javascript',
    TEXT_MARKDOWN = 'text/markdown',

    // JSON formats
    JSON = 'application/json',
    JSON_PATCH = 'application/json-patch+json',

    // Binary formats
    OCTET_STREAM = 'application/octet-stream',

    // Media formats
    IMAGE_JPEG = 'image/jpeg',
    IMAGE_PNG = 'image/png',
    IMAGE_GIF = 'image/gif',
    IMAGE_SVG = 'image/svg+xml',
    AUDIO_MP3 = 'audio/mpeg',
    AUDIO_WAV = 'audio/wav',
    VIDEO_MP4 = 'video/mp4',

    // Document formats
    PDF = 'application/pdf',

    // Archive formats
    ZIP = 'application/zip',

    // Special formats
    FORM_DATA = 'multipart/form-data',

    // Structured data
    XML = 'application/xml',
    CSV = 'text/csv',

    // Custom format for Plaiground
    PLAI_DOCUMENT = 'application/x-plai-document'
}

/**
 * Enhanced resource content types
 */
export type ResourceContent =
    | TextContent
    | JsonContent
    | BinaryContent
    | ImageContent
    | AudioContent
    | VideoContent
    | CustomContent;

/**
 * Base interface for all content types
 */
export interface ContentBase {
    type: string;
}

/**
 * Text content type
 */
export interface TextContent extends ContentBase {
    type: 'text';
    format?: 'plain' | 'html' | 'markdown' | 'css' | 'javascript' | 'json' | 'xml' | 'csv';
    text: string;
    encoding?: string;
}

/**
 * JSON content type
 */
export interface JsonContent extends ContentBase {
    type: 'json';
    data: Record<string, any>;
}

/**
 * Binary content type
 */
export interface BinaryContent extends ContentBase {
    type: 'binary';
    data: Uint8Array;
}

/**
 * Image content type
 */
export interface ImageContent extends ContentBase {
    type: 'image';
    format: 'jpeg' | 'png' | 'gif' | 'svg';
    data: Uint8Array;
    width?: number;
    height?: number;
}

/**
 * Audio content type
 */
export interface AudioContent extends ContentBase {
    type: 'audio';
    format: 'mp3' | 'wav' | 'ogg';
    data: Uint8Array;
    duration?: number;
}

/**
 * Video content type
 */
export interface VideoContent extends ContentBase {
    type: 'video';
    format: 'mp4' | 'webm';
    data: Uint8Array;
    width?: number;
    height?: number;
    duration?: number;
}

/**
 * Custom content type for extensibility
 */
export interface CustomContent extends ContentBase {
    type: 'custom';
    format: string;
    data: Uint8Array | string | Record<string, any>;
    [key: string]: any;
}

/**
 * Enhanced resource with strongly typed content
 */
export interface EnhancedResource extends Omit<Resource, 'data'> {
    content: ResourceContent;
}

/**
 * Helper functions for working with enhanced resources
 */
export class ResourceContentHelper {
    /**
     * Convert a standard resource to an enhanced resource
     */
    static toEnhancedResource(resource: Resource): EnhancedResource {
        const content = this.detectContentType(resource.data, resource.mimeType);

        return {
            ...resource,
            content
        };
    }

    /**
     * Convert an enhanced resource to a standard resource
     */
    static toStandardResource(resource: EnhancedResource): Resource {
        const data = this.extractData(resource.content);

        return {
            ...resource,
            data
        };
    }

    /**
     * Detect content type from resource data and MIME type
     */
    private static detectContentType(data: Resource['data'], mimeType?: string): ResourceContent {
        // Handle data based on its type
        if (data instanceof Uint8Array) {
            // Binary data
            if (mimeType) {
                if (mimeType.startsWith('image/')) {
                    const format = mimeType.split('/')[1] as 'jpeg' | 'png' | 'gif' | 'svg';
                    return {
                        type: 'image',
                        format,
                        data
                    };
                } else if (mimeType.startsWith('audio/')) {
                    const format = mimeType.includes('mpeg') ? 'mp3' :
                        mimeType.includes('wav') ? 'wav' : 'ogg';
                    return {
                        type: 'audio',
                        format,
                        data
                    };
                } else if (mimeType.startsWith('video/')) {
                    const format = mimeType.includes('mp4') ? 'mp4' : 'webm';
                    return {
                        type: 'video',
                        format,
                        data
                    };
                }
            }

            // Default to binary
            return {
                type: 'binary',
                data
            };
        } else if (typeof data === 'string') {
            // Text data
            let format: TextContent['format'] = 'plain';

            if (mimeType) {
                if (mimeType === ResourceMimeType.TEXT_HTML) {
                    format = 'html';
                } else if (mimeType === ResourceMimeType.TEXT_MARKDOWN) {
                    format = 'markdown';
                } else if (mimeType === ResourceMimeType.TEXT_CSS) {
                    format = 'css';
                } else if (mimeType === ResourceMimeType.TEXT_JAVASCRIPT) {
                    format = 'javascript';
                } else if (mimeType === ResourceMimeType.JSON) {
                    format = 'json';
                } else if (mimeType === ResourceMimeType.XML) {
                    format = 'xml';
                } else if (mimeType === ResourceMimeType.CSV) {
                    format = 'csv';
                }
            }

            return {
                type: 'text',
                format,
                text: data
            };
        } else if (typeof data === 'object' && data !== null) {
            // JSON data
            return {
                type: 'json',
                data
            };
        }

        // Default to custom content
        return {
            type: 'custom',
            format: mimeType || 'unknown',
            data
        };
    }

    /**
     * Extract data from enhanced content
     */
    private static extractData(content: ResourceContent): Resource['data'] {
        switch (content.type) {
            case 'text':
                return content.text;

            case 'json':
                return content.data;

            case 'binary':
            case 'image':
            case 'audio':
            case 'video':
                return content.data;

            case 'custom':
                return content.data;

            default:
                throw new Error(`Unknown content type: ${(content as any).type}`);
        }
    }

    /**
     * Get the appropriate MIME type for content
     */
    static getMimeType(content: ResourceContent): string {
        switch (content.type) {
            case 'text':
                switch (content.format) {
                    case 'html': return ResourceMimeType.TEXT_HTML;
                    case 'markdown': return ResourceMimeType.TEXT_MARKDOWN;
                    case 'css': return ResourceMimeType.TEXT_CSS;
                    case 'javascript': return ResourceMimeType.TEXT_JAVASCRIPT;
                    case 'json': return ResourceMimeType.JSON;
                    case 'xml': return ResourceMimeType.XML;
                    case 'csv': return ResourceMimeType.CSV;
                    default: return ResourceMimeType.TEXT_PLAIN;
                }

            case 'json':
                return ResourceMimeType.JSON;

            case 'binary':
                return ResourceMimeType.OCTET_STREAM;

            case 'image':
                switch (content.format) {
                    case 'jpeg': return ResourceMimeType.IMAGE_JPEG;
                    case 'png': return ResourceMimeType.IMAGE_PNG;
                    case 'gif': return ResourceMimeType.IMAGE_GIF;
                    case 'svg': return ResourceMimeType.IMAGE_SVG;
                    default: return 'image/' + content.format;
                }

            case 'audio':
                switch (content.format) {
                    case 'mp3': return ResourceMimeType.AUDIO_MP3;
                    case 'wav': return ResourceMimeType.AUDIO_WAV;
                    default: return 'audio/' + content.format;
                }

            case 'video':
                switch (content.format) {
                    case 'mp4': return ResourceMimeType.VIDEO_MP4;
                    default: return 'video/' + content.format;
                }

            case 'custom':
                return content.format;

            default:
                return ResourceMimeType.OCTET_STREAM;
        }
    }

    /**
     * Create a text resource
     */
    static createTextResource(
        descriptor: ResourceDescriptor,
        name: string,
        text: string,
        format: TextContent['format'] = 'plain',
        tags?: string[]
    ): EnhancedResource {
        const content: TextContent = {
            type: 'text',
            format,
            text
        };

        const now = new Date();

        return {
            descriptor,
            name,
            mimeType: this.getMimeType(content),
            content,
            size: Buffer.from(text, 'utf8').length,
            createdAt: now,
            updatedAt: now,
            tags
        };
    }

    /**
     * Create a JSON resource
     */
    static createJsonResource(
        descriptor: ResourceDescriptor,
        name: string,
        data: Record<string, any>,
        tags?: string[]
    ): EnhancedResource {
        const content: JsonContent = {
            type: 'json',
            data
        };

        const serialized = JSON.stringify(data);
        const now = new Date();

        return {
            descriptor,
            name,
            mimeType: ResourceMimeType.JSON,
            content,
            size: Buffer.from(serialized, 'utf8').length,
            createdAt: now,
            updatedAt: now,
            tags
        };
    }

    /**
     * Create a binary resource
     */
    static createBinaryResource(
        descriptor: ResourceDescriptor,
        name: string,
        data: Uint8Array,
        mimeType: string = ResourceMimeType.OCTET_STREAM,
        tags?: string[]
    ): EnhancedResource {
        const content: BinaryContent = {
            type: 'binary',
            data
        };

        const now = new Date();

        return {
            descriptor,
            name,
            mimeType,
            content,
            size: data.length,
            createdAt: now,
            updatedAt: now,
            tags
        };
    }
} 