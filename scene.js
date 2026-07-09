/*
 * scene.js — Monster Builder
 *
 * OPEN ITEMS — confirm these against your actual project before your final run:
 *   1. parts.js has no `leg.colors` / `leg.shapes` yet (marked TODO by the
 *      instructor). This file falls back to PARTS.body.colors and ['A','B','C'].
 *      Add real lists to parts.js once you know them, and update the
 *      fallback lines in preload()/add_legs if they differ.
 *   2. Antenna texture keys are `detail_{color}_antenna_{small|large}`,
 *      which needs a color AND a size — but the assignment only guarantees
 *      a `count` param reaches add_antennas. Check your index.js's
 *      add_antennas tool schema for the real param names; this file
 *      defaults to color='blue', size='small' if they're missing.
 *   3. No confirmed enum of valid eye `style` values exists anywhere I've
 *      seen — preload() guesses ['normal','angry','happy','sleepy'].
 *      Replace with the real list (likely matches whatever enum
 *      add_eyes' tool schema uses in index.js) or your images 404.
 *   4. Mouth style is expected to be a single letter A-J, matching the
 *      `mouth{A..J}` key format (no underscore, unlike every other part).
 */

class MonsterScene extends Phaser.Scene {
    constructor() {
        super('MonsterScene');
        this.commandQueue = [];
        this.monster = {};        // game objects only — clearMonster() destroys everything in here
        this.monsterMeta = {};    // plain data describing the current build, for get_monster_state
        this.ws = null;
        this.connected = false;
    }

    preload() {
        // Body — confirmed pattern: body_{color}{shape}
        for (const color of PARTS.body.colors) {
            for (const shape of PARTS.body.shapes) {
                const key = `body_${color}${shape}`;
                this.load.image(key, `assets/${key}.png`);
            }
        }

        // Arms — confirmed pattern: arm_{color}{shape}
        for (const color of PARTS.arm.colors) {
            for (const shape of PARTS.arm.shapes) {
                const key = `arm_${color}${shape}`;
                this.load.image(key, `assets/${key}.png`);
            }
        }

        // Legs — colors/shapes not yet in parts.js (see OPEN ITEM 1).
        const legColors = PARTS.leg.colors || PARTS.body.colors;
        const legShapes = PARTS.leg.shapes || ['A', 'B', 'C'];
        for (const color of legColors) {
            for (const shape of legShapes) {
                const key = `leg_${color}${shape}`;
                this.load.image(key, `assets/${key}.png`);
            }
        }

        // Eyes — key pattern eye_{style} (see OPEN ITEM 3).
        const eyeStyles = PARTS.eye.styles || ['normal', 'angry', 'happy', 'sleepy'];
        for (const style of eyeStyles) {
            const key = `eye_${style}`;
            this.load.image(key, `assets/${key}.png`);
        }

        // Mouths — key pattern mouth{A..J}, NO underscore (see OPEN ITEM 4).
        const mouthStyles = PARTS.mouth.styles ||
            ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];
        for (const style of mouthStyles) {
            const key = `mouth${style}`;
            this.load.image(key, `assets/${key}.png`);
        }

        // Antennas — key pattern detail_{color}_antenna_{small|large} (see OPEN ITEM 2).
        const antennaColors = PARTS.antenna.colors || PARTS.body.colors;
        const antennaSizes = PARTS.antenna.sizes || ['small', 'large'];
        for (const color of antennaColors) {
            for (const size of antennaSizes) {
                const key = `detail_${color}_antenna_${size}`;
                this.load.image(key, `assets/${key}.png`);
            }
        }
    }

    create() {
        this.statusText = this.add.text(10, 10, 'waiting for bridge connection...',
            { color: '#888', fontSize: '14px' });
        this.connectToBridge();
    }

    connectToBridge() {
        this.ws = new WebSocket('ws://localhost:8081');

        this.ws.onopen = () => {
            this.connected = true;
            this.statusText.setText('bridge connected');
            this.statusText.setColor('#6f6');
        };

        // IMPORTANT: this handler never touches game objects.
        // It only enqueues. update() applies changes on Phaser's schedule.
        this.ws.onmessage = (event) => {
            this.commandQueue.push(JSON.parse(event.data));
        };

        this.ws.onclose = () => {
            this.connected = false;
            this.statusText.setText('bridge disconnected — retrying...');
            this.statusText.setColor('#f66');
            setTimeout(() => this.connectToBridge(), 1000);
        };
        this.ws.onerror = () => { /* onclose fires next; retry happens there */ };
    }

    update() {
        // Handle tool requests coming from the MCP server
        while (this.commandQueue.length > 0) {
            const msg = this.commandQueue.shift();
            let result;
            try {
                result = this.executeCommand(msg.command, msg.params);
            } catch (err) {
                result = `Error executing ${msg.command}: ${err.message}`;
            }
            this.ws.send(JSON.stringify({ id: msg.id, result }));
        }
    }

    clearMonster() {
        for (const part of Object.values(this.monster).flat()) {
            if (part && part.destroy) part.destroy();
        }
        this.monster = {};
        this.monsterMeta = {};
    }

    executeCommand(command, params) {
        switch (command) {

            case 'clear_monster':
                this.clearMonster();
                return 'Monster cleared.';

            case 'create_body': {
                this.clearMonster();
                const { color, shape } = params;
                const key = `body_${color}${shape}`;
                if (!this.textures.exists(key)) {
                    return `Error: no body texture for color=${color}, shape=${shape}.`;
                }
                this.monster.body = this.add.image(CENTER_X, CENTER_Y, key);
                this.monsterMeta.body = { color, shape };
                return `Created a ${color} type-${shape} body.`;
            }

            case 'add_arms': {
                if (!this.monster.body) return 'Error: no body exists yet. Call create_body first.';
                if (this.monster.arms) this.monster.arms.forEach(a => a.destroy());

                const { color, shape } = params; // assignment calls this "pose"; parts.js calls it "shape" (A-E) — same thing
                const key = `arm_${color}${shape}`;
                if (!this.textures.exists(key)) {
                    return `Error: no arm texture for color=${color}, shape=${shape}.`;
                }

                const off = PARTS.arm.offset; // { x: 90, y: 10 }
                const rightArm = this.add.image(CENTER_X + off.x, CENTER_Y + off.y, key);
                const leftArm = this.add
                    .image(CENTER_X - off.x, CENTER_Y + off.y, key)
                    .setFlipX(true);

                // If the flipped arm looks off-center, the shoulder isn't
                // at the source image's origin — tune origin instead:
                // leftArm.setOrigin(1 - rightArm.originX, rightArm.originY);

                this.monster.arms = [leftArm, rightArm];
                this.monsterMeta.arms = { color, shape };
                return `Added a mirrored pair of ${color} arms.`;
            }

            case 'add_legs': {
                if (!this.monster.body) return 'Error: no body exists yet. Call create_body first.';
                if (this.monster.legs) this.monster.legs.forEach(l => l.destroy());

                const { color, shape } = params;
                const key = `leg_${color}${shape}`;
                if (!this.textures.exists(key)) {
                    return `Error: no leg texture for color=${color}, shape=${shape}. (Check that parts.js has real leg colors/shapes and preload() was updated to match.)`;
                }

                const off = PARTS.leg.offset; // { x: 45, y: 100 }
                const rightLeg = this.add.image(CENTER_X + off.x, CENTER_Y + off.y, key);
                const leftLeg = this.add
                    .image(CENTER_X - off.x, CENTER_Y + off.y, key)
                    .setFlipX(true);

                this.monster.legs = [leftLeg, rightLeg];
                this.monsterMeta.legs = { color, shape };
                return `Added a mirrored pair of ${color} legs.`;
            }

            case 'add_eyes': {
                if (!this.monster.body) return 'Error: no body exists yet. Call create_body first.';
                if (this.monster.eyes) this.monster.eyes.forEach(e => e.destroy());

                const { count, style } = params;
                const key = `eye_${style}`;
                if (!this.textures.exists(key)) {
                    return `Error: no eye texture for style=${style}.`;
                }

                const off = PARTS.eye.offset;       // { x: 0, y: -30 }
                const spacing = PARTS.eye.spacing;  // 40
                const n = Math.max(1, Math.min(count, 5));
                const eyes = [];

                if (n === 1) {
                    eyes.push(this.add.image(CENTER_X + off.x, CENTER_Y + off.y, key));
                } else {
                    const startX = CENTER_X + off.x - (spacing * (n - 1)) / 2;
                    for (let i = 0; i < n; i++) {
                        eyes.push(this.add.image(startX + i * spacing, CENTER_Y + off.y, key));
                    }
                }

                this.monster.eyes = eyes;
                this.monsterMeta.eyes = { count: n, style };
                return `Added ${n} ${style} eye${n > 1 ? 's' : ''}.`;
            }

            case 'add_mouth': {
                if (!this.monster.body) return 'Error: no body exists yet. Call create_body first.';
                if (this.monster.mouth) this.monster.mouth.destroy();

                const { style } = params; // expected to be a letter, e.g. "A".."J"
                const key = `mouth${style}`; // NOTE: no underscore
                if (!this.textures.exists(key)) {
                    return `Error: no mouth texture for style=${style}.`;
                }

                const off = PARTS.mouth.offset; // { x: 0, y: 30 }
                this.monster.mouth = this.add.image(CENTER_X + off.x, CENTER_Y + off.y, key);
                this.monsterMeta.mouth = { style };
                return `Added a mouth (style ${style}).`;
            }

            case 'add_antennas': {
                if (!this.monster.body) return 'Error: no body exists yet. Call create_body first.';
                if (this.monster.antennas) this.monster.antennas.forEach(a => a.destroy());

                const { count } = params;
                // Fallbacks — CONFIRM against your index.js add_antennas schema.
                const color = params.color || 'blue';
                const size = params.size || 'small';
                const key = `detail_${color}_antenna_${size}`;
                if (!this.textures.exists(key)) {
                    return `Error: no antenna texture for color=${color}, size=${size}.`;
                }

                const off = PARTS.antenna.offset;       // { x: 0, y: -95 }
                const spacing = PARTS.antenna.spacing;  // 50
                const n = Math.max(1, Math.min(count, 4));
                const antennas = [];

                if (n === 1) {
                    antennas.push(this.add.image(CENTER_X + off.x, CENTER_Y + off.y, key));
                } else {
                    const startX = CENTER_X + off.x - (spacing * (n - 1)) / 2;
                    for (let i = 0; i < n; i++) {
                        antennas.push(this.add.image(startX + i * spacing, CENTER_Y + off.y, key));
                    }
                }

                this.monster.antennas = antennas;
                this.monsterMeta.antennas = { count: n, color, size };
                return `Added ${n} antenna${n > 1 ? 's' : ''}.`;
            }

            case 'get_monster_state': {
                if (!this.monster.body) {
                    return JSON.stringify({ empty: true, message: 'No monster built yet.' });
                }
                return JSON.stringify(this.monsterMeta);
            }

            case 'build_monster': {
                // Expected params shape:
                // {
                //   body: { color, shape },
                //   eyes: { count, style },
                //   mouth: { style },
                //   arms: { color, shape },
                //   legs: { color, shape },
                //   antennas: { count, color, size }
                // }
                const results = [];

                if (params.body) {
                    results.push(this.executeCommand('create_body', params.body));
                } else {
                    this.clearMonster();
                    results.push('No body spec provided — cleared stage.');
                }

                if (params.eyes) results.push(this.executeCommand('add_eyes', params.eyes));
                if (params.mouth) results.push(this.executeCommand('add_mouth', params.mouth));
                if (params.arms) results.push(this.executeCommand('add_arms', params.arms));
                if (params.legs) results.push(this.executeCommand('add_legs', params.legs));
                if (params.antennas) results.push(this.executeCommand('add_antennas', params.antennas));

                return `Built monster:\n${results.join('\n')}`;
            }

            default:
                return `Unknown command: ${command}`;
        }
    }
}