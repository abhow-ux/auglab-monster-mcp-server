import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { WebSocketServer } from 'ws';
import * as z from 'zod';

// Create the server
const server = new McpServer({
    name: 'phaser-monster-tools',
    version: '1.0.0',
});

// --- WebSocket bridge to the Phaser game ---
const wss = new WebSocketServer({ port: 8081 });
let gameSocket = null;          // the currently connected game, if any
const pending = new Map();      // message id -> resolve function
let nextId = 1;

wss.on('connection', (ws) => {
    console.error('[bridge] Phaser game connected');
    gameSocket = ws;

    ws.on('message', (data) => {
        const msg = JSON.parse(data.toString());
        // Find the promise waiting for this reply, and resolve it
        const resolve = pending.get(msg.id);
        if (resolve) {
            resolve(msg);
            pending.delete(msg.id);
        }
    });

    ws.on('close', () => {
        console.error('[bridge] game disconnected');
        if (gameSocket === ws) gameSocket = null;
    });
});

// Send a command to the game and wait for its reply
function sendToGame(command, params = {}) {
    return new Promise((resolve, reject) => {
        if (!gameSocket) {
            reject(new Error('No game connected. Is the game page open in your browser?'));
            return;
        }
        const id = nextId++;
        pending.set(id, resolve);
        gameSocket.send(JSON.stringify({ id, command, params }));

        // Don't wait forever
        setTimeout(() => {
            if (pending.delete(id)) {
                reject(new Error('Game did not respond within 5 seconds.'));
            }
        }, 5000);
    });
}

// --- Register tools
server.registerTool(
    'create_body',
    {
        description: 'Create the monster body. Must be called before adding any other parts. Replaces any existing monster.',
        inputSchema: z.object({
            color: z.enum(['blue', 'green', 'red', 'yellow', 'dark']).describe('Body color, dark=brown'),
            shape: z.enum(['A', 'B', 'C', 'D', 'E', 'F']).describe('Body shape variant: A=square, B=round, C=oval, D=squat oval, E=long body, F=long body with hair tufts'),
        }),
    },
    async ({ color, shape }) => {
        try {
            const reply = await sendToGame('create_body', { color, shape });
            return { content: [{ type: 'text', text: reply.result }] };
        } catch (err) {
            return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
        }
    }
);

server.registerTool(
    'clear_monster',
    {
        description: 'Remove all parts and start with an empty stage.',
        inputSchema: z.object({}),
    },
    async () => {
        try {
            const reply = await sendToGame('clear_monster', {});
            return { content: [{ type: 'text', text: reply.result }] };
        } catch (err) {
            return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
        }
    }
);

server.registerTool(
    'add_arms',
    {
        description: 'Add a mirrored pair of arms to the monster. Requires a body to already exist.',
        inputSchema: z.object({
            color: z.enum(['blue', 'green', 'red', 'yellow', 'dark']).describe('Arm color'),
            shape: z.enum(['A', 'B', 'C', 'D', 'E']).describe('Arm pose/shape variant'),
        }),
    },
    async ({ color, shape }) => {
        try {
            const reply = await sendToGame('add_arms', { color, shape });
            return { content: [{ type: 'text', text: reply.result }] };
        } catch (err) {
            return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
        }
    }
);

server.registerTool(
    'add_legs',
    {
        description: 'Add a mirrored pair of legs to the monster. Requires a body to already exist.',
        inputSchema: z.object({
            color: z.enum(['blue', 'green', 'red', 'yellow', 'dark']).describe('Leg color'),
            shape: z.enum(['A', 'B', 'C']).describe('Leg pose/shape variant'), // GUESS — confirm against real assets
        }),
    },
    async ({ color, shape }) => {
        try {
            const reply = await sendToGame('add_legs', { color, shape });
            return { content: [{ type: 'text', text: reply.result }] };
        } catch (err) {
            return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
        }
    }
);

server.registerTool(
    'add_eyes',
    {
        description: 'Add eyes to the monster. Requires a body to already exist.',
        inputSchema: z.object({
            count: z.number().int().min(1).max(5).describe('Number of eyes'),
            style: z.enum(['normal', 'angry', 'happy', 'sleepy']).describe('Eye expression style'), // GUESS — confirm against real assets
        }),
    },
    async ({ count, style }) => {
        try {
            const reply = await sendToGame('add_eyes', { count, style });
            return { content: [{ type: 'text', text: reply.result }] };
        } catch (err) {
            return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
        }
    }
);

server.registerTool(
    'add_mouth',
    {
        description: 'Add a mouth to the monster. Requires a body to already exist.',
        inputSchema: z.object({
            style: z.enum(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J']).describe('Mouth style variant'),
        }),
    },
    async ({ style }) => {
        try {
            const reply = await sendToGame('add_mouth', { style });
            return { content: [{ type: 'text', text: reply.result }] };
        } catch (err) {
            return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
        }
    }
);

server.registerTool(
    'add_antennas',
    {
        description: 'Add antennas to the monster. Requires a body to already exist.',
        inputSchema: z.object({
            count: z.number().int().min(1).max(4).describe('Number of antennas'),
            color: z.enum(['blue', 'green', 'red', 'yellow', 'dark']).describe('Antenna color'),
            size: z.enum(['small', 'large']).describe('Antenna size'),
        }),
    },
    async ({ count, color, size }) => {
        try {
            const reply = await sendToGame('add_antennas', { count, color, size });
            return { content: [{ type: 'text', text: reply.result }] };
        } catch (err) {
            return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
        }
    }
);

server.registerTool(
    'get_monster_state',
    {
        description: 'Get a JSON description of every part currently on the monster.',
        inputSchema: z.object({}),
    },
    async () => {
        try {
            const reply = await sendToGame('get_monster_state', {});
            return { content: [{ type: 'text', text: reply.result }] };
        } catch (err) {
            return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
        }
    }
);

server.registerTool(
    'build_monster',
    {
        description: 'Build a complete monster in one call from a full specification. Any omitted part is simply skipped.',
        inputSchema: z.object({
            body: z.object({
                color: z.enum(['blue', 'green', 'red', 'yellow', 'dark']),
                shape: z.enum(['A', 'B', 'C', 'D', 'E', 'F']),
            }).optional(),
            eyes: z.object({
                count: z.number().int().min(1).max(5),
                style: z.enum(['normal', 'angry', 'happy', 'sleepy']),
            }).optional(),
            mouth: z.object({
                style: z.enum(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J']),
            }).optional(),
            arms: z.object({
                color: z.enum(['blue', 'green', 'red', 'yellow', 'dark']),
                shape: z.enum(['A', 'B', 'C', 'D', 'E']),
            }).optional(),
            legs: z.object({
                color: z.enum(['blue', 'green', 'red', 'yellow', 'dark']),
                shape: z.enum(['A', 'B', 'C']),
            }).optional(),
            antennas: z.object({
                count: z.number().int().min(1).max(4),
                color: z.enum(['blue', 'green', 'red', 'yellow', 'dark']),
                size: z.enum(['small', 'large']),
            }).optional(),
        }),
    },
    async (spec) => {
        try {
            const reply = await sendToGame('build_monster', spec);
            return { content: [{ type: 'text', text: reply.result }] };
        } catch (err) {
            return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
        }
    }
);

// -- Start the server on stdio
async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error('MCP server running — waiting for connections.');
}

main().catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
});