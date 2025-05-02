#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { fileURLToPath } from 'url';

// Get the directory of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Templates directory
const TEMPLATES_DIR = path.join(__dirname, 'templates');
const SERVERS_DIR = path.join(__dirname, 'servers');

// Available templates
const TEMPLATES = {
    'typescript-basic': path.join(TEMPLATES_DIR, 'typescript', 'basic'),
    'python-basic': path.join(TEMPLATES_DIR, 'python', 'basic'),
};

// Create interface for readline
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
});

// Helper function to ask questions
function ask(question) {
    return new Promise((resolve) => {
        rl.question(`${question}: `, (answer) => {
            resolve(answer);
        });
    });
}

// Helper function to copy a directory recursively
function copyDirectory(source, destination, replacements) {
    // Create destination directory if it doesn't exist
    if (!fs.existsSync(destination)) {
        fs.mkdirSync(destination, { recursive: true });
    }

    // Get all files in the source directory
    const files = fs.readdirSync(source);

    // Copy each file or directory
    for (const file of files) {
        const sourcePath = path.join(source, file);
        const destPath = path.join(destination, file);

        // Get file stats
        const stats = fs.statSync(sourcePath);

        if (stats.isDirectory()) {
            // Recursively copy directory
            copyDirectory(sourcePath, destPath, replacements);
        } else {
            // Copy and process file
            let content = fs.readFileSync(sourcePath, 'utf8');

            // Replace template placeholders
            for (const [key, value] of Object.entries(replacements)) {
                content = content.replace(new RegExp(`{{${key}}}`, 'g'), value);
            }

            fs.writeFileSync(destPath, content);
        }
    }
}

// Main function
async function main() {
    console.log('MCP Server Generator');
    console.log('===================');
    console.log('This script will help you create a new MCP server from a template.');
    console.log();

    // Ask for server details
    const serverName = await ask('Server name (alphanumeric with hyphens)');
    if (!serverName || !/^[a-zA-Z0-9-]+$/.test(serverName)) {
        console.error('Error: Server name must be alphanumeric with hyphens only');
        process.exit(1);
    }

    const serverDescription = await ask('Server description');

    // Ask for template
    console.log();
    console.log('Available templates:');
    Object.keys(TEMPLATES).forEach((template, index) => {
        console.log(`${index + 1}. ${template}`);
    });

    const templateChoice = parseInt(await ask('Choose a template (number)'), 10);
    if (isNaN(templateChoice) || templateChoice < 1 || templateChoice > Object.keys(TEMPLATES).length) {
        console.error('Error: Invalid template choice');
        process.exit(1);
    }

    const selectedTemplate = Object.keys(TEMPLATES)[templateChoice - 1];
    const templatePath = TEMPLATES[selectedTemplate];

    // Tool details
    const toolName = await ask('Tool name (alphanumeric with underscores)');
    if (!toolName || !/^[a-zA-Z0-9_]+$/.test(toolName)) {
        console.error('Error: Tool name must be alphanumeric with underscores only');
        process.exit(1);
    }

    const toolDescription = await ask('Tool description');

    // Create server directory
    const serverDir = path.join(SERVERS_DIR, serverName);
    if (fs.existsSync(serverDir)) {
        console.error(`Error: Directory already exists: ${serverDir}`);
        process.exit(1);
    }

    // Copy template with replacements
    try {
        copyDirectory(templatePath, serverDir, {
            name: serverName,
            description: serverDescription,
            toolName: toolName,
            toolDescription: toolDescription,
        });

        console.log();
        console.log(`Server '${serverName}' created successfully in ${serverDir}`);
        console.log();
        console.log('Next steps:');

        if (selectedTemplate.startsWith('typescript')) {
            console.log('1. Run: cd mcp-lab/servers/' + serverName);
            console.log('2. Run: npm install');
            console.log('3. Run: npm run build');
        } else if (selectedTemplate.startsWith('python')) {
            console.log('1. Run: cd mcp-lab/servers/' + serverName);
            console.log('2. Run: pip install -e .');
        }

        console.log('4. Refresh servers in MCP Lab UI');
        console.log('5. Connect to your new server and start developing!');
    } catch (error) {
        console.error('Error creating server:', error);
        process.exit(1);
    }

    rl.close();
}

// Run the script
main(); 