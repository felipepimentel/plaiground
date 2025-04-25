import {
    BinaryContent,
    ImageContent,
    JsonContent,
    ResourceContentHelper,
    ResourceMimeType,
    TextContent
} from '../enhanced-resource';
import { ResourceDescriptor } from '../resource';

describe('ResourceContentHelper', () => {
    describe('content type detection', () => {
        test('should detect text content', () => {
            const resource = {
                descriptor: { id: 'test', type: 'text' },
                name: 'Test Resource',
                data: 'Hello, world!',
                mimeType: ResourceMimeType.TEXT_PLAIN,
                createdAt: new Date(),
                updatedAt: new Date()
            };

            const enhanced = ResourceContentHelper.toEnhancedResource(resource);

            expect(enhanced.content.type).toBe('text');
            const content = enhanced.content as TextContent;
            expect(content.text).toBe('Hello, world!');
            expect(content.format).toBe('plain');
        });

        test('should detect JSON content', () => {
            const jsonData = { name: 'Test', value: 42 };
            const resource = {
                descriptor: { id: 'test', type: 'json' },
                name: 'Test JSON',
                data: jsonData,
                mimeType: ResourceMimeType.JSON,
                createdAt: new Date(),
                updatedAt: new Date()
            };

            const enhanced = ResourceContentHelper.toEnhancedResource(resource);

            expect(enhanced.content.type).toBe('json');
            const content = enhanced.content as JsonContent;
            expect(content.data).toEqual(jsonData);
        });

        test('should detect binary content', () => {
            const binaryData = new Uint8Array([1, 2, 3, 4, 5]);
            const resource = {
                descriptor: { id: 'test', type: 'binary' },
                name: 'Test Binary',
                data: binaryData,
                mimeType: ResourceMimeType.OCTET_STREAM,
                createdAt: new Date(),
                updatedAt: new Date()
            };

            const enhanced = ResourceContentHelper.toEnhancedResource(resource);

            expect(enhanced.content.type).toBe('binary');
            const content = enhanced.content as BinaryContent;
            expect(content.data).toBe(binaryData);
        });

        test('should detect image content', () => {
            const imageData = new Uint8Array([1, 2, 3, 4, 5]);
            const resource = {
                descriptor: { id: 'test', type: 'image' },
                name: 'Test Image',
                data: imageData,
                mimeType: ResourceMimeType.IMAGE_PNG,
                createdAt: new Date(),
                updatedAt: new Date()
            };

            const enhanced = ResourceContentHelper.toEnhancedResource(resource);

            expect(enhanced.content.type).toBe('image');
            const content = enhanced.content as ImageContent;
            expect(content.data).toBe(imageData);
            expect(content.format).toBe('png');
        });
    });

    describe('resource creation helpers', () => {
        const testDescriptor: ResourceDescriptor = {
            id: 'test-helper',
            type: 'test'
        };

        test('should create text resource', () => {
            const resource = ResourceContentHelper.createTextResource(
                testDescriptor,
                'Test Text',
                'Hello, world!',
                'plain'
            );

            expect(resource.descriptor).toEqual(testDescriptor);
            expect(resource.name).toBe('Test Text');
            expect(resource.mimeType).toBe(ResourceMimeType.TEXT_PLAIN);
            expect(resource.content.type).toBe('text');

            const content = resource.content as TextContent;
            expect(content.text).toBe('Hello, world!');
            expect(content.format).toBe('plain');
        });

        test('should create HTML text resource', () => {
            const htmlContent = '<p>Hello, <strong>world</strong>!</p>';
            const resource = ResourceContentHelper.createTextResource(
                testDescriptor,
                'Test HTML',
                htmlContent,
                'html'
            );

            expect(resource.mimeType).toBe(ResourceMimeType.TEXT_HTML);
            expect(resource.content.type).toBe('text');

            const content = resource.content as TextContent;
            expect(content.text).toBe(htmlContent);
            expect(content.format).toBe('html');
        });

        test('should create JSON resource', () => {
            const jsonData = { name: 'Test', nested: { value: 42 }, array: [1, 2, 3] };
            const resource = ResourceContentHelper.createJsonResource(
                testDescriptor,
                'Test JSON',
                jsonData
            );

            expect(resource.mimeType).toBe(ResourceMimeType.JSON);
            expect(resource.content.type).toBe('json');

            const content = resource.content as JsonContent;
            expect(content.data).toEqual(jsonData);
        });

        test('should create binary resource', () => {
            const binaryData = new Uint8Array([1, 2, 3, 4, 5]);
            const resource = ResourceContentHelper.createBinaryResource(
                testDescriptor,
                'Test Binary',
                binaryData
            );

            expect(resource.mimeType).toBe(ResourceMimeType.OCTET_STREAM);
            expect(resource.content.type).toBe('binary');
            expect(resource.size).toBe(5);

            const content = resource.content as BinaryContent;
            expect(content.data).toBe(binaryData);
        });
    });

    describe('conversion between standard and enhanced', () => {
        test('should convert from standard to enhanced and back', () => {
            const originalData = { key: 'value', nested: { items: [1, 2, 3] } };
            const standardResource = {
                descriptor: { id: 'conversion-test', type: 'json' },
                name: 'Conversion Test',
                data: originalData,
                mimeType: ResourceMimeType.JSON,
                createdAt: new Date(),
                updatedAt: new Date(),
                tags: ['test', 'conversion']
            };

            // Convert to enhanced
            const enhanced = ResourceContentHelper.toEnhancedResource(standardResource);
            expect(enhanced.content.type).toBe('json');
            expect('data' in enhanced).toBe(false);

            // Convert back to standard
            const convertedBack = ResourceContentHelper.toStandardResource(enhanced);
            expect(convertedBack).toEqual(standardResource);
        });
    });
}); 