const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

app.use(express.static('public'));

// Configuración del juego
const rooms = {};
const MAX_PLAYERS_PER_ROOM = 4;
const ROUND_DURATION = 180000;
const ELITE_ROUND_INTERVAL = 5;
const POWERUP_TYPES = ['DoublePoints', 'InstaKill', 'ExtraPoints'];
const POWERUP_DURATION = 30000;
const POWERUP_DESPAWN_TIME = 10000;
const REVIVE_TIME = 5000;
const GRENADE_DAMAGE = 50;
const GRENADE_RADIUS = 100;
const GRENADE_DELAY = 5000;
const GRENADE_COOLDOWN = 25000;
const HEALTH_REGEN_INTERVAL = 10000;
const HEALTH_REGEN_AMOUNT = 1;
const MAX_QUICK_REVIVE = 3;
const GRID_SIZE = 100;
const MAP_WIDTH = 910;
const MAP_HEIGHT = 705;

class ZombiePool {
    constructor() {
        this.pool = [];
        this.active = 0;
    }
    
    getZombie() {
        if (this.pool.length > this.active) {
            return this.pool[this.active++];
        } else {
            const z = {
                x: 0, y: 0, hp: 0, speed: 0, damage: 0,
                type: 'normal', id: 0, specialCooldown: 0,
                isElite: false, isBoss: false
            };
            this.pool.push(z);
            this.active++;
            return z;
        }
    }
    
    reset() {
        this.active = 0;
    }
}

const zombiePool = new ZombiePool();

// Funciones del juego
function createCollisionGrid() {
    const grid = {};
    for (let x = 0; x < MAP_WIDTH; x += GRID_SIZE) {
        for (let y = 0; y < MAP_HEIGHT; y += GRID_SIZE) {
            const key = `${Math.floor(x/GRID_SIZE)}_${Math.floor(y/GRID_SIZE)}`;
            grid[key] = { zombies: [], players: [] };
        }
    }
    return grid;
}

function updateCollisionGrid(room) {
    const grid = createCollisionGrid();
    
    room.zombies.forEach(z => {
        const key = `${Math.floor(z.x/GRID_SIZE)}_${Math.floor(z.y/GRID_SIZE)}`;
        if (grid[key]) grid[key].zombies.push(z);
    });
    
    Object.values(room.players).forEach(p => {
        if (p.hp > 0 && !p.isDowned) {
            const key = `${Math.floor(p.x/GRID_SIZE)}_${Math.floor(p.y/GRID_SIZE)}`;
            if (grid[key]) grid[key].players.push(p);
        }
    });
    
    return grid;
}

function getMaxZombiesForRound(round) {
    return Math.min(100, 10 + Math.floor(round * 1.2));
}

function getZombieSpawnChance(round) {
    return Math.min(0.08, 0.01 + (round * 0.0008));
}

function getZombieHealth(round, zombieType) {
    const baseHealth = 20 + (round * 4);
    let multiplier = 1;
    
    switch(zombieType) {
        case 'rusher': multiplier = 0.7; break;
        case 'tank': multiplier = 2.5; break;
        case 'explosive': multiplier = 0.8; break;
        case 'elite': multiplier = 2.5; break;
        case 'boss': multiplier = 4.0; break;
    }
    
    return Math.floor(baseHealth * multiplier);
}

function getZombieSpeed(round, zombieType) {
    let baseSpeed = 0.5 + (round * 0.006);
    
    switch(zombieType) {
        case 'rusher': baseSpeed *= 1.8; break;
        case 'tank': baseSpeed *= 0.7; break;
        case 'elite': baseSpeed *= 1.2; break;
    }
    
    return baseSpeed;
}

function getZombieDamage(round, zombieType) {
    let baseDamage = 4 + (round * 0.4);
    
    switch(zombieType) {
        case 'tank': baseDamage *= 1.3; break;
        case 'elite': baseDamage *= 1.4; break;
        case 'boss': baseDamage *= 1.6; break;
    }
    
    return zombieType === 'boss' ? Math.min(25, baseDamage) : 
           zombieType === 'elite' ? Math.min(18, baseDamage) : 
           Math.min(12, baseDamage);
}

function generateZombies(room) {
    if (room.zombies.length >= getMaxZombiesForRound(room.round)) return;

    const roll = Math.random();
    let zombieType = 'normal';
    
    // Elite rounds (cada 5 rondas)
    if (room.isEliteRound) {
        if (roll < 0.6) {  // 60% de chance de zombie élite en ronda élite
            zombieType = 'elite';
            // Boss rounds (cada 10 rondas)
            if (room.round >= 10 && room.round % 10 === 0 && roll < 0.3) {
                zombieType = 'boss';
            }
        }
    } 
    // Rondas normales
    else if (room.round > 5) {
        if (roll < 0.15) { // 15% de chance de zombie especial
            const specialRoll = Math.random();
            if (specialRoll < 0.4) zombieType = 'rusher';
            else if (specialRoll < 0.7) zombieType = 'tank';
            else zombieType = 'explosive';
        }
    }

    const z = zombiePool.getZombie();
    Object.assign(z, {
        x: Math.random() * MAP_WIDTH,
        y: Math.random() * MAP_HEIGHT,
        hp: getZombieHealth(room.round, zombieType),
        speed: getZombieSpeed(room.round, zombieType),
        damage: getZombieDamage(room.round, zombieType),
        type: zombieType,
        id: Date.now() + Math.random(),
        specialCooldown: 0,
        isElite: zombieType === 'elite',
        isBoss: zombieType === 'boss'
    });

    room.zombies.push(z);
}

function updateZombies(room) {
    const grid = updateCollisionGrid(room);
    
    room.zombies.forEach(z => {
        const zombieSize = z.isBoss ? 24 : z.isElite ? 20 : 16;
        
        // Buscar jugador más cercano
        let closestPlayer = null;
        let minDist = Infinity;
        
        for (const id in room.players) {
            const player = room.players[id];
            if (player.hp > 0 && !player.isDowned) {
                const dist = Math.sqrt(Math.pow(z.x - player.x, 2) + Math.pow(z.y - player.y, 2));
                if (dist < minDist) {
                    minDist = dist;
                    closestPlayer = player;
                }
            }
        }
        
        if (closestPlayer) {
            const dx = closestPlayer.x - z.x;
            const dy = closestPlayer.y - z.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            
            // Aplicar modificador de velocidad por bloodrain
            let speed = z.speed;
            if (room.weatherEvent === 'bloodrain') {
                speed *= 1.3;
            }
            
            // Normalizar y mover hacia el jugador
            if (dist > 0) {
                z.x += (dx / dist) * speed;
                z.y += (dy / dist) * speed;
            }
            
            // Verificar colisión con jugadores
            if (dist < zombieSize + 16) { // Radio del jugador + radio del zombie
                if (Date.now() > closestPlayer.invulnerableUntil) {
                    let damage = z.damage;
                    // Aplicar modificador de daño por bloodrain
                    if (room.weatherEvent === 'bloodrain' && room.weatherEffects.zombieDamageBoost) {
                        damage *= room.weatherEffects.zombieDamageBoost;
                    }
                    
                    closestPlayer.hp = Math.max(0, closestPlayer.hp - damage);
                    closestPlayer.lastHitTime = Date.now();
                    closestPlayer.invulnerableUntil = Date.now() + 1000;
                    
                    io.to(closestPlayer.id).emit('playerHit', { damage: damage, currentHp: closestPlayer.hp });
                    
                    if (closestPlayer.hp <= 0) {
                        if (closestPlayer.buffs?.QuickRevive) {
                            closestPlayer.isDowned = true;
                            closestPlayer.downedTime = Date.now();
                            delete closestPlayer.buffs.QuickRevive;
                            io.to(room.id).emit('buffDisabled', { buffType: 'Quick Revive' });
                            io.to(room.id).emit('playerDowned', { 
                                playerId: closestPlayer.id,
                                downedTime: closestPlayer.downedTime
                            });
                        } else {
                            closestPlayer.score = Math.max(0, closestPlayer.score - 5);
                            closestPlayer.buffs = {};
                            closestPlayer.isDowned = false;
                            io.to(room.id).emit('playerRespawned', { 
                                playerId: closestPlayer.id,
                                buffsCleared: true
                            });
                            io.to(room.id).emit('showDeathScreen', {
                                playerId: closestPlayer.id,
                                round: room.round,
                                zombiesKilled: closestPlayer.zombiesKilled ? 
                                    (closestPlayer.zombiesKilled.normal + closestPlayer.zombiesKilled.elite + closestPlayer.zombiesKilled.boss) : 0,
                                score: closestPlayer.score
                            });
                        }
                    }
                }
            }
        } else {
            // Movimiento aleatorio si no hay jugadores cercanos
            z.x += (Math.random() - 0.5) * 0.3;
            z.y += (Math.random() - 0.5) * 0.3;
        }
        
        // Mantener dentro de los límites del mapa
        z.x = Math.max(16, Math.min(MAP_WIDTH - 16, z.x));
        z.y = Math.max(16, Math.min(MAP_HEIGHT - 16, z.y));
    });
}

function checkHealthRegeneration(room) {
    const currentTime = Date.now();
    for (const playerId in room.players) {
        const player = room.players[playerId];
        if (player.hp > 0 && !player.isDowned && 
            player.hp < player.maxHp && 
            currentTime - player.lastHitTime > HEALTH_REGEN_INTERVAL) {
            
            if (currentTime - player.lastRegenTick > 1000) {
                player.hp = Math.min(player.maxHp, player.hp + HEALTH_REGEN_AMOUNT);
                player.lastRegenTick = currentTime;
                io.to(playerId).emit('healthRegen', { 
                    amount: HEALTH_REGEN_AMOUNT, 
                    currentHp: player.hp 
                });
            }
        }
    }
}

function startWeatherEvent(room) {
    if (Math.random() > 0.15) return; // 15% de probabilidad por ronda
    
    const events = [
        { type: 'sandstorm', effect: { speedModifier: 0.7 } },
        { type: 'fog', effect: { visionReduction: 0.5 } },
        { type: 'bloodrain', effect: { zombieSpeedBoost: 1.3, zombieDamageBoost: 1.2 } }
    ];
    
    const event = events[Math.floor(Math.random() * events.length)];
    room.weatherEvent = event.type;
    room.weatherEffects = event.effect;
    room.weatherEndTime = Date.now() + 30000;
    
    io.to(room.id).emit('weatherEvent', {
        type: event.type,
        duration: 30000,
        effect: event.effect
    });
}

function advanceRound(room) {
    zombiePool.reset();
    room.round++;
    room.roundStartTime = Date.now();
    room.isEliteRound = (room.round % ELITE_ROUND_INTERVAL === 0);
    room.zombies = [];
    room.powerups = [];
    room.grenades = [];
    room.weatherEvent = null;
    room.weatherEffects = {};
    
    if (room.round > 100) {
        room.gameActive = false;
        io.to(room.id).emit('gameOver', { victory: true });
        return;
    }
    
    if (room.round % 10 === 0) {
        for (const playerId in room.players) {
            room.players[playerId].maxHp = 100 + Math.floor(room.round / 10) * 20;
            room.players[playerId].hp = room.players[playerId].maxHp;
        }
    }
    
    io.to(room.id).emit('roundStart', {
        round: room.round,
        isEliteRound: room.isEliteRound
    });
}

function updateBullets(room) {
    for (let i = room.bullets.length - 1; i >= 0; i--) {
        const b = room.bullets[i];
        
        // Aplicar efecto de niebla en precisión
        let accuracyModifier = 1;
        if (room.weatherEvent === 'fog') {
            accuracyModifier = 0.8;
        }
        
        b.x += Math.cos(b.angle) * 5 * accuracyModifier;
        b.y += Math.sin(b.angle) * 5 * accuracyModifier;

        if (b.x < 0 || b.x > MAP_WIDTH || b.y < 0 || b.y > MAP_HEIGHT) {
            room.bullets.splice(i, 1);
            continue;
        }

        for (let j = room.zombies.length - 1; j >= 0; j--) {
            const z = room.zombies[j];
            const zombieSize = z.isBoss ? 24 : z.isElite ? 20 : 16;
            const dist = Math.sqrt(Math.pow(b.x - z.x, 2) + Math.pow(b.y - z.y, 2));

            if (dist < zombieSize) {
                const player = room.players[b.owner];
                if (!player || player.isDowned) {
                    room.bullets.splice(i, 1);
                    continue;
                }

                let damage = 2;
                if (player.activePowerups?.InstaKill && !z.isBoss && !z.isElite) {
                    damage = z.hp;
                } else {
                    if (player.buffs?.DoubleTap) damage += 1;
                    const roundScaling = Math.min(5, Math.floor(room.round / 10));
                    damage += roundScaling;
                    if (z.isElite) damage += 1;
                }

                z.hp -= damage;
                room.bullets.splice(i, 1);

                if (z.hp <= 0) {
                    generatePowerup(room, z.x, z.y);
                    room.zombies.splice(j, 1);
                    if (player.hp > 0 && !player.isDowned) {
                        const basePoints = z.isBoss ? 50 : z.isElite ? 20 : 10;
                        const pointsMultiplier = player.activePowerups?.DoublePoints ? 2 : 1;
                        const points = basePoints * pointsMultiplier;
                        player.score += points;
                        
                        // Actualizar contador de zombies eliminados
                        if (!player.zombiesKilled) player.zombiesKilled = { normal: 0, elite: 0, boss: 0 };
                        if (z.isBoss) player.zombiesKilled.boss++;
                        else if (z.isElite) player.zombiesKilled.elite++;
                        else player.zombiesKilled.normal++;
                        
                        io.to(room.id).emit('zombieKilled', {
                            playerId: b.owner,
                            isElite: z.isElite,
                            isBoss: z.isBoss,
                            points: points
                        });
                    }
                }
                break;
            }
        }
    }
}

function updateGrenades(room) {
    for (let i = room.grenades.length - 1; i >= 0; i--) {
        const g = room.grenades[i];
        if (Date.now() >= g.explodeTime) {
            for (let j = room.zombies.length - 1; j >= 0; j--) {
                const z = room.zombies[j];
                const dist = Math.sqrt(Math.pow(z.x - g.x, 2) + Math.pow(z.y - g.y, 2));
                
                if (dist < GRENADE_RADIUS) {
                    z.hp -= GRENADE_DAMAGE * (z.isBoss ? 0.7 : z.isElite ? 0.9 : 1);
                    if (z.hp <= 0) {
                        generatePowerup(room, z.x, z.y);
                        room.zombies.splice(j, 1);
                        
                        const player = room.players[g.owner];
                        if (player && player.hp > 0 && !player.isDowned) {
                            const basePoints = z.isBoss ? 50 : z.isElite ? 20 : 10;
                            const pointsMultiplier = player.activePowerups?.DoublePoints ? 2 : 1;
                            const points = basePoints * pointsMultiplier;
                            player.score += points;
                            
                            // Actualizar contador de zombies eliminados
                            if (!player.zombiesKilled) player.zombiesKilled = { normal: 0, elite: 0, boss: 0 };
                            if (z.isBoss) player.zombiesKilled.boss++;
                            else if (z.isElite) player.zombiesKilled.elite++;
                            else player.zombiesKilled.normal++;
                            
                            io.to(room.id).emit('zombieKilled', {
                                playerId: g.owner,
                                isElite: z.isElite,
                                isBoss: z.isBoss,
                                points: points
                            });
                        }
                    }
                }
            }
            
            for (const playerId in room.players) {
                const p = room.players[playerId];
                if (p.hp > 0 && !p.isDowned && !p.buffs?.PhDFlopper) {
                    const dist = Math.sqrt(Math.pow(p.x - g.x, 2) + Math.pow(p.y - g.y, 2));
                    
                    if (dist < GRENADE_RADIUS && Date.now() > p.invulnerableUntil) {
                        p.hp = Math.max(0, Math.floor(p.hp - GRENADE_DAMAGE * 0.5));
                        p.invulnerableUntil = Date.now() + 1000;
                        p.lastHitTime = Date.now();
                        
                        if (p.hp <= 0) {
                            if (p.buffs?.QuickRevive) {
                                p.isDowned = true;
                                p.downedTime = Date.now();
                                delete p.buffs.QuickRevive;
                                io.to(room.id).emit('buffDisabled', { 
                                    buffType: 'Quick Revive' 
                                });
                                io.to(room.id).emit('playerDowned', { 
                                    playerId: playerId,
                                    downedTime: p.downedTime
                                });
                            } else {
                                p.score = Math.max(0, p.score - 5);
                                p.buffs = {};
                                p.isDowned = false;
                                io.to(room.id).emit('playerRespawned', { 
                                    playerId: playerId,
                                    buffsCleared: true
                                });
                                io.to(room.id).emit('showDeathScreen', {
                                    playerId: playerId,
                                    round: room.round,
                                    zombiesKilled: p.zombiesKilled ? 
                                        (p.zombiesKilled.normal + p.zombiesKilled.elite + p.zombiesKilled.boss) : 0,
                                    score: p.score
                                });
                            }
                        }
                    }
                }
            }
            
            io.to(room.id).emit('grenadeExploded', {
                x: g.x,
                y: g.y,
                owner: g.owner
            });
            
            room.grenades.splice(i, 1);
        }
    }
}

function generatePowerup(room, x, y) {
    const roll = Math.random() * 100;
    
    let type;
    if (roll < 5) type = 'ExtraPoints';
    else if (roll < 7) type = 'DoublePoints';
    else if (roll < 9) type = 'InstaKill';
    else return;
    
    room.powerups.push({
        x: x,
        y: y,
        type: type,
        spawnTime: Date.now(),
        id: Date.now() + Math.random()
    });
}

function updatePowerups(room) {
    for (let i = room.powerups.length - 1; i >= 0; i--) {
        const p = room.powerups[i];
        
        if (Date.now() - p.spawnTime > POWERUP_DESPAWN_TIME) {
            room.powerups.splice(i, 1);
            continue;
        }
        
        for (const playerId in room.players) {
            const player = room.players[playerId];
            if (player.hp <= 0 || player.isDowned) continue;
            
            const dist = Math.sqrt(Math.pow(player.x - p.x, 2) + Math.pow(player.y - p.y, 2));
            if (dist < 20) {
                applyPowerup(room, playerId, p.type);
                room.powerups.splice(i, 1);
                break;
            }
        }
    }
}

function applyPowerup(room, playerId, type) {
    const player = room.players[playerId];
    if (!player) return;
    
    if (type === 'ExtraPoints') {
        player.score += 100;
        io.to(room.id).emit('powerupCollected', {
            playerId: playerId,
            powerupType: type,
            points: 100,
            position: { x: player.x, y: player.y }
        });
    } else {
        if (!player.activePowerups) player.activePowerups = {};
        player.activePowerups[type] = Date.now() + POWERUP_DURATION;
        
        setTimeout(() => {
            if (player.activePowerups && player.activePowerups[type]) {
                delete player.activePowerups[type];
                io.to(room.id).emit('powerupExpired', {
                    playerId: playerId,
                    powerupType: type
                });
            }
        }, POWERUP_DURATION);
        
        io.to(room.id).emit('powerupCollected', {
            playerId: playerId,
            powerupType: type,
            position: { x: player.x, y: player.y }
        });
    }
}

function checkRevives(room) {
    for (const id in room.players) {
        const player = room.players[id];
        if (player.isDowned && Date.now() - player.downedTime > REVIVE_TIME) {
            player.isDowned = false;
            player.hp = player.maxHp;
            player.invulnerableUntil = Date.now() + 3000;
            io.to(room.id).emit('playerRevived', { playerId: id });
        }
    }
}

// Manejo de conexiones Socket.IO
io.on('connection', socket => {
    console.log('Nuevo jugador conectado:', socket.id);
    
    socket.on('setName', name => {
        socket.playerName = name.substring(0, 15);
    });

    socket.on('createRoom', ({name, character}) => {
        const roomId = generateRoomId();
        rooms[roomId] = {
            id: roomId,
            name: name,
            maxPlayers: MAX_PLAYERS_PER_ROOM,
            players: {},
            bullets: [],
            zombies: [],
            powerups: [],
            grenades: [],
            round: 1,
            roundStartTime: Date.now(),
            isEliteRound: false,
            gameActive: true,
            weatherEvent: null,
            weatherEffects: {},
            weatherEndTime: 0
        };
        
        joinRoom(socket, roomId, character);
        socket.emit('startGame', rooms[roomId]);
    });

    socket.on('getRooms', () => {
        const roomList = Object.values(rooms).map(room => ({
            id: room.id,
            name: room.name,
            players: Object.keys(room.players).length,
            maxPlayers: room.maxPlayers,
            round: room.round
        }));
        socket.emit('roomList', roomList);
    });

    socket.on('joinRoom', ({roomId, character}) => {
        const room = rooms[roomId];
        if (room && Object.keys(room.players).length < room.maxPlayers) {
            joinRoom(socket, roomId, character);
            io.to(roomId).emit('startGame', room);
        } else {
            socket.emit('roomFull');
        }
    });

    socket.on('move', dir => {
        if (!socket.roomId || !rooms[socket.roomId]) return;
        
        const p = rooms[socket.roomId].players[socket.id];
        if (p && p.hp > 0 && !p.isDowned) {
            let speedModifier = 1;
            if (rooms[socket.roomId].weatherEvent === 'sandstorm') {
                speedModifier = 0.7;
            }
            
            const speed = (p.buffs?.StaminUp ? 3 : 2) * speedModifier;
            
            if (dir === 'left') p.x = Math.max(16, p.x - speed);
            if (dir === 'right') p.x = Math.min(MAP_WIDTH - 16, p.x + speed);
            if (dir === 'up') p.y = Math.max(16, p.y - speed);
            if (dir === 'down') p.y = Math.min(MAP_HEIGHT - 16, p.y + speed);
        }
    });

    socket.on('shootBullet', bullet => {
        if (!socket.roomId || !rooms[socket.roomId]) return;
        
        const player = rooms[socket.roomId].players[socket.id];
        if (player && player.hp > 0 && !player.isDowned) {
            rooms[socket.roomId].bullets.push({
                ...bullet,
                id: Date.now() + Math.random()
            });
            
            if (player.buffs?.DoubleTap) {
                rooms[socket.roomId].bullets.push({
                    ...bullet,
                    angle: bullet.angle + (Math.random() * 0.2 - 0.1),
                    id: Date.now() + Math.random() + 1
                });
            }
        }
    });

    socket.on('throwGrenade', ({x, y}) => {
        if (!socket.roomId || !rooms[socket.roomId]) return;
        
        const player = rooms[socket.roomId].players[socket.id];
        const currentTime = Date.now();
        
        if (player && player.hp > 0 && !player.isDowned && 
            currentTime - (player.lastGrenadeTime || 0) >= GRENADE_COOLDOWN) {
            
            player.lastGrenadeTime = currentTime;
            
            rooms[socket.roomId].grenades.push({
                x: x,
                y: y,
                owner: socket.id,
                explodeTime: currentTime + GRENADE_DELAY,
                throwTime: currentTime
            });
            
            io.to(socket.roomId).emit('grenadeThrown', {
                x: x,
                y: y,
                owner: socket.id,
                cooldown: GRENADE_COOLDOWN
            });
        }
    });

    socket.on('purchaseBuff', ({buffType, price}) => {
        if (!socket.roomId || !rooms[socket.roomId]) return;
        
        const player = rooms[socket.roomId].players[socket.id];
        if (!player || player.score < price || player.isDowned) return;

        if (buffType === 'Quick Revive' && (player.quickRevivePurchases || 0) >= MAX_QUICK_REVIVE) {
            return;
        }

        if (
            buffType === 'Quick Revive' &&
            (
                (player.quickRevivePurchases || 0) >= MAX_QUICK_REVIVE ||
                player.buffs?.QuickRevive // <-- Esto bloquea la compra si ya tiene el buff activo
            )
        ) {
            return;
        }        

        player.score -= price;
        
        if (!player.buffs) player.buffs = {};
        
        switch(buffType) {
            case 'Juggernog':
                player.maxHp = 200;
                player.hp = 200;
                player.buffs.Juggernog = true;
                break;
            case 'Double Tap':
                player.buffs.DoubleTap = true;
                break;
            case 'Quick Revive':
                player.quickRevivePurchases = (player.quickRevivePurchases || 0) + 1;
                if (player.quickRevivePurchases >= MAX_QUICK_REVIVE) {
                    socket.emit('buffDisabled', { buffType: 'Quick Revive' });
                }
                player.buffs.QuickRevive = true;
                break;
            case 'PhD Flopper':
                player.buffs.PhDFlopper = true;
                break;
            case 'Stamin-Up':
                player.buffs.StaminUp = true;
                break;
        }

        io.to(socket.roomId).emit('buffPurchased', {
            playerId: socket.id,
            buffType: buffType
        });
    });

    socket.on('addScore', ({playerId, amount}) => {
        if (!socket.roomId || !rooms[socket.roomId]) return;
        
        const player = rooms[socket.roomId].players[playerId];
        if (player) {
            player.score += amount;
        }
    });

    socket.on('revivePlayer', () => {
        if (!socket.roomId || !rooms[socket.roomId]) return;
        
        const player = rooms[socket.roomId].players[socket.id];
        if (player && player.isDowned) {
            player.isDowned = false;
            player.hp = player.maxHp;
            player.invulnerableUntil = Date.now() + 3000;
            
            io.to(socket.roomId).emit('playerRevived', {
                playerId: socket.id
            });
        }
    });

    socket.on('resetPlayer', () => {
        if (!socket.roomId || !rooms[socket.roomId]) return;
        
        const p = rooms[socket.roomId].players[socket.id];
        if (p) {
            p.hp = p.maxHp;
            p.x = Math.max(50, Math.min(MAP_WIDTH - 50, Math.random() * (MAP_WIDTH - 100) + 50));
            p.y = Math.max(50, Math.min(MAP_HEIGHT - 50, Math.random() * (MAP_HEIGHT - 100) + 50));
            p.buffs = {};
            p.maxHp = 100;
            p.isDowned = false;
            p.lastHitTime = Date.now();
            p.quickRevivePurchases = 0;
            io.to(socket.roomId).emit('playerRespawned', { 
                playerId: socket.id,
                buffsCleared: true
            });
        }
    });

    socket.on('leaveRoom', () => {
        if (socket.roomId && rooms[socket.roomId]) {
            delete rooms[socket.roomId].players[socket.id];
            
            if (Object.keys(rooms[socket.roomId].players).length === 0) {
                delete rooms[socket.roomId];
            } else {
                io.to(socket.roomId).emit('playerDisconnected', { playerId: socket.id });
            }
        }
    });

    socket.on('disconnect', () => {
        console.log('Jugador desconectado:', socket.id);
        if (socket.roomId && rooms[socket.roomId]) {
            delete rooms[socket.roomId].players[socket.id];
            
            if (Object.keys(rooms[socket.roomId].players).length === 0) {
                delete rooms[socket.roomId];
            } else {
                io.to(socket.roomId).emit('playerDisconnected', { playerId: socket.id });
            }
        }
    });
});

function joinRoom(socket, roomId, character) {
    socket.join(roomId);
    socket.roomId = roomId;
    
    let x, y, validPosition;
    const minDistance = 100;
    
    do {
        validPosition = true;
        x = Math.max(50, Math.min(MAP_WIDTH - 50, Math.random() * (MAP_WIDTH - 100) + 50));
        y = Math.max(50, Math.min(MAP_HEIGHT - 50, Math.random() * (MAP_HEIGHT - 100) + 50));
        
        for (const playerId in rooms[roomId].players) {
            const p = rooms[roomId].players[playerId];
            const dx = x - p.x;
            const dy = y - p.y;
            if (Math.sqrt(dx * dx + dy * dy) < minDistance) {
                validPosition = false;
                break;
            }
        }
    } while (!validPosition && Object.keys(rooms[roomId].players).length > 0);
    
    rooms[roomId].players[socket.id] = {
        id: socket.id,
        x: x,
        y: y,
        hp: 100,
        maxHp: 100,
        score: 0,
        name: socket.playerName || "Jugador " + Math.floor(Math.random() * 1000),
        character: character || 'alien',
        invulnerableUntil: 0,
        lastHitTime: Date.now(),
        lastRegenTick: 0,
        isDowned: false,
        downedTime: 0,
        buffs: {},
        activePowerups: {},
        lastGrenadeTime: 0,
        quickRevivePurchases: 0,
        zombiesKilled: { normal: 0, elite: 0, boss: 0 }
    };
}

function generateRoomId() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// Game loop
setInterval(() => {
    for (const roomId in rooms) {
        const room = rooms[roomId];
        if (!room.gameActive) continue;

        const currentTime = Date.now();
        const elapsedTime = currentTime - room.roundStartTime;
        const timeRemaining = ROUND_DURATION - elapsedTime;

        if (!room.weatherEvent && Math.random() < 0.0003) {
            startWeatherEvent(room);
        }
        
        if (room.weatherEvent && currentTime > room.weatherEndTime) {
            room.weatherEvent = null;
            room.weatherEffects = {};
            io.to(roomId).emit('weatherEnd');
        }

        if (timeRemaining <= 0) {
            advanceRound(room);
            continue;
        }

        generateZombies(room);
        updateZombies(room);
        updateBullets(room);
        updatePowerups(room);
        updateGrenades(room);
        checkRevives(room);
        checkHealthRegeneration(room);

        io.to(roomId).emit('state', { 
            players: room.players, 
            bullets: room.bullets, 
            zombies: room.zombies,
            powerups: room.powerups,
            grenades: room.grenades,
            round: room.round,
            isEliteRound: room.isEliteRound,
            timeRemaining: Math.max(0, timeRemaining),
            weatherEvent: room.weatherEvent
        });
    }
}, 1000 / 60);

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Servidor corriendo en http://localhost:${PORT}`);
});