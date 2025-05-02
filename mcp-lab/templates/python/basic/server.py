#!/usr/bin/env python3

from mcp import McpServer, Tool


class SampleTool(Tool):
    name = "{{toolName}}"
    description = "{{toolDescription}}"

    def execute(self, params):
        # Extract input from parameters
        input_text = params.get("input", "")

        # Process the input
        return f"Processed: {input_text or 'No input provided'}"


def main():
    # Create the MCP server
    server = McpServer(
        name="{{name}}",
        version="1.0.0",
    )

    # Register the tool
    server.register_tool(SampleTool())

    # Start the server
    print("Starting {{name}} MCP server...")
    server.start()


if __name__ == "__main__":
    main()
