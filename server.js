const WebSocket = require('ws');
const crypto = require('crypto');

const wss = new WebSocket.Server({ port: process.env.PORT || 8080 });
const rooms = {};

console.log("[ORACLE] Deterministic State Server is LIVE on port 8080");

wss.on('connection', (ws) => {
    ws.on('message', (message) => {
        const data = JSON.parse(message);

        // 1. MATCHMAKING: CREATE ROOM
        if (data.type === 'CREATE') {
            const roomCode = crypto.randomBytes(2).toString('hex').toUpperCase();
            rooms[roomCode] = { p1: ws, p2: null, p1Ping: 0, p2Ping: 0, status: 'WAITING' };
            ws.room = roomCode;
            ws.role = 'p1';
            ws.send(JSON.stringify({ type: 'ROOM_CREATED', code: roomCode }));
            console.log(`[ORACLE] Room Created: ${roomCode}`);
        }

        // 2. MATCHMAKING: JOIN ROOM
        if (data.type === 'JOIN') {
            const room = rooms[data.code];
            if (room && room.status === 'WAITING') {
                room.p2 = ws;
                ws.room = data.code;
                ws.role = 'p2';
                room.status = 'HANDSHAKE';
                
                console.log(`[ORACLE] Match ${data.code} Initiating Handshake...`);
                // Notify both players to begin the ping test
                room.p1.send(JSON.stringify({ type: 'START_PING_TEST' }));
                room.p2.send(JSON.stringify({ type: 'START_PING_TEST' }));
            } else {
                ws.send(JSON.stringify({ type: 'ERROR', msg: 'Room not found or full.' }));
            }
        }

        // 3. THE ORACLE HANDSHAKE (Ping Calculation)
        if (data.type === 'PING_ECHO') {
            // The client sends back the exact timestamp we sent them
            const rtt = Date.now() - data.serverTime;
            const room = rooms[ws.room];
            
            if (ws.role === 'p1') room.p1Ping = rtt;
            if (ws.role === 'p2') room.p2Ping = rtt;

            // Once both pings are calculated, deploy the game!
            if (room.p1Ping > 0 && room.p2Ping > 0 && room.status === 'HANDSHAKE') {
                room.status = 'PLAYING';
                console.log(`[ORACLE] Match ${ws.room} LIVE. P1: ${room.p1Ping}ms | P2: ${room.p2Ping}ms`);
                
                const startMsg = JSON.stringify({
                    type: 'MATCH_START',
                    p1Ping: room.p1Ping,
                    p2Ping: room.p2Ping
                });
                room.p1.send(startMsg);
                room.p2.send(startMsg);
            }
        }

        // 4. IN-GAME DETERMINISTIC ROUTING
        if (data.type === 'INPUT') {
            const room = rooms[ws.room];
            if(!room || room.status !== 'PLAYING') return;

            // Instantly route the signed frame to the opponent for local rollback processing
            const opponent = (ws.role === 'p1') ? room.p2 : room.p1;
            opponent.send(JSON.stringify({
                type: 'OPPONENT_INPUT',
                action: data.action,
                frame: data.frame,
                hash: data.hash
            }));
        }
    });

    ws.on('close', () => {
        if (ws.room && rooms[ws.room]) {
            const room = rooms[ws.room];
            // Find the guy who didn't disconnect
            const opponent = (ws.role === 'p1') ? room.p2 : room.p1;
            
            // Tell them they won by default
            if (opponent && opponent.readyState === WebSocket.OPEN) {
                opponent.send(JSON.stringify({ type: 'FORFEIT', msg: 'Opponent disconnected. YOU WIN.' }));
            }
            
            console.log(`[ORACLE] Match ${ws.room} Terminated. Player dropped.`);
            delete rooms[ws.room]; 
        }
    });