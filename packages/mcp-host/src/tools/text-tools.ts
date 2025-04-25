import { Tool } from '@plaiground/common';
import { ToolExecutionFn } from './tool-registry';

/**
 * Text case conversion options
 */
export enum TextCase {
    UPPER = 'upper',
    LOWER = 'lower',
    TITLE = 'title',
    SENTENCE = 'sentence',
    CAMEL = 'camel',
    PASCAL = 'pascal',
    SNAKE = 'snake',
    KEBAB = 'kebab',
}

/**
 * Text tool definitions
 */
export const TEXT_TOOLS: Record<string, Tool> = {
    // Text counting tools
    'text.countChars': {
        name: 'text.countChars',
        description: 'Count the number of characters in a text',
        parameters: {
            type: 'object',
            properties: {
                text: {
                    type: 'string',
                    description: 'The text to count characters in',
                },
                countSpaces: {
                    type: 'boolean',
                    description: 'Whether to count spaces',
                    default: true,
                },
            },
            required: ['text'],
        },
    },
    'text.countWords': {
        name: 'text.countWords',
        description: 'Count the number of words in a text',
        parameters: {
            type: 'object',
            properties: {
                text: {
                    type: 'string',
                    description: 'The text to count words in',
                },
            },
            required: ['text'],
        },
    },
    'text.countLines': {
        name: 'text.countLines',
        description: 'Count the number of lines in a text',
        parameters: {
            type: 'object',
            properties: {
                text: {
                    type: 'string',
                    description: 'The text to count lines in',
                },
            },
            required: ['text'],
        },
    },

    // Text transformation tools
    'text.changeCase': {
        name: 'text.changeCase',
        description: 'Change the case of text',
        parameters: {
            type: 'object',
            properties: {
                text: {
                    type: 'string',
                    description: 'The text to change case of',
                },
                case: {
                    type: 'string',
                    description: 'The case to convert to',
                    enum: Object.values(TextCase),
                },
            },
            required: ['text', 'case'],
        },
    },
    'text.truncate': {
        name: 'text.truncate',
        description: 'Truncate text to a specified length',
        parameters: {
            type: 'object',
            properties: {
                text: {
                    type: 'string',
                    description: 'The text to truncate',
                },
                maxLength: {
                    type: 'number',
                    description: 'Maximum length of the text',
                },
                suffix: {
                    type: 'string',
                    description: 'Suffix to add when truncated',
                    default: '...',
                },
            },
            required: ['text', 'maxLength'],
        },
    },
    'text.extract': {
        name: 'text.extract',
        description: 'Extract a portion of text based on start and end positions',
        parameters: {
            type: 'object',
            properties: {
                text: {
                    type: 'string',
                    description: 'The text to extract from',
                },
                start: {
                    type: 'number',
                    description: 'Start position (0-based)',
                },
                end: {
                    type: 'number',
                    description: 'End position (exclusive)',
                },
            },
            required: ['text', 'start', 'end'],
        },
    },

    // Pattern matching tools
    'text.match': {
        name: 'text.match',
        description: 'Find matches of a regular expression in text',
        parameters: {
            type: 'object',
            properties: {
                text: {
                    type: 'string',
                    description: 'The text to search in',
                },
                pattern: {
                    type: 'string',
                    description: 'Regular expression pattern',
                },
                global: {
                    type: 'boolean',
                    description: 'Whether to find all matches',
                    default: true,
                },
                caseInsensitive: {
                    type: 'boolean',
                    description: 'Whether to ignore case',
                    default: false,
                },
            },
            required: ['text', 'pattern'],
        },
    },
    'text.replace': {
        name: 'text.replace',
        description: 'Replace text based on a pattern',
        parameters: {
            type: 'object',
            properties: {
                text: {
                    type: 'string',
                    description: 'The text to perform replacements in',
                },
                pattern: {
                    type: 'string',
                    description: 'Regular expression or string pattern to match',
                },
                replacement: {
                    type: 'string',
                    description: 'Replacement string',
                },
                global: {
                    type: 'boolean',
                    description: 'Whether to replace all occurrences',
                    default: true,
                },
                caseInsensitive: {
                    type: 'boolean',
                    description: 'Whether to ignore case',
                    default: false,
                },
            },
            required: ['text', 'pattern', 'replacement'],
        },
    },
    'text.split': {
        name: 'text.split',
        description: 'Split text into an array based on a delimiter',
        parameters: {
            type: 'object',
            properties: {
                text: {
                    type: 'string',
                    description: 'The text to split',
                },
                delimiter: {
                    type: 'string',
                    description: 'Delimiter to split on',
                },
                limit: {
                    type: 'number',
                    description: 'Maximum number of splits',
                },
            },
            required: ['text', 'delimiter'],
        },
    },
};

/**
 * Implementation for text.countChars
 */
export const countCharsHandler: ToolExecutionFn = async ({ text, countSpaces = true }) => {
    if (typeof text !== 'string') {
        throw new Error('Text must be a string');
    }

    if (!countSpaces) {
        text = text.replace(/\s/g, '');
    }

    return text.length;
};

/**
 * Implementation for text.countWords
 */
export const countWordsHandler: ToolExecutionFn = async ({ text }) => {
    if (typeof text !== 'string') {
        throw new Error('Text must be a string');
    }

    // Split by whitespace and filter out empty strings
    const words = text.trim().split(/\s+/).filter(Boolean);
    return words.length;
};

/**
 * Implementation for text.countLines
 */
export const countLinesHandler: ToolExecutionFn = async ({ text }) => {
    if (typeof text !== 'string') {
        throw new Error('Text must be a string');
    }

    // Count newlines plus 1 (if text is not empty)
    return text ? text.split('\n').length : 0;
};

/**
 * Implementation for text.changeCase
 */
export const changeCaseHandler: ToolExecutionFn = async ({ text, case: caseType }) => {
    if (typeof text !== 'string') {
        throw new Error('Text must be a string');
    }

    switch (caseType) {
        case TextCase.UPPER:
            return text.toUpperCase();
        case TextCase.LOWER:
            return text.toLowerCase();
        case TextCase.TITLE:
            return text
                .toLowerCase()
                .split(' ')
                .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                .join(' ');
        case TextCase.SENTENCE:
            return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
        case TextCase.CAMEL:
            return text
                .toLowerCase()
                .replace(/[^a-zA-Z0-9]+(.)/g, (_, c) => c.toUpperCase());
        case TextCase.PASCAL:
            return text
                .toLowerCase()
                .replace(/(^|[^a-zA-Z0-9]+)(.)/g, (_, __, c) => c.toUpperCase());
        case TextCase.SNAKE:
            return text
                .toLowerCase()
                .replace(/\s+/g, '_')
                .replace(/[^a-zA-Z0-9_]/g, '');
        case TextCase.KEBAB:
            return text
                .toLowerCase()
                .replace(/\s+/g, '-')
                .replace(/[^a-zA-Z0-9-]/g, '');
        default:
            throw new Error(`Unsupported case type: ${caseType}`);
    }
};

/**
 * Implementation for text.truncate
 */
export const truncateHandler: ToolExecutionFn = async ({ text, maxLength, suffix = '...' }) => {
    if (typeof text !== 'string') {
        throw new Error('Text must be a string');
    }

    if (text.length <= maxLength) {
        return text;
    }

    return text.slice(0, maxLength - suffix.length) + suffix;
};

/**
 * Implementation for text.extract
 */
export const extractHandler: ToolExecutionFn = async ({ text, start, end }) => {
    if (typeof text !== 'string') {
        throw new Error('Text must be a string');
    }

    return text.slice(start, end);
};

/**
 * Implementation for text.match
 */
export const matchHandler: ToolExecutionFn = async ({ text, pattern, global = true, caseInsensitive = false }) => {
    if (typeof text !== 'string') {
        throw new Error('Text must be a string');
    }

    let flags = '';
    if (global) flags += 'g';
    if (caseInsensitive) flags += 'i';

    const regex = new RegExp(pattern, flags);

    if (global) {
        const matches = [];
        let match;
        while ((match = regex.exec(text)) !== null) {
            matches.push({
                text: match[0],
                index: match.index,
                groups: match.slice(1),
            });
            if (!regex.global) break;
        }
        return matches;
    } else {
        const match = text.match(regex);
        if (!match) return null;

        return {
            text: match[0],
            index: match.index,
            groups: match.slice(1),
        };
    }
};

/**
 * Implementation for text.replace
 */
export const replaceHandler: ToolExecutionFn = async ({ text, pattern, replacement, global = true, caseInsensitive = false }) => {
    if (typeof text !== 'string') {
        throw new Error('Text must be a string');
    }

    let flags = '';
    if (global) flags += 'g';
    if (caseInsensitive) flags += 'i';

    const regex = new RegExp(pattern, flags);
    return text.replace(regex, replacement);
};

/**
 * Implementation for text.split
 */
export const splitHandler: ToolExecutionFn = async ({ text, delimiter, limit }) => {
    if (typeof text !== 'string') {
        throw new Error('Text must be a string');
    }

    if (typeof limit === 'number') {
        return text.split(delimiter, limit);
    }

    return text.split(delimiter);
};

/**
 * All text tool handlers
 */
export const TEXT_TOOL_HANDLERS: Record<string, ToolExecutionFn> = {
    'text.countChars': countCharsHandler,
    'text.countWords': countWordsHandler,
    'text.countLines': countLinesHandler,
    'text.changeCase': changeCaseHandler,
    'text.truncate': truncateHandler,
    'text.extract': extractHandler,
    'text.match': matchHandler,
    'text.replace': replaceHandler,
    'text.split': splitHandler,
}; 