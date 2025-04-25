import { SandboxedToolRegistry } from '../sandboxed-tool-registry';

// Mock weather data (in a real implementation, this would call a weather API)
const weatherData: Record<string, {
    temperature: number;
    condition: string;
    humidity: number;
    wind: { speed: number; direction: string };
    updated: Date;
}> = {
    'London': {
        temperature: 18,
        condition: 'Cloudy',
        humidity: 72,
        wind: { speed: 10, direction: 'NW' },
        updated: new Date(),
    },
    'New York': {
        temperature: 22,
        condition: 'Sunny',
        humidity: 55,
        wind: { speed: 7, direction: 'SE' },
        updated: new Date(),
    },
    'Tokyo': {
        temperature: 25,
        condition: 'Partly Cloudy',
        humidity: 68,
        wind: { speed: 5, direction: 'E' },
        updated: new Date(),
    },
    'São Paulo': {
        temperature: 23,
        condition: 'Rainy',
        humidity: 85,
        wind: { speed: 12, direction: 'S' },
        updated: new Date(),
    },
    'Sydney': {
        temperature: 28,
        condition: 'Sunny',
        humidity: 62,
        wind: { speed: 15, direction: 'NE' },
        updated: new Date(),
    },
};

/**
 * Register weather tools to the registry
 */
export function registerWeatherTools(registry: SandboxedToolRegistry): void {
    // Get weather data for a location
    registry.registerTool({
        name: 'weather.get',
        description: 'Get current weather information for a location',
        parameters: {
            type: 'object',
            properties: {
                location: {
                    type: 'string',
                    description: 'The name of the city to get weather for'
                },
            },
            required: ['location'],
        },
        execute: async (params) => {
            const { location } = params;

            // Normalize location name for case-insensitive matching
            const normalizedLocation = Object.keys(weatherData).find(
                city => city.toLowerCase() === location.toLowerCase()
            );

            if (!normalizedLocation || !weatherData[normalizedLocation]) {
                return {
                    error: 'Location not found',
                    availableLocations: Object.keys(weatherData),
                };
            }

            // Simulate slight variations in data to make it more realistic
            const data = weatherData[normalizedLocation];
            const tempVariation = Math.random() * 2 - 1; // -1 to +1 degrees

            return {
                location: normalizedLocation,
                temperature: Math.round((data.temperature + tempVariation) * 10) / 10,
                condition: data.condition,
                humidity: data.humidity,
                wind: data.wind,
                updated: data.updated.toISOString(),
            };
        },
    });

    // List available locations
    registry.registerTool({
        name: 'weather.locations',
        description: 'List available locations for weather data',
        parameters: {
            type: 'object',
            properties: {},
        },
        execute: async () => {
            return {
                locations: Object.keys(weatherData),
            };
        },
    });

    // Get forecast
    registry.registerTool({
        name: 'weather.forecast',
        description: 'Get a weather forecast for the next few days',
        parameters: {
            type: 'object',
            properties: {
                location: {
                    type: 'string',
                    description: 'The name of the city to get forecast for'
                },
                days: {
                    type: 'number',
                    description: 'Number of days to forecast (1-5)',
                    minimum: 1,
                    maximum: 5,
                },
            },
            required: ['location'],
        },
        execute: async (params) => {
            const { location, days = 3 } = params;

            // Normalize location name
            const normalizedLocation = Object.keys(weatherData).find(
                city => city.toLowerCase() === location.toLowerCase()
            );

            if (!normalizedLocation || !weatherData[normalizedLocation]) {
                return {
                    error: 'Location not found',
                    availableLocations: Object.keys(weatherData),
                };
            }

            const baseData = weatherData[normalizedLocation];
            const today = new Date();

            // Generate mock forecast
            const forecast = [];
            const conditions = ['Sunny', 'Cloudy', 'Partly Cloudy', 'Rainy', 'Stormy', 'Windy'];

            for (let i = 0; i < days; i++) {
                const forecastDate = new Date(today);
                forecastDate.setDate(forecastDate.getDate() + i + 1);

                const tempVariation = Math.random() * 6 - 3; // -3 to +3 degree variation
                const randomConditionIndex = Math.floor(Math.random() * conditions.length);

                forecast.push({
                    date: forecastDate.toISOString().split('T')[0],
                    temperature: {
                        min: Math.round((baseData.temperature + tempVariation - 3) * 10) / 10,
                        max: Math.round((baseData.temperature + tempVariation + 3) * 10) / 10,
                    },
                    condition: conditions[randomConditionIndex],
                    precipitationChance: Math.round(Math.random() * 100),
                });
            }

            return {
                location: normalizedLocation,
                forecast,
                updated: new Date().toISOString(),
            };
        },
    });
}

/**
 * Example of setting up and using weather tools
 */
async function weatherToolsExample() {
    console.log('Setting up weather tools...');

    // Create a sandboxed tool registry
    const toolRegistry = new SandboxedToolRegistry({
        sandboxAllTools: false, // Weather tools don't need sandboxing
    });

    // Register weather tools
    registerWeatherTools(toolRegistry);

    console.log('Weather tools registered:');
    console.log(toolRegistry.listTools().map(tool => tool.name));

    // Example of using weather tools
    try {
        const londonWeather = await toolRegistry.executeTool('weather.get', { location: 'London' });
        console.log('London weather:', londonWeather);

        const locations = await toolRegistry.executeTool('weather.locations', {});
        console.log('Available locations:', locations);

        const forecast = await toolRegistry.executeTool('weather.forecast', { location: 'Tokyo', days: 3 });
        console.log('Tokyo forecast:', forecast);
    } catch (error) {
        console.error('Error executing weather tools:', error);
    }
}

// Run the example if this script is executed directly
if (require.main === module) {
    weatherToolsExample().catch(error => {
        console.error('Example failed:', error);
        process.exit(1);
    });
} 