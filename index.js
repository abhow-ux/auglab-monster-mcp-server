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
    tint: z.string().optional().describe(
        'Hex color like "#8833ff" applied as a MULTIPLICATIVE tint: each color channel of ' +
        'the tint is multiplied against the texture\'s own pixel channel (tint_channel * ' +
        'base_channel / 255). This means tint never repaints or brightens a part — it only ' +
        'darkens/filters it. Tinting a dark base part (e.g. "dark") will push it toward black ' +
        'almost regardless of the tint color; tints only look close to the tint color on ' +
        'lighter base parts (e.g. "yellow", "white"). After tinting, call ' +
        'describe_monster_colors to see the real computed effective color and luminance — ' +
        'do not assume the tint hex is what you\'ll actually see.'),
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
            'Supports optional styling: tint (multiplicative hex filter — see param description; darkens more than it recolors), ' +
            'scale/scaleX/scaleY (resize), angle (rotate in degrees), and dx/dy (nudge position from center).',
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
            'Supports optional styling: tint (multiplicative hex filter — see param description; darkens more than it recolors), ' +
            'scale/scaleX/scaleY (resize), angle (rotate in degrees), and dx/dy (nudge position; applied to both arms).',
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
            'Supports optional styling: tint (multiplicative hex filter — see param description; darkens more than it recolors), ' +
            'scale/scaleX/scaleY (resize), angle (rotate in degrees), and dx/dy (nudge position; applied to both legs).',
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
            'Supports optional styling: tint (multiplicative hex filter — see param description; note eye textures have ' +
            'no known base color, so the effective result can\'t be pre-computed, check visually), scale/scaleX/scaleY ' +
            '(resize, e.g. scale: 2 for a huge eye), angle (rotate in degrees), and dx/dy (nudge position; applied to every eye).',
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
            'Supports optional styling: tint (multiplicative hex filter — see param description; note mouth textures ' +
            'have no known base color, so the effective result can\'t be pre-computed, check visually), ' +
            'scale/scaleX/scaleY (resize), angle (rotate in degrees), and dx/dy (nudge position).',
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
            'Supports optional styling: tint (multiplicative hex filter — see param description; darkens more than it recolors), ' +
            'scale/scaleX/scaleY (resize), angle (rotate in degrees), and dx/dy (nudge position; applied to every antenna).',
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
    'describe_monster_colors',
    {
        description:
            'Report, for every part currently on the monster: its base color, any tint applied, the ' +
            'computed effective color (accounting for multiplicative tinting), its luminance (0-255 ' +
            'brightness), and the luminance difference from the body (i.e. contrast). Use this after ' +
            'tinting anything, and whenever you need to reason about whether parts are visually ' +
            'distinguishable from each other or from the body — luminance numbers are comparable, hex ' +
            'strings are not.',
        inputSchema: z.object({}),
    },
    async () => {
        try {
            const reply = await sendToGame('describe_monster_colors', {});
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
            'Each part accepts optional styling: tint (multiplicative hex filter — see the tint param description on ' +
            'individual part tools; darkens more than it recolors), scale/scaleX/scaleY (resize), angle (rotate in degrees), ' +
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

// --- Sight: screenshot tool, rebuilt around named series (Part 1d) ---
// No in-memory shotCount anymore — the filesystem is the counter, which is
// what makes numbering survive server restarts. No "start series" / "current
// series" state either: passing series on every call is mildly repetitive
// but completely restart-proof, which a session-scoped variable is not.

server.registerTool(
    'take_screenshot',
    {
        description:
            'Capture an image of the current monster and save it to the gallery under the given series ' +
            '(style name). Use this after building to evaluate the design. Saves gallery/<series>/NNN.png ' +
            'plus a sidecar gallery/<series>/NNN.json containing the full monster state, so any gallery ' +
            'entry can be rebuilt exactly later. The reply gives you the saved PNG path — hang onto it, ' +
            'remember requires citing this path when a lesson is drawn from a specific monster.',
        inputSchema: z.object({
            series: z.string().describe(
                'The style/series this monster belongs to, e.g. "rust-bucket". ' +
                'Use the same name as your memory style tag.'),
        }),
    },
    async ({ series }) => {
        try {
            const stateReply = await sendToGame('get_monster_state', {});
            const state = stateReply.result;

            const shotReply = await sendToGame('take_screenshot', {});
            const b64 = shotReply.result;

            // Slugify defensively — "Rust Bucket", "rust_bucket", "rust-bucket"
            // must all land in the same folder.
            const slug = series.toLowerCase().replace(/[^a-z0-9]+/g, '-');
            const dir = `gallery/${slug}`;
            fs.mkdirSync(dir, { recursive: true });

            // Derive the next number by scanning the folder, never from an
            // in-memory counter — this is what makes it restart-proof.
            const existingNums = fs.readdirSync(dir)
                .filter(f => /^\d+\.png$/.test(f))
                .map(f => parseInt(f, 10));
            const next = existingNums.length > 0 ? Math.max(...existingNums) + 1 : 1;
            const num = String(next).padStart(3, '0');

            const pngPath = `${dir}/${num}.png`;
            const jsonPath = `${dir}/${num}.json`;

            fs.writeFileSync(pngPath, Buffer.from(b64, 'base64'));
            fs.writeFileSync(jsonPath, state);

            return {
                content: [
                    { type: 'image', data: b64, mimeType: 'image/png' },
                    { type: 'text', text: `Saved ${pngPath} (state sidecar: ${jsonPath})` },
                ],
            };
        } catch (err) {
            return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
        }
    }
);

// --- Escape hatch: experimental commands (Part 2a) ---
// Forwards any command name/params straight to the game with no schema and
// no validation. This is intentional — new capabilities live in scene.js's
// experimental registry, are exercised through this generic tool, and only
// get a real Zod-validated tool here once they're promoted. See AGENTS.md.

server.registerTool(
    'experimental_command',
    {
        description:
            'Invoke an experimental game capability by name. These are new commands added to scene.js ' +
            'that are not yet first-class tools. Call list_experimental_commands FIRST to discover what ' +
            'exists and how to call it — this tool does not validate params for you.',
        inputSchema: z.object({
            command: z.string().describe('Experimental command name'),
            params: z.record(z.any()).optional().describe('Parameters, as documented by list_experimental_commands'),
        }),
    },
    async ({ command, params }) => {
        try {
            const reply = await sendToGame(command, params ?? {});
            return { content: [{ type: 'text', text: String(reply.result) }] };
        } catch (err) {
            return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
        }
    }
);

server.registerTool(
    'list_experimental_commands',
    {
        description:
            'List every experimental game capability currently registered in scene.js, with its ' +
            'description and parameter shape. Call this before using experimental_command.',
        inputSchema: z.object({}),
    },
    async () => {
        try {
            const reply = await sendToGame('list_experimental_commands', {});
            return { content: [{ type: 'text', text: String(reply.result) }] };
        } catch (err) {
            return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
        }
    }
);

// --- Memory: remember / recall / replace_notes, namespaced by style (Part 3) ---
const NOTES_FILE = 'design_notes.json';

// Load the notes array from disk. If the file doesn't exist yet (first run),
// start with an empty list. Every entry now carries a `style` field.
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
            'Store a design lesson under a specific style/series, so future sessions working in that ' +
            'style can benefit from it. Lessons should be specific and actionable, e.g. "tints below ' +
            '#444444 make parts hard to distinguish against the dark background", not vague, e.g. "use ' +
            'good colors". If the lesson is drawn from a specific monster, you MUST cite its gallery ' +
            'screenshot path, e.g. "gallery/rust-bucket/007.png shows the tint washing out" — you have ' +
            'this path because take_screenshot returns it. Path-cited lessons stay auditable even after ' +
            'consolidation rewrites this file.',
        inputSchema: z.object({
            style: z.string().describe('The style/series this lesson belongs to. Use the same name as your take_screenshot series.'),
            lesson: z.string().describe('The design lesson to store, citing a gallery path if it draws on a specific monster.'),
        }),
    },
    async ({ style, lesson }) => {
        const notes = loadNotes();
        notes.push({
            timestamp: new Date().toISOString(),
            style,
            lesson,
        });
        fs.writeFileSync(NOTES_FILE, JSON.stringify(notes, null, 2));

        const styleCount = notes.filter(n => n.style === style).length;
        console.error(`[memory] stored lesson #${notes.length} (style="${style}", now ${styleCount} for this style)`);
        return {
            content: [{ type: 'text', text: `Lesson stored under style "${style}". You now have ${styleCount} lessons for this style.` }],
        };
    }
);

server.registerTool(
    'recall',
    {
        description:
            'Retrieve stored design lessons, optionally filtered to one style. Call this at the start of ' +
            'every design session, passing the style/series you are about to work in — otherwise you\'ll ' +
            'get every style\'s lessons interleaved.',
        inputSchema: z.object({
            style: z.string().optional().describe('If given, only return lessons stored under this style/series.'),
        }),
    },
    async ({ style }) => {
        const notes = loadNotes();
        const filtered = style ? notes.filter(n => n.style === style) : notes;
        if (filtered.length === 0) {
            return {
                content: [{
                    type: 'text',
                    text: style ? `No lessons stored yet for style "${style}".` : 'No lessons stored yet.',
                }],
            };
        }
        const formatted = filtered
            .map((n, i) => `${i + 1}. [${n.timestamp}] (${n.style}) ${n.lesson}`)
            .join('\n');
        return { content: [{ type: 'text', text: formatted }] };
    }
);

server.registerTool(
    'replace_notes',
    {
        description:
            'Consolidation tool — run this every 5 iterations. Overwrites ALL stored lessons for one ' +
            'style with a new, smaller set: recall everything for the style first, merge duplicates, ' +
            'resolve contradictions (keep the later finding, and note in the new lesson text what it ' +
            'superseded), drop anything the current baseline has already absorbed, and preserve evidence ' +
            'paths (gallery/... citations) through the rewrite. Lessons belonging to other styles are ' +
            'left untouched.',
        inputSchema: z.object({
            style: z.string().describe('The style/series whose lessons are being replaced.'),
            lessons: z.array(z.string()).describe('The new, consolidated list of lessons for this style, replacing all previous ones for it.'),
        }),
    },
    async ({ style, lessons }) => {
        const notes = loadNotes();
        const others = notes.filter(n => n.style !== style);
        const replaced = lessons.map(lesson => ({
            timestamp: new Date().toISOString(),
            style,
            lesson,
        }));
        const updated = [...others, ...replaced];
        fs.writeFileSync(NOTES_FILE, JSON.stringify(updated, null, 2));

        console.error(`[memory] consolidated style="${style}": now ${replaced.length} lessons`);
        return {
            content: [{ type: 'text', text: `Replaced notes for style "${style}": now ${replaced.length} consolidated lessons.` }],
        };
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