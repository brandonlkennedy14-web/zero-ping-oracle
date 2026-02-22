/**
 * 0-PING ORACLE: 100M SPRINT ENGINE
 * Manages the deterministic race state, physics, and win conditions.
 */

const FINISH_LINE_DISTANCE = 10000; // The 100m mark in internal game units

class SprintGame {
    constructor(netcodeEngine) {
        this.netcode = netcodeEngine;
        this.isActive = false;
        
        // Deterministic Game State
        this.state = {
            frame: 0,
            p1: { x: 50, v: 0, nextFoot: 'L', color: '#0ff' },
            p2: { x: 50, v: 0, nextFoot: 'L', color: '#ff0055' },
            winner: null
        };

        // Physics Constants
        this.BOOST = 12;
        this.FRICTION = 0.94;
        this.STUMBLE_PENALTY = 0.2;
    }

    startMatch() {
        this.isActive = true;
        this.state.frame = this.netcode.getSyncedFrame();
        console.log("[GAME] 100m Sprint Started!");
    }

    // Process a verified input from either player
    processInput(playerKey, action) {
        let p = this.state[playerKey];

        if (action === 'L' || action === 'R') {
            if (action === p.nextFoot) {
                // Perfect alternating step
                p.v += this.BOOST;
                p.nextFoot = (action === 'L') ? 'R' : 'L';
            } else {
                // Stumble (hit the same foot twice)
                p.v *= this.STUMBLE_PENALTY;
            }
        }
    }

    // Step the simulation forward one deterministic frame
    step() {
        if (!this.isActive) return;

        this.state.frame++;

        // Apply friction and velocity
        this.state.p1.v *= this.FRICTION;
        this.state.p1.x += this.state.p1.v;

        this.state.p2.v *= this.FRICTION;
        this.state.p2.x += this.state.p2.v;

        this.checkWinCondition();
    }

    checkWinCondition() {
        let p1Finished = this.state.p1.x >= FINISH_LINE_DISTANCE;
        let p2Finished = this.state.p2.x >= FINISH_LINE_DISTANCE;

        if (p1Finished || p2Finished) {
            this.isActive = false;
            if (p1Finished && p2Finished) {
                // Extremely rare tie, fallback to highest velocity at the line
                this.state.winner = this.state.p1.v > this.state.p2.v ? 'p1' : 'p2';
            } else {
                this.state.winner = p1Finished ? 'p1' : 'p2';
            }
            this.triggerEndGame();
        }
    }

    triggerEndGame() {
        console.log(`[GAME] Match Concluded! Winner: ${this.state.winner}`);
        // Here we would package the final state and trigger the Oracle signature for the smart contract.
        
        // Show support link upon match completion
        const lobby = document.getElementById('lobby-ui');
        lobby.style.display = 'flex';
        lobby.innerHTML = `
            <div class="title" style="color: #0f0;">RACE FINISHED</div>
            <p>WINNER: ${this.state.winner.toUpperCase()}</p>
            <br>
            <p style="font-size: 10px; color: #aaa;">Support the Oracle Node:</p>
            <a href="https://buymeacoffee.com/brandonkennedy" target="_blank" class="btn-lobby" style="text-decoration: none; display: inline-block; border-color: #ffcc00; color: #ffcc00;">BUY ME A COFFEE ☕</a>
            <br><br>
            <button class="btn-lobby" onclick="location.reload()">PLAY AGAIN</button>
        `;
        document.getElementById('game-ui').style.display = 'none';
    }
}