import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { WebSocketServer } from 'ws';
import * as z from 'zod';
import fs from 'fs';

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

// --- Shared optional styling params, merged onto every part-creating tool's schema ---
const styleParams = {
    tint: z.string().optional().describe('Hex color like "#8833ff" applied as a tint over the part\'s base color'),
    scale: z.number().optional().describe('Uniform scale factor, e.g. 1.5 for 50% bigger, 0.5 for half size'),
    scaleX: z.number().optional().describe('Horizontal scale factor, e.g. 0.5 for a thin part'),
    scaleY: z.number().optional().describe('Vertical scale factor, e.g. 1.6 for a long/tall part'),
    angle: z.number().optional().describe('Rotation in degrees, e.g. 15 or -30'),
    dx: z.number().optional().describe('Horizontal nudge in pixels from the default attachment point'),
    dy: z.number().optional().describe('Vertical nudge in pixels from the default attachment point, e.g. -20 to move something up'),
};

// --- Register tools
server.registerTool(
    'create_body',
    {
        description: 'Create the monster body. Must be called before adding any other parts. Replaces any existing monster. ' +
            'Supports optional styling: tint (hex color overlay), scale/scaleX/scaleY (resize), angle (rotate in degrees), ' +
            'and dx/dy (nudge position from center).',
        inputSchema: z.object({
            color: z.enum(['blue', 'green', 'red', 'yellow', 'dark']).describe('Body color, dark=brown'),
            shape: z.enum(['A', 'B', 'C', 'D', 'E', 'F']).describe('Body shape variant: A=square, B=round, C=oval, D=squat oval, E=long body, F=long body with hair tufts'),
        }).extend(styleParams),
    },
    async (params) => {
        try {
            const reply = await sendToGame('create_body', params);
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
        description: 'Add a mirrored pair of arms to the monster. Requires a body to already exist. ' +
            'Supports optional styling: tint (hex color overlay), scale/scaleX/scaleY (resize), angle (rotate in degrees), ' +
            'and dx/dy (nudge position; applied to both arms).',
        inputSchema: z.object({
            color: z.enum(['blue', 'green', 'red', 'yellow', 'dark']).describe('Arm color'),
            shape: z.enum(['A', 'B', 'C', 'D', 'E']).describe('Arm pose/shape variant'),
        }).extend(styleParams),
    },
    async (params) => {
        try {
            const reply = await sendToGame('add_arms', params);
            return { content: [{ type: 'text', text: reply.result }] };
        } catch (err) {
            return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
        }
    }
);

server.registerTool(
    'add_legs',
    {
        description: 'Add a mirrored pair of legs to the monster. Requires a body to already exist. ' +
            'Supports optional styling: tint (hex color overlay), scale/scaleX/scaleY (resize), angle (rotate in degrees), ' +
            'and dx/dy (nudge position; applied to both legs).',
        inputSchema: z.object({
            color: z.enum(['blue', 'green', 'red', 'yellow', 'dark']).describe('Leg color'),
            shape: z.enum(['A', 'B', 'C']).describe('Leg pose/shape variant'), // GUESS — confirm against real assets
        }).extend(styleParams),
    },
    async (params) => {
        try {
            const reply = await sendToGame('add_legs', params);
            return { content: [{ type: 'text', text: reply.result }] };
        } catch (err) {
            return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
        }
    }
);

server.registerTool(
    'add_eyes',
    {
        description: 'Add eyes to the monster. Requires a body to already exist. ' +
            'Supports optional styling: tint (hex color overlay), scale/scaleX/scaleY (resize, e.g. scale: 2 for a huge eye), ' +
            'angle (rotate in degrees), and dx/dy (nudge position; applied to every eye).',
        inputSchema: z.object({
            count: z.number().int().min(1).max(5).describe('Number of eyes'),
            style: z.enum(['normal', 'angry', 'happy', 'sleepy']).describe('Eye expression style'), // GUESS — confirm against real assets
        }).extend(styleParams),
    },
    async (params) => {
        try {
            const reply = await sendToGame('add_eyes', params);
            return { content: [{ type: 'text', text: reply.result }] };
        } catch (err) {
            return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
        }
    }
);

server.registerTool(
    'add_mouth',
    {
        description: 'Add a mouth to the monster. Requires a body to already exist. ' +
            'Supports optional styling: tint (hex color overlay), scale/scaleX/scaleY (resize), angle (rotate in degrees), ' +
            'and dx/dy (nudge position).',
        inputSchema: z.object({
            style: z.enum(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J']).describe('Mouth style variant'),
        }).extend(styleParams),
    },
    async (params) => {
        try {
            const reply = await sendToGame('add_mouth', params);
            return { content: [{ type: 'text', text: reply.result }] };
        } catch (err) {
            return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
        }
    }
);

server.registerTool(
    'add_antennas',
    {
        description: 'Add antennas to the monster. Requires a body to already exist. ' +
            'Supports optional styling: tint (hex color overlay), scale/scaleX/scaleY (resize), angle (rotate in degrees), ' +
            'and dx/dy (nudge position; applied to every antenna).',
        inputSchema: z.object({
            count: z.number().int().min(1).max(4).describe('Number of antennas'),
            color: z.enum(['blue', 'green', 'red', 'yellow', 'dark']).describe('Antenna color'),
            size: z.enum(['small', 'large']).describe('Antenna size'),
        }).extend(styleParams),
    },
    async (params) => {
        try {
            const reply = await sendToGame('add_antennas', params);
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
        description: 'Build a complete monster in one call from a full specification. Any omitted part is simply skipped. ' +
            'Each part accepts optional styling: tint (hex color overlay), scale/scaleX/scaleY (resize), angle (rotate in degrees), ' +
            'and dx/dy (positional nudge).',
        inputSchema: z.object({
            body: z.object({
                color: z.enum(['blue', 'green', 'red', 'yellow', 'dark']),
                shape: z.enum(['A', 'B', 'C', 'D', 'E', 'F']),
            }).extend(styleParams).optional(),
            eyes: z.object({
                count: z.number().int().min(1).max(5),
                style: z.enum(['normal', 'angry', 'happy', 'sleepy']),
            }).extend(styleParams).optional(),
            mouth: z.object({
                style: z.enum(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J']),
            }).extend(styleParams).optional(),
            arms: z.object({
                color: z.enum(['blue', 'green', 'red', 'yellow', 'dark']),
                shape: z.enum(['A', 'B', 'C', 'D', 'E']),
            }).extend(styleParams).optional(),
            legs: z.object({
                color: z.enum(['blue', 'green', 'red', 'yellow', 'dark']),
                shape: z.enum(['A', 'B', 'C']),
            }).extend(styleParams).optional(),
            antennas: z.object({
                count: z.number().int().min(1).max(4),
                color: z.enum(['blue', 'green', 'red', 'yellow', 'dark']),
                size: z.enum(['small', 'large']),
            }).extend(styleParams).optional(),
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

// --- Sight: screenshot tool ---
let shotCount = 0;

server.registerTool(
    'take_screenshot',
    {
        description: 'Capture an image of the current monster so you can see your work. Use this after building to evaluate the design.',
        inputSchema: z.object({}),
    },
    async () => {
        try {
            const reply = await sendToGame('take_screenshot');
            const b64 = reply.result;

            fs.mkdirSync('gallery', { recursive: true });
            fs.writeFileSync(`gallery/monster_${++shotCount}.png`, Buffer.from(b64, 'base64'));

            return {
                content: [{ type: 'image', data: b64, mimeType: 'image/png' }],
            };
        } catch (err) {
            return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
        }
    }
);

// --- Memory: remember / recall tools ---
const NOTES_FILE = 'design_notes.json';

// Load the notes array from disk. If the file doesn't exist yet (first run),
// start with an empty list.
function loadNotes() {
    if (!fs.existsSync(NOTES_FILE)) {
        return [];
    }
    const text = fs.readFileSync(NOTES_FILE, 'utf8');
    return JSON.parse(text);
}

server.registerTool(
    'remember',
    {
        description:
            'Store a design lesson you have learned, so future design sessions can benefit from it. ' +
            'Lessons should be specific and actionable, e.g. "tints below #444444 make parts hard to ' +
            'distinguish against the dark background", not vague, e.g. "use good colors".',
        inputSchema: z.object({
            lesson: z.string().describe('The design lesson to store'),
        }),
    },
    async ({ lesson }) => {
        // Read-modify-write: load what's there, add the new entry, save it all back.
        const notes = loadNotes();
        notes.push({
            timestamp: new Date().toISOString(),
            lesson: lesson,
        });
        fs.writeFileSync(NOTES_FILE, JSON.stringify(notes, null, 2));

        console.error(`[memory] stored lesson #${notes.length}`);
        return {
            content: [{ type: 'text', text: `Lesson stored. You now have ${notes.length} lessons.` }],
        };
    }
);

server.registerTool(
    'recall',
    {
        description:
            'Retrieve all design lessons you have stored so far, so you can apply them to the current design. ' +
            'Call this at the start of every design session.',
        inputSchema: z.object({}),
    },
    async () => {
        const notes = loadNotes();
        if (notes.length === 0) {
            return { content: [{ type: 'text', text: 'No lessons stored yet.' }] };
        }
        const formatted = notes
            .map((n, i) => `${i + 1}. [${n.timestamp}] ${n.lesson}`)
            .join('\n');
        return { content: [{ type: 'text', text: formatted }] };
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