const socket = io();
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// Variables para el tamaño del canvas
let canvasWidth = 910;
let canvasHeight = 705;
let scaleFactor = 1;

// Variables globales
let players = {};
let zombies = [];
let bullets = [];
let powerups = [];
let grenades = [];
let myId = '';
let currentRoom = '';
let playerDirections = {};
let assetsLoaded = false;
let currentRound = 1;
let isEliteRound = false;
let roundTimeRemaining = 180000;
let gameActive = true;
const keysPressed = {};
let statsWindowVisible = false;
let totalZombiesKilled = { normal: 0, elite: 0, boss: 0 };
let activePowerups = {};
let floatingTexts = [];
let roundTransition = false;
let roundTransitionStart = 0;
const ROUND_TRANSITION_DURATION = 2000;
let isDowned = false;
let reviveProgress = 0;
let reviveInterval = null;
let grenadeMode = false;
let grenadeAvailable = true;
let grenadeCooldown = 0;
let quickRevivePurchases = 0;
let currentWeatherEvent = null;
let weatherEndTime = 0;
let weatherEffects = {};
let missions = [];
let completedMissions = [];
let showMissionTracker = true;
let selectedCharacter = '';
let showPurchasePrompt = false;
let currentMachine = null;
let mouseX = 0, mouseY = 0;

// Iconos de buffos
const buffIcons = {
    Juggernog: new Image(),
    'Double Tap': new Image(),
    'Quick Revive': new Image(),
    'PhD Flopper': new Image(),
    'Stamin-Up': new Image()
};
let buffIconsLoaded = false;

const buffDescriptions = {
    'Juggernog': 'Dobla tu vida máxima (200 HP)',
    'Double Tap': 'Disparas 2 balas simultáneas +1 daño por bala',
    'Quick Revive': 'Auto-revivir una vez al morir (Máx. 3)',
    'PhD Flopper': 'Inmunidad a daño por explosiones',
    'Stamin-Up': '+50% velocidad de movimiento'
};

// Sistema de partículas
class ParticleSystem {
    constructor() {
        this.particles = [];
    }
    
    addParticle(x, y, config = {}) {
        this.particles.push({
            x, y,
            color: config.color || '#FFFFFF',
            size: config.size || 5,
            velocity: config.velocity || { x: 0, y: 0 },
            lifetime: config.lifetime || 1000,
            startTime: Date.now(),
            gravity: config.gravity || 0.05,
            fade: config.fade !== false,
            shrink: config.shrink !== false,
            text: config.text || null
        });
    }
    
    update() {
        const now = Date.now();
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            const age = now - p.startTime;
            
            if (age > p.lifetime) {
                this.particles.splice(i, 1);
                continue;
            }
            
            p.x += p.velocity.x;
            p.y += p.velocity.y;
            p.velocity.y += p.gravity;
            
            if (p.shrink) {
                p.size = p.size * (1 - (age / p.lifetime));
            }
        }
    }
    
    render(ctx) {
        ctx.save();
        this.particles.forEach(p => {
            const progress = (Date.now() - p.startTime) / p.lifetime;
            ctx.globalAlpha = p.fade ? 1 - progress : 1;
            
            if (p.text) {
                ctx.fillStyle = p.color;
                ctx.font = `${p.size}px Arial`;
                ctx.textAlign = 'center';
                ctx.fillText(p.text, p.x, p.y);
            } else {
                ctx.fillStyle = p.color;
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
                ctx.fill();
            }
        });
        ctx.restore();
    }
}

const particleSystem = new ParticleSystem();

// Máquinas expendedoras
const vendingMachines = [
    { x: 100, y: 300, type: 'Juggernog', color: 'red', price: 2500, sprite: new Image() },
    { x: 100, y: 500, type: 'Double Tap', color: 'blue', price: 3500, sprite: new Image() },
    { x: 400, y: 500, type: 'Quick Revive', color: 'cyan', price: 500, sprite: new Image() },
    { x: 700, y: 300, type: 'PhD Flopper', color: 'orange', price: 1500, sprite: new Image() },
    { x: 700, y: 500, type: 'Stamin-Up', color: 'green', price: 2000, sprite: new Image() }
];

// Sonidos
const sounds = {
    shoot: new Audio('sounds/shoot.wav'),
    hit: new Audio('sounds/hit.wav'),
    zombie: new Audio('sounds/zombie.wav'),
    death: new Audio('sounds/death.wav'),
    eliteRound: new Audio('sounds/elite_round.wav'),
    victory: new Audio('sounds/victory.wav'),
    gameOver: new Audio('sounds/game_over.wav'),
    zombieElite: new Audio('sounds/zombie_elite.wav'),
    purchase: new Audio('sounds/purchase.wav'),
    revive: new Audio('sounds/revive.wav'),
    grenadeThrow: new Audio('sounds/grenade_throw.wav'),
    grenadeExplosion: new Audio('sounds/grenade_explosion.wav'),
    healthRegen: new Audio('sounds/health_regen.wav'),
    explosion: new Audio('sounds/explosion.wav'),
    sandstorm: new Audio('sounds/sandstorm.wav'),
    fog: new Audio('sounds/fog.wav'),
    bloodrain: new Audio('sounds/bloodrain.wav'),
    missionComplete: new Audio('sounds/mission_complete.wav')
};

// Configurar volumen inicial
Object.values(sounds).forEach(sound => {
    sound.volume = 0.5;
});

// Sprites
const imageLoadStatus = { total: 0, loaded: 0 };

const characterSprites = {
    alien: { up: new Image(), down: new Image(), left: new Image(), right: new Image() },
    robot: { up: new Image(), down: new Image(), left: new Image(), right: new Image() },
    soldier: { up: new Image(), down: new Image(), left: new Image(), right: new Image() },
    ninja: { up: new Image(), down: new Image(), left: new Image(), right: new Image() }
};

const bulletImgs = {
    up: new Image(), down: new Image(), left: new Image(), right: new Image()
};

const zombieImgs = {
    normal: new Image(),
    elite: new Image(),
    boss: new Image(),
    rusher: new Image(),
    tank: new Image(),
    explosive: new Image()
};

const powerupSprites = {
    DoublePoints: new Image(),
    InstaKill: new Image(),
    ExtraPoints: new Image()
};

const grenadeImg = new Image();
const weatherEffectsImgs = {
    sandstorm: new Image(),
    fog: new Image(),
    bloodrain: new Image()
};

// Función para cargar imágenes
function loadImage(img, path) {
    return new Promise((resolve, reject) => {
        imageLoadStatus.total++;
        img.onload = () => {
            imageLoadStatus.loaded++;
            resolve(img);
        };
        img.onerror = () => {
            console.error('Error cargando imagen:', path);
            reject(new Error(`Error al cargar imagen: ${path}`));
        };
        img.src = path;
    });
}

// Cargar assets
async function loadAssets() {
    try {
        await Promise.all([
            // Cargar sprites de personajes
            ...Object.entries(characterSprites).flatMap(([char, dirs]) => 
                Object.entries(dirs).map(([dir, img]) => 
                    loadImage(img, `sprites/${char}/${char}_${dir}_amarillo.png`)
                )
            ),
            
            // Cargar balas
            loadImage(bulletImgs.up, 'sprites/bullet/bullet-arriba.png'),
            loadImage(bulletImgs.down, 'sprites/bullet/bullet-abajo.png'),
            loadImage(bulletImgs.left, 'sprites/bullet/bullet-izquierda.png'),
            loadImage(bulletImgs.right, 'sprites/bullet/bullet-derecha.png'),
            
            // Cargar zombies
            loadImage(zombieImgs.normal, 'sprites/zombie.png'),
            loadImage(zombieImgs.elite, 'sprites/zombie_elite.png'),
            loadImage(zombieImgs.boss, 'sprites/zombie_boss.png'),
            loadImage(zombieImgs.rusher, 'sprites/zombie_rusher.png'),
            loadImage(zombieImgs.tank, 'sprites/zombie_tank.png'),
            loadImage(zombieImgs.explosive, 'sprites/zombie_explosive.png'),
            
            // Cargar powerups
            loadImage(powerupSprites.DoublePoints, 'sprites/powerups/double_points.png'),
            loadImage(powerupSprites.InstaKill, 'sprites/powerups/insta_kill.png'),
            loadImage(powerupSprites.ExtraPoints, 'sprites/powerups/extra_points.png'),
            
            // Cargar máquinas expendedoras
            ...vendingMachines.map(machine => 
                loadImage(machine.sprite, `sprites/vending/${machine.type.toLowerCase().replace(' ', '_')}.png`)
            ),
            
            // Cargar efectos
            loadImage(grenadeImg, 'sprites/grenade.png'),
            loadImage(weatherEffectsImgs.sandstorm, 'sprites/weather/sandstorm.png'),
            loadImage(weatherEffectsImgs.fog, 'sprites/weather/fog.png'),
            loadImage(weatherEffectsImgs.bloodrain, 'sprites/weather/bloodrain.png'),

            // Cargar iconos de buffos
            loadImage(buffIcons.Juggernog, 'sprites/buffs/juggernog_icon.png'),
            loadImage(buffIcons['Double Tap'], 'sprites/buffs/doubletap_icon.png'),
            loadImage(buffIcons['Quick Revive'], 'sprites/buffs/revive_icon.png'),
            loadImage(buffIcons['PhD Flopper'], 'sprites/buffs/phd_icon.png'),
            loadImage(buffIcons['Stamin-Up'], 'sprites/buffs/staminup_icon.png')
        ]);

        buffIconsLoaded = true;
        assetsLoaded = true;
        console.log('Todos los assets cargados');
    } catch (error) {
        console.error('Error cargando assets:', error);
        alert('Error cargando recursos del juego. Por favor recarga la página.');
    }
}

// Función para mostrar texto flotante
function showFloatingText(text, x, y, color = 'gold', size = 20, duration = 1000) {
    floatingTexts.push({
        text,
        x,
        y,
        color,
        size,
        startTime: Date.now(),
        duration,
        velocity: { x: 0, y: -0.5 }
    });
}

// Función para crear partículas
function createParticles(x, y, count, color, config = {}) {
    for (let i = 0; i < count; i++) {
        particleSystem.addParticle(
            x + (Math.random() - 0.5) * 20,
            y + (Math.random() - 0.5) * 20,
            {
                color: color,
                size: config.size || Math.random() * 10 + 10,
                lifetime: config.lifetime || 1000 + Math.random() * 500,
                velocity: {
                    x: (Math.random() - 0.5) * 2,
                    y: -Math.random() * 3
                },
                gravity: config.gravity || 0.05,
                text: config.text || null
            }
        );
    }
}

// Función para envolver texto
function wrapText(ctx, text, maxWidth, fontSize) {
    ctx.font = fontSize + 'px Arial';
    const words = text.split(' ');
    const lines = [];
    let currentLine = words[0];

    for (let i = 1; i < words.length; i++) {
        const word = words[i];
        const width = ctx.measureText(currentLine + ' ' + word).width;
        if (width < maxWidth) {
            currentLine += ' ' + word;
        } else {
            lines.push(currentLine);
            currentLine = word;
        }
    }
    lines.push(currentLine);
    return lines;
}

// Función para renderizar los iconos de buffos
function renderBuffIcons() {
    if (!buffIconsLoaded || !players[myId]) return;

    const buffs = players[myId].buffs;
    if (!buffs) return;

    const startX = 20;
    const startY = canvas.height - 50;
    const iconSize = 32;
    const spacing = 10;
    const buffCount = Object.keys(buffs).length;

    // Fondo del contenedor solo si hay buffos activos
    if (buffCount > 0) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.fillRect(startX - 5, startY - 5, 
                     buffCount * (iconSize + spacing) + 10, 
                     iconSize + 10);
        ctx.strokeStyle = '#0f0';
        ctx.lineWidth = 1;
        ctx.strokeRect(startX - 5, startY - 5, 
                      buffCount * (iconSize + spacing) + 10, 
                      iconSize + 10);
    }

    // Dibujar íconos
    let currentX = startX;
    for (const buff in buffs) {
        if (buffs[buff] && buffIcons[buff]?.complete) {
            // Dibujar el ícono
            ctx.drawImage(buffIcons[buff], currentX, startY, iconSize, iconSize);
            
            // Dibujar el número de usos si es Quick Revive
            if (buff === 'Quick Revive') {
                ctx.fillStyle = 'white';
                ctx.font = 'bold 12px Arial';
                ctx.textAlign = 'center';
                ctx.fillText(`${MAX_QUICK_REVIVE - quickRevivePurchases}`, currentX + iconSize/2, startY + iconSize - 5);
            }

            currentX += iconSize + spacing;
        }
    }
}

// Función para renderizar jugadores
function renderPlayers() {
    for (const id in players) {
        const p = players[id];
        if (p.hp <= 0) continue;
        
        if (p.isDowned) {
            ctx.fillStyle = 'rgba(255, 0, 0, 0.5)';
            ctx.fillRect(p.x - 16, p.y - 16, 32, 32);
            
            const reviveProgress = p.downedTime ? (Date.now() - p.downedTime) / 5000 : 0;
            drawHealthBar(ctx, p.x - 25, p.y - 30, 50, 5, reviveProgress * 5000, 5000, {
                color: 'yellow',
                background: 'rgba(0, 0, 0, 0.7)'
            });
            
            if (id === myId) {
                ctx.fillStyle = 'white';
                ctx.font = '12px Arial';
                ctx.textAlign = 'center';
                ctx.fillText('Mantén F para revivir', p.x, p.y - 35);
            }
            continue;
        }
        
        if (Date.now() - p.lastHitTime < 1000 && Math.floor(Date.now() / 100) % 2 === 0) {
            ctx.globalAlpha = 0.5;
        }
        
        const direction = playerDirections[id] || 'down';
        const character = p.character || 'alien';
        const sprite = characterSprites[character]?.[direction] || characterSprites.alien.down;
        
        if (sprite.complete && sprite.naturalWidth > 0) {
            ctx.drawImage(sprite, p.x - 16, p.y - 16, 32, 32);
        }
        ctx.globalAlpha = 1;
        
        ctx.fillStyle = id === myId ? '#00ff00' : '#ffffff';
        ctx.font = '14px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(p.name, p.x, p.y - 20);
        
        drawHealthBar(ctx, p.x - 50, p.y - 30, 100, 8, p.hp, p.maxHp, {
            showText: true,
            font: 'bold 10px Arial'
        });
        
        // Mostrar regeneración de vida si está activa
        if (id === myId && p.hp < p.maxHp && Date.now() - p.lastHitTime > 10000) {
            ctx.fillStyle = 'rgba(0, 255, 0, 0.5)';
            ctx.fillRect(p.x - 50, p.y - 35, 100 * (p.hp / p.maxHp), 2);
        }
    }
}

// Función para renderizar zombies
function renderZombies() {
    for (const z of zombies) {
        let img, size;
        if (z.isBoss) {
            img = zombieImgs.boss;
            size = 48;
            ctx.save();
            ctx.shadowColor = 'red';
            ctx.shadowBlur = 15;
        } else if (z.isElite) {
            img = zombieImgs.elite;
            size = 40;
            ctx.save();
            ctx.shadowColor = 'orange';
            ctx.shadowBlur = 10;
        } else {
            switch(z.type) {
                case 'rusher': img = zombieImgs.rusher; break;
                case 'tank': img = zombieImgs.tank; break;
                case 'explosive': img = zombieImgs.explosive; break;
                default: img = zombieImgs.normal;
            }
            size = 32;
        }

        if (img.complete && img.naturalWidth > 0) {
            ctx.drawImage(img, z.x - size/2, z.y - size/2, size, size);
            
            if (z.isElite || z.isBoss) {
                ctx.restore();
            }
            
            const healthBarY = z.y - size/2 - 5;
            const maxHealth = z.isBoss ? 100 : z.isElite ? 60 : 40;
            
            drawHealthBar(ctx, z.x - size/2, healthBarY, size, 3, z.hp, maxHealth, {
                color: z.isElite ? 'gold' : 'green',
                background: z.isElite ? 'darkred' : 'red'
            });
            
            if (z.isBoss) {
                ctx.fillStyle = 'red';
                ctx.font = '12px Arial';
                ctx.textAlign = 'center';
                ctx.fillText('BOSS', z.x, healthBarY - 5);
            }
        }
    }
}

// Función para renderizar balas
function renderBullets() {
    for (const b of bullets) {
        let bulletImg;
        if (b.angle >= -Math.PI/4 && b.angle < Math.PI/4) {
            bulletImg = bulletImgs.right;
        } else if (b.angle >= Math.PI/4 && b.angle < 3*Math.PI/4) {
            bulletImg = bulletImgs.down;
        } else if (b.angle >= -3*Math.PI/4 && b.angle < -Math.PI/4) {
            bulletImg = bulletImgs.up;
        } else {
            bulletImg = bulletImgs.left;
        }

        if (bulletImg.complete && bulletImg.naturalWidth > 0) {
            ctx.save();
            ctx.translate(b.x, b.y);
            ctx.rotate(b.angle);
            ctx.drawImage(bulletImg, -4, -4, 8, 8);
            ctx.restore();
        }
    }
}

// Función para renderizar powerups
function renderPowerups() {
    for (const powerup of powerups) {
        const img = powerupSprites[powerup.type];
        if (img.complete) {
            const timeLeft = 10000 - (Date.now() - powerup.spawnTime);
            if (timeLeft > 2000 || Math.floor(Date.now() / 200) % 2 === 0) {
                ctx.drawImage(img, powerup.x - 16, powerup.y - 16, 32, 32);
            }
        }
    }
}

// Función para renderizar granadas
function renderGrenades() {
    for (const g of grenades) {
        if (grenadeImg.complete) {
            const timeLeft = g.explodeTime - Date.now();
            const progress = 1 - (timeLeft / 5000);
            
            const pulseSize = 16 + Math.sin(Date.now() / 200) * 4;
            
            ctx.save();
            ctx.globalAlpha = 0.8;
            ctx.drawImage(grenadeImg, g.x - pulseSize/2, g.y - pulseSize/2, pulseSize, pulseSize);
            ctx.restore();
            
            ctx.fillStyle = 'rgba(255, 100, 0, 0.7)';
            ctx.fillRect(g.x - 20, g.y - 25, 40 * progress, 3);
            
            if (g.owner === myId && grenadeMode) {
                ctx.strokeStyle = 'rgba(255, 100, 0, 0.3)';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.arc(g.x, g.y, 100, 0, Math.PI * 2);
                ctx.stroke();
            }
        }
    }
}

// Función para renderizar efectos climáticos
function renderWeatherEffects() {
    if (!currentWeatherEvent) return;
    
    const progress = (weatherEndTime - Date.now()) / 30000;
    if (progress <= 0) return;
    
    ctx.save();
    ctx.globalAlpha = progress * 0.7;
    
    switch(currentWeatherEvent) {
        case 'sandstorm':
            ctx.fillStyle = '#D2B48C';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            
            if (weatherEffects.speedModifier) {
                ctx.fillStyle = 'white';
                ctx.font = '16px Arial';
                ctx.textAlign = 'center';
                ctx.fillText('¡TORMENTA DE ARENA! Velocidad reducida', canvas.width/2, 30);
            }
            
            if (Math.random() < 0.3) {
                createParticles(
                    Math.random() * canvas.width,
                    Math.random() * canvas.height,
                    5,
                    '#D2B48C',
                    { size: 2, lifetime: 2000, gravity: 0 }
                );
            }
            break;
            
        case 'fog':
            ctx.fillStyle = '#A0A0A0';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            
            if (weatherEffects.visionReduction) {
                ctx.fillStyle = 'white';
                ctx.font = '16px Arial';
                ctx.textAlign = 'center';
                ctx.fillText('¡NIEBLA! Visibilidad reducida', canvas.width/2, 30);
            }
            break;
            
        case 'bloodrain':
            ctx.fillStyle = '#8A0303';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            
            if (weatherEffects.zombieSpeedBoost || weatherEffects.zombieDamageBoost) {
                ctx.fillStyle = 'white';
                ctx.font = '16px Arial';
                ctx.textAlign = 'center';
                ctx.fillText('¡LLUVIA DE SANGRE! Zombies más rápidos y fuertes', canvas.width/2, 30);
            }
            
            if (Math.random() < 0.5) {
                createParticles(
                    Math.random() * canvas.width,
                    0,
                    3,
                    '#8A0303',
                    { size: 3, lifetime: 1000, gravity: 0.5 }
                );
            }
            break;
    }
    
    ctx.restore();
}

// Función para renderizar el tracker de misiones
function renderMissionTracker() {
    if (!showMissionTracker || missions.length === 0) return;
    
    ctx.save();
    
    const x = canvas.width - 20;
    const y = 120;
    const width = 200;
    const padding = 10;
    
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(x - width, y, width, missions.length * 40 + padding * 2);
    ctx.strokeStyle = '#0f0';
    ctx.lineWidth = 1;
    ctx.strokeRect(x - width, y, width, missions.length * 40 + padding * 2);
    
    ctx.fillStyle = '#0f0';
    ctx.font = 'bold 14px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('Misiones', x - width/2, y + 20);
    
    missions.forEach((mission, index) => {
        const missionY = y + 30 + index * 40;
        const progress = Math.min(1, mission.progress / mission.currentTarget);
        
        ctx.fillStyle = 'white';
        ctx.font = '10px Arial';
        ctx.textAlign = 'left';
        ctx.fillText(mission.name, x - width + padding, missionY);
        
        ctx.fillStyle = '#333';
        ctx.fillRect(x - width + padding, missionY + 5, width - padding * 2, 5);
        
        ctx.fillStyle = mission.completed ? '#0f0' : '#0a0';
        ctx.fillRect(x - width + padding, missionY + 5, (width - padding * 2) * progress, 5);
        
        ctx.fillStyle = 'white';
        ctx.font = '10px Arial';
        ctx.textAlign = 'right';
        ctx.fillText(`${mission.progress}/${mission.currentTarget}`, x - padding, missionY + 10);
    });
    
    ctx.restore();
}

// Función para renderizar la ventana de estadísticas
function renderStatsWindow() {
    if (!statsWindowVisible || !players[myId]) return;
    
    ctx.save();
    
    ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.fillRect(canvas.width/2 - 200, canvas.height/2 - 200, 400, 400);
    
    ctx.strokeStyle = '#0f0';
    ctx.lineWidth = 2;
    ctx.strokeRect(canvas.width/2 - 200, canvas.height/2 - 200, 400, 400);
    
    ctx.fillStyle = '#0f0';
    ctx.font = '24px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('ESTADÍSTICAS', canvas.width/2, canvas.height/2 - 160);
    
    ctx.fillStyle = 'white';
    ctx.font = '20px Arial';
    ctx.textAlign = 'left';
    ctx.fillText('Jugadores:', canvas.width/2 - 180, canvas.height/2 - 120);
    
    let yOffset = canvas.height/2 - 90;
    for (const id in players) {
        const p = players[id];
        ctx.fillStyle = id === myId ? '#0f0' : 'white';
        ctx.fillText(`${p.name}: ${p.score} pts`, canvas.width/2 - 180, yOffset);
        yOffset += 25;
    }
    
    ctx.fillStyle = 'white';
    ctx.fillText('Zombies eliminados:', canvas.width/2 - 180, yOffset + 20);
    ctx.fillText(`Normales: ${totalZombiesKilled.normal}`, canvas.width/2 - 160, yOffset + 50);
    ctx.fillStyle = 'orange';
    ctx.fillText(`Élites: ${totalZombiesKilled.elite}`, canvas.width/2 - 160, yOffset + 80);
    ctx.fillStyle = 'red';
    ctx.fillText(`Bosses: ${totalZombiesKilled.boss}`, canvas.width/2 - 160, yOffset + 110);
    ctx.fillStyle = 'white';
    ctx.fillText(`Total: ${totalZombiesKilled.normal + totalZombiesKilled.elite + totalZombiesKilled.boss}`, 
                canvas.width/2 - 160, yOffset + 140);
    
    ctx.fillStyle = '#0f0';
    ctx.font = '16px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('Presiona Tab para cerrar', canvas.width/2, canvas.height/2 + 170);
    
    ctx.restore();
}

// Función para dibujar barras de salud
function drawHealthBar(ctx, x, y, width, height, current, max, options = {}) {
    const borderRadius = height / 2;
    const progress = Math.max(0, Math.min(1, current / max));
    
    // Fondo
    ctx.fillStyle = options.background || 'rgba(0, 0, 0, 0.7)';
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, borderRadius);
    ctx.fill();
    
    // Barra de vida
    const fillWidth = width * progress;
    if (fillWidth > 0) {
        ctx.fillStyle = options.color || 
                       (progress > 0.6 ? '#4CAF50' : 
                        progress > 0.3 ? '#FFC107' : '#F44336');
        ctx.beginPath();
        ctx.roundRect(x, y, fillWidth, height, borderRadius);
        ctx.fill();
    }
    
    // Borde
    ctx.strokeStyle = options.border || 'rgba(232, 3, 3, 0.94)';
    ctx.lineWidth = options.borderWidth || 1;
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, borderRadius);
    ctx.stroke();
    
    // Texto (opcional)
    if (options.showText) {
        ctx.fillStyle = options.textColor || 'white';
        ctx.font = options.font || '10px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(`${Math.floor(current)}/${Math.floor(max)}`, x + width/2, y + height/2 + 3);
    }
}

// Función para redimensionar el canvas
function resizeCanvas() {
    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;
    
    const scaleX = windowWidth / canvasWidth;
    const scaleY = windowHeight / canvasHeight;
    scaleFactor = Math.min(scaleX, scaleY);
    
    canvas.style.width = `${canvasWidth * scaleFactor}px`;
    canvas.style.height = `${canvasHeight * scaleFactor}px`;
    
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
    
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(scaleFactor, scaleFactor);
}

// Eventos del servidor
socket.on('connect', () => {
    myId = socket.id;
    console.log('Conectado al servidor con ID:', myId);
});

socket.on('startGame', async (roomData) => {
    document.getElementById('joinRoom').style.display = 'none';
    document.getElementById('createRoom').style.display = 'none';
    document.getElementById('deathScreen').style.display = 'none';
    document.getElementById('gameOverScreen').style.display = 'none';
    document.getElementById('settingsMenu').style.display = 'none';
    document.getElementById('historyMenu').style.display = 'none';
    document.getElementById('missionsMenu').style.display = 'none';
    canvas.style.display = 'block';
    
    if (!assetsLoaded) {
        await loadAssets();
    }
    
    missions = generateRandomMissions(3);
    completedMissions = [];
    
    gameLoop();
});

function renderVendingMachines() {
    const player = players[myId];
    if (!player) return;

    for (const machine of vendingMachines) {
        if (machine.sprite.complete) {
            // Dibujar la máquina
            ctx.drawImage(
                machine.sprite,
                machine.x - 25, 
                machine.y - 25,
                50,
                50
            );

            // Dibujar nombre y precio
            ctx.fillStyle = machine.color;
            ctx.font = 'bold 12px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(machine.type, machine.x, machine.y + 40);
            ctx.fillText(`$${machine.price}`, machine.x, machine.y + 55);

            // Mostrar prompt de compra si el jugador está cerca
            const dx = player.x - machine.x;
            const dy = player.y - machine.y;
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (distance < 50) {
                ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
                ctx.fillRect(machine.x - 100, machine.y - 80, 200, 60);
                ctx.fillStyle = '#0f0';
                ctx.font = '14px Arial';
                ctx.textAlign = 'center';
                
                // Mostrar descripción del buffo
                const desc = buffDescriptions[machine.type];
                if (desc) {
                    ctx.fillText(desc, machine.x, machine.y - 60);
                }
                
                if (player.buffs?.[machine.type]) {
                    ctx.fillText('Ya tienes este buffo', machine.x, machine.y - 45);
                } else if (machine.type === 'Quick Revive' && quickRevivePurchases >= 3) {
                    ctx.fillText('Límite alcanzado', machine.x, machine.y - 45);
                } else if (player.score >= machine.price) {
                    ctx.fillText('Presiona E para comprar', machine.x, machine.y - 30);
                } else {
                    ctx.fillStyle = 'red';
                    ctx.fillText('Fondos insuficientes', machine.x, machine.y - 45);
                }
            }
        }
    }
}

socket.on('state', data => {
    players = data.players;
    zombies = data.zombies;
    bullets = data.bullets;
    powerups = data.powerups;
    grenades = data.grenades || [];
    roundTimeRemaining = data.timeRemaining;
    currentWeatherEvent = data.weatherEvent;
    
    const player = players[myId];
    if (player && player.hp <= 0 && !isDowned && player.isDowned) {
        isDowned = true;
        showDeathScreen();
    }
    
    checkMissionProgress();
});

socket.on('roundStart', ({round, isEliteRound: isElite}) => {
    currentRound = round;
    isEliteRound = isElite;
    roundTimeRemaining = 180000;
    roundTransition = true;
    roundTransitionStart = Date.now();
    
    if (isEliteRound) {
        sounds.eliteRound.currentTime = 0;
        sounds.eliteRound.play();
    }
    
    checkMissionProgress();
});

socket.on('gameOver', ({victory}) => {
    gameActive = false;
    showGameOverScreen(victory);
});

socket.on('roomList', (rooms) => {
    const container = document.getElementById('roomsContainer');
    container.innerHTML = '';
    
    if (rooms.length === 0) {
        container.innerHTML = '<p>No hay salas disponibles</p>';
        return;
    }
    
    rooms.forEach(room => {
        const roomElement = document.createElement('div');
        roomElement.className = 'room-item';
        roomElement.innerHTML = `
            <div>
                <strong>${room.name}</strong><br>
                Jugadores: ${room.players}/${room.maxPlayers}<br>
                Ronda: ${room.round}
            </div>
            <button onclick="joinRoom('${room.id}')">Unirse</button>
        `;
        container.appendChild(roomElement);
    });
});

socket.on('buffPurchased', ({playerId, buffType}) => {
    if (playerId === myId) {
        players[myId].buffs[buffType] = true;
        sounds.purchase.currentTime = 0;
        sounds.purchase.play();
        
        if (buffType === 'Juggernog') {
            players[myId].maxHp = 200;
            players[myId].hp = 200;
        }

        // En la función que renderiza al jugador
        if (player.buffs?.QuickRevive) {
            ctx.fillStyle = 'cyan';
            ctx.font = '10px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(`Revives: ${MAX_QUICK_REVIVE - quickRevivePurchases}`, player.x, player.y + 25);
        }

        if (buffType === 'Quick Revive') {
            showFloatingText(
                `QUICK REVIVE (${MAX_QUICK_REVIVE - quickRevivePurchases} restantes)`,
                players[myId].x, players[myId].y - 30,
                'cyan',
                18,
                2000
            );
        }
    }
});

socket.on('buffDisabled', ({buffType}) => {
    if (buffType === 'Quick Revive') {
        quickRevivePurchases = 3;
    }
});

socket.on('playerRespawned', ({playerId, buffsCleared}) => {
    if (playerId === myId) {
        players[myId].buffs = {};
        activePowerups = {};
        
        if (buffsCleared) {
            setTimeout(() => {
                const player = players[myId];
                if (player) player.buffs = {};
            }, 100);
        }
    }
});

socket.on('zombieKilled', ({playerId, isElite, isBoss}) => {
    if (playerId === myId) {
        if (isBoss) {
            totalZombiesKilled.boss++;
        } else if (isElite) {
            totalZombiesKilled.elite++;
        } else {
            totalZombiesKilled.normal++;
        }
        
        checkMissionProgress();
    }
});

socket.on('powerupCollected', ({playerId, powerupType, points, position}) => {
    if (playerId === myId) {
        sounds.purchase.currentTime = 0;
        sounds.purchase.play();
        
        if (powerupType === 'ExtraPoints' && points) {
            showFloatingText(`+${points} PUNTOS`, position.x, position.y, '#FFD700', 24, 1500);
            createParticles(position.x, position.y, 10, '#FFD700');
        } else if (powerupType !== 'ExtraPoints') {
            activePowerups[powerupType] = Date.now() + 30000;
            showFloatingText(
                powerupType === 'DoublePoints' ? '2X PUNTOS!' : 'INSTA-KILL!',
                position.x, position.y - 30,
                powerupType === 'DoublePoints' ? '#00FF00' : '#FF0000',
                22,
                2000
            );
            
            missions.forEach(mission => {
                if (mission.type === 'powerups' && !mission.completed) {
                    mission.progress++;
                    checkMissionProgress();
                }
            });
        }
    }
});

socket.on('powerupExpired', ({playerId, powerupType}) => {
    if (playerId === myId) {
        delete activePowerups[powerupType];
    }
});

socket.on('playerDowned', ({playerId, downedTime}) => {
    if (playerId === myId) {
        players[myId].buffs = {};
        isDowned = true;
        reviveProgress = 0;
        if (reviveInterval) {
            clearInterval(reviveInterval);
            reviveInterval = null;
        }
        players[myId].downedTime = downedTime;
    }
});

socket.on('showDeathScreen', ({playerId, round, zombiesKilled, score}) => {
    if (playerId === myId) {
        document.getElementById('deathRound').textContent = round;
        document.getElementById('deathZombies').textContent = zombiesKilled;
        document.getElementById('deathScore').textContent = score;
        document.getElementById('deathMissions').textContent = completedMissions.length;
        
        canvas.style.display = 'none';
        document.getElementById('deathScreen').style.display = 'block';
        sounds.death.currentTime = 0;
        sounds.death.play();
    }
});

socket.on('playerRevived', ({playerId}) => {
    if (playerId === myId) {
        isDowned = false;
        reviveProgress = 0;
        if (reviveInterval) {
            clearInterval(reviveInterval);
            reviveInterval = null;
        }
        sounds.revive.currentTime = 0;
        sounds.revive.play();
    }
});

socket.on('grenadeThrown', ({x, y, owner, cooldown}) => {
    grenades.push({
        x: x,
        y: y,
        owner: owner,
        explodeTime: Date.now() + 5000,
        throwTime: Date.now()
    });
    
    if (owner === myId) {
        grenadeAvailable = false;
        grenadeCooldown = cooldown;
        setTimeout(() => {
            grenadeAvailable = true;
            grenadeCooldown = 0;
        }, cooldown);
    }
});

socket.on('grenadeExploded', ({x, y, owner}) => {
    createParticles(x, y, 30, 'orange', { size: 15 });
    sounds.grenadeExplosion.currentTime = 0;
    sounds.grenadeExplosion.play();
    
    grenades = grenades.filter(g => !(g.x === x && g.y === y && g.owner === owner));
});

socket.on('zombieExplosion', ({x, y}) => {
    createParticles(x, y, 20, 'red', { size: 20, gravity: 0.1 });
    sounds.explosion.currentTime = 0;
    sounds.explosion.play();
});

socket.on('weatherEvent', ({type, duration, effect}) => {
    currentWeatherEvent = type;
    weatherEndTime = Date.now() + duration;
    weatherEffects = effect || {};
    
    if (sounds[type]) {
        sounds[type].currentTime = 0;
        sounds[type].play();
    }
});

socket.on('weatherEnd', () => {
    currentWeatherEvent = null;
    weatherEffects = {};
    if (sounds.sandstorm) sounds.sandstorm.pause();
    if (sounds.fog) sounds.fog.pause();
    if (sounds.bloodrain) sounds.bloodrain.pause();
});

socket.on('healthRegen', ({amount, currentHp}) => {
    const player = players[myId];
    if (player) {
        showFloatingText(`+${amount} HP`, player.x, player.y - 30, '#00FF00', 16);
        sounds.healthRegen.currentTime = 0;
        sounds.healthRegen.play();
    }
});

// Sistema de misiones
function generateRandomMissions(count = 3) {
    const missionTypes = Object.keys(MISSION_TYPES);
    const shuffled = missionTypes.sort(() => 0.5 - Math.random());
    const selected = shuffled.slice(0, count);
    
    return selected.map(type => {
        const mission = {...MISSION_TYPES[type]};
        const tier = Math.floor(Math.random() * mission.target.length);
        mission.currentTarget = mission.target[tier];
        mission.currentReward = mission.reward[tier];
        mission.progress = 0;
        mission.completed = false;
        mission.id = Date.now() + Math.random();
        return mission;
    });
}

function checkMissionProgress() {
    const player = players[myId];
    if (!player) return;

    missions.forEach(mission => {
        if (mission.completed) return;

        switch(mission.type) {
            case "kill":
                mission.progress = totalZombiesKilled.normal + totalZombiesKilled.elite + totalZombiesKilled.boss;
                break;
            case "elite":
                mission.progress = totalZombiesKilled.elite;
                break;
            case "boss":
                mission.progress = totalZombiesKilled.boss;
                break;
            case "round":
                mission.progress = currentRound;
                break;
            case "points":
                mission.progress = player.score;
                break;
            case "powerups":
                break;
        }

        if (mission.progress >= mission.currentTarget) {
            mission.completed = true;
            completedMissions.push(mission);
            player.score += mission.currentReward;
            
            showMissionNotification(`Misión completada: ${mission.name} (+${mission.currentReward} pts)`);
            createParticles(canvas.width/2, canvas.height/2, 30, 'gold', { size: 10 });
            
            const index = missions.findIndex(m => m.id === mission.id);
            if (index !== -1) {
                const newMission = generateRandomMissions(1)[0];
                missions[index] = newMission;
            }
        }
    });
}

function showMissionNotification(text) {
    const notification = document.getElementById('missionNotification');
    notification.textContent = text;
    notification.style.display = 'block';
    notification.style.opacity = '1';
    
    setTimeout(() => {
        notification.style.opacity = '0';
        setTimeout(() => {
            notification.style.display = 'none';
        }, 500);
    }, 3000);
}

// Controles
canvas.addEventListener('mousemove', e => {
    const rect = canvas.getBoundingClientRect();
    mouseX = (e.clientX - rect.left) / scaleFactor;
    mouseY = (e.clientY - rect.top) / scaleFactor;
});

canvas.addEventListener('click', () => {
    const player = players[myId];
    if (!player || player.hp <= 0 || isDowned) return;

    if (grenadeMode && grenadeAvailable) {
        socket.emit('throwGrenade', {
            x: mouseX,
            y: mouseY
        });
        
        sounds.grenadeThrow.currentTime = 0;
        sounds.grenadeThrow.play();
        grenadeMode = false;
        grenadeAvailable = false;
        
        grenadeCooldown = 25000;
        const cooldownInterval = setInterval(() => {
            grenadeCooldown -= 100;
            if (grenadeCooldown <= 0) {
                grenadeAvailable = true;
                clearInterval(cooldownInterval);
            }
        }, 100);
    } else if (!grenadeMode) {
        const playerCenterX = player.x;
        const playerCenterY = player.y;
        const dx = mouseX - playerCenterX;
        const dy = mouseY - playerCenterY;
        const angle = Math.atan2(dy, dx);

        socket.emit('shootBullet', {
            x: playerCenterX,
            y: playerCenterY,
            angle: angle,
            owner: myId
        });
        
        if (player.buffs?.DoubleTap) {
            sounds.shoot.volume = 0.7;
            sounds.shoot.playbackRate = 1.3;
        } else {
            sounds.shoot.volume = 0.5;
            sounds.shoot.playbackRate = 1.0;
        }
        sounds.shoot.currentTime = 0;
        sounds.shoot.play();
    }
});

// Movimiento del jugador
function updatePlayerMovement() {
    const player = players[myId];
    if (!player || player.hp <= 0 || isDowned) return;

    const directions = [];
    if (keysPressed['w']) directions.push('up');
    if (keysPressed['a']) directions.push('left');
    if (keysPressed['s']) directions.push('down');
    if (keysPressed['d']) directions.push('right');

    if (directions.length > 0) {
        playerDirections[myId] = directions[0];
        
        let speedModifier = 1;
        if (currentWeatherEvent === 'sandstorm' && weatherEffects.speedModifier) {
            speedModifier = weatherEffects.speedModifier;
        }
        
        socket.emit('move', directions[0]);
    }
}

document.addEventListener('keydown', e => {
    const player = players[myId];
    if (!player || player.hp <= 0) return;

    const keyMap = { 'w': 'up', 'a': 'left', 's': 'down', 'd': 'right' };
    
    if (isDowned) {
        if (e.key === 'f') {
            if (!reviveInterval) {
                reviveInterval = setInterval(() => {
                    reviveProgress += 100;
                    if (reviveProgress >= 5000) {
                        clearInterval(reviveInterval);
                        reviveInterval = null;
                        socket.emit('revivePlayer');
                        isDowned = false;
                        reviveProgress = 0;
                    }
                }, 100);
            }
        }
        return;
    }
    
    if (keyMap[e.key]) {
        keysPressed[e.key] = true;
        updatePlayerMovement();
    }
    
    if (e.key === 'e' && showPurchasePrompt) {
        purchaseBuff();
    }
    
    if (e.key === 'g' && grenadeAvailable) {
        grenadeMode = !grenadeMode;
    }
    
    if (e.key === 'Tab') {
        statsWindowVisible = true;
        e.preventDefault();
    }
    
    if (e.key === 'm') {
        showMissionTracker = !showMissionTracker;
    }
});

document.addEventListener('keyup', e => {
    if (e.key === 'f' && reviveInterval) {
        clearInterval(reviveInterval);
        reviveInterval = null;
        reviveProgress = 0;
    }
    
    const keyMap = { 'w': 'up', 'a': 'left', 's': 'down', 'd': 'right' };
    if (keyMap[e.key]) {
        keysPressed[e.key] = false;
        updatePlayerMovement();
    }
    
    if (e.key === 'Tab') {
        statsWindowVisible = false;
    }
});

// Movimiento continuo
setInterval(() => {
    if (Object.values(keysPressed).some(v => v)) {
        updatePlayerMovement();
    }
}, 16);

// Sonidos ambientales
setInterval(() => {
    if (zombies.length > 0 && players[myId]?.hp > 0 && !isDowned) {
        const player = players[myId];
        const eliteNearby = zombies.some(z => {
            if (!z.isElite) return false;
            const dx = z.x - player.x;
            const dy = z.y - player.y;
            return Math.sqrt(dx * dx + dy * dy) < 250;
        });
        
        if (eliteNearby && Math.random() < 0.4) {
            sounds.zombieElite.currentTime = 0;
            sounds.zombieElite.play();
        } else {
            const zombieNearby = zombies.some(z => {
                const dx = z.x - player.x;
                const dy = z.y - player.y;
                return Math.sqrt(dx * dx + dy * dy) < 200;
            });
            
            if (zombieNearby && Math.random() < 0.3) {
                sounds.zombie.currentTime = 0;
                sounds.zombie.play();
            }
        }
    }
}, 3000);

// Bucle principal del juego
function gameLoop() {
    if (!assetsLoaded || !gameActive) return;
    
    particleSystem.update();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    renderWeatherEffects();
    
    if (roundTransition) {
        const elapsed = Date.now() - roundTransitionStart;
        if (elapsed < ROUND_TRANSITION_DURATION) {
            const progress = elapsed / ROUND_TRANSITION_DURATION;
            const alpha = 1 - Math.abs(progress - 0.5) * 2;
            
            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.fillStyle = 'black';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            
            ctx.fillStyle = isEliteRound ? '#ff0000' : '#00ff00';
            ctx.font = '40px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(`RONDA ${currentRound}`, canvas.width / 2, canvas.height / 2 - 20);
            
            if (isEliteRound) {
                ctx.font = '30px Arial';
                ctx.fillText('¡RONDA ÉLITE!', canvas.width / 2, canvas.width / 2 + 30);
            }
            ctx.restore();
        } else {
            roundTransition = false;
        }
    }
    
    if (isEliteRound && !roundTransition) {
        ctx.save();
        ctx.globalAlpha = 0.1;
        ctx.fillStyle = 'red';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.restore();
        
        if (Math.floor(Date.now() / 500) % 2 === 0) {
            ctx.fillStyle = 'red';
            ctx.font = '30px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('¡RONDA ÉLITE!', canvas.width / 2, 50);
        }
    }
    
    renderPlayers();
    renderZombies();
    renderBullets();
    renderPowerups();
    renderGrenades();
    renderVendingMachines(); // Asegúrate de que esta línea esté presente
    renderBuffIcons();
    renderMissionTracker();
    renderStatsWindow();
    
    particleSystem.render(ctx);
    
    const now = Date.now();
    for (let i = floatingTexts.length - 1; i >= 0; i--) {
        const text = floatingTexts[i];
        const elapsed = now - text.startTime;
        const progress = elapsed / text.duration;
        
        if (progress > 1) {
            floatingTexts.splice(i, 1);
            continue;
        }
        
        text.x += text.velocity.x;
        text.y += text.velocity.y;
        
        ctx.save();
        ctx.globalAlpha = 1 - (progress * 0.8);
        ctx.fillStyle = text.color;
        ctx.font = `bold ${text.size}px Arial`;
        ctx.textAlign = 'center';
        
        const scale = 1 + (progress * 0.5);
        ctx.translate(text.x, text.y);
        ctx.scale(scale, scale);
        ctx.fillText(text.text, 0, 0);
        ctx.restore();
    }
    
    const player = players[myId];
    if (player) {
        ctx.fillStyle = 'white';
        ctx.font = '20px Arial';
        ctx.textAlign = 'left';
        ctx.fillText(`Puntos: ${player.score}`, 20, 30);
        
        drawHealthBar(ctx, 20, 40, 100, 10, player.hp, player.maxHp, {
            border: 'white',
            borderWidth: 1
        });
        
        ctx.fillStyle = 'white';
        ctx.font = '12px Arial';
        ctx.fillText(`Vida: ${Math.floor(player.hp)}/${Math.floor(player.maxHp)}`, 20, 60);
        
        if (player.hp < player.maxHp && Date.now() - player.lastHitTime > 10000) {
            ctx.fillStyle = 'rgba(0, 255, 0, 0.5)';
            ctx.fillRect(20, 70, 100 * (player.hp / player.maxHp), 3);
            ctx.fillStyle = 'white';
            ctx.font = '10px Arial';
            ctx.fillText('Regenerando...', 130, 73);
        }
        
        if (!grenadeAvailable) {
            drawHealthBar(ctx, 20, 200, 100, 10, grenadeCooldown, 25000, {
                color: 'orange',
                background: 'rgba(255, 100, 0, 0.5)',
                border: 'orange'
            });
            
            ctx.fillStyle = 'orange';
            ctx.font = '12px Arial';
            ctx.fillText(`Granada en enfriamiento: ${Math.ceil(grenadeCooldown / 1000)}s`, 130, 195);
            
            grenadeCooldown = Math.max(0, grenadeCooldown - 16);
        } else {
            ctx.fillStyle = 'orange';
            ctx.font = 'bold 12px Arial';
            ctx.fillText('Granada lista (G para seleccionar)', 20, 195);
            ctx.fillText('Click para lanzar', 20, 210);
        }
    }
    
    ctx.fillStyle = 'white';
    ctx.font = '20px Arial';
    ctx.textAlign = 'right';
    ctx.fillText(`Ronda: ${currentRound}`, canvas.width - 20, 30);
    
    if (isEliteRound && !roundTransition) {
        ctx.fillStyle = '#ff0000';
        ctx.fillText('¡RONDA ÉLITE!', canvas.width - 20, 60);
    }
    
    const minutes = Math.floor(roundTimeRemaining / 60000);
    const seconds = Math.floor((roundTimeRemaining % 60000) / 1000);
    ctx.fillStyle = 'white';
    ctx.fillText(`Tiempo: ${minutes}:${seconds < 10 ? '0' : ''}${seconds}`, canvas.width - 20, 90);
    
    checkVendingMachineProximity();
    
    requestAnimationFrame(gameLoop);
}

// Funciones de UI
function showMainMenu() {
    const nameInput = document.getElementById('nameInput');
    let name = nameInput.value.trim();
    
    if (!name) {
        name = `Jugador ${Math.floor(Math.random() * 1000)}`;
        nameInput.value = name;
    }
    
    localStorage.setItem('playerName', name);
    socket.emit('setName', name);
    
    document.getElementById('lobby').style.display = 'none';
    document.getElementById('mainMenu').style.display = 'block';
}

function showCreateRoom() {
    document.getElementById('mainMenu').style.display = 'none';
    document.getElementById('createRoom').style.display = 'block';
    selectedCharacter = '';
    document.querySelectorAll('#createRoom .character').forEach(el => {
        el.classList.remove('selected');
    });
}

function showRoomList() {
    document.getElementById('mainMenu').style.display = 'none';
    document.getElementById('roomList').style.display = 'block';
    socket.emit('getRooms');
}

function backToMainMenu() {
    document.getElementById('createRoom').style.display = 'none';
    document.getElementById('roomList').style.display = 'none';
    document.getElementById('joinRoom').style.display = 'none';
    document.getElementById('settingsMenu').style.display = 'none';
    document.getElementById('historyMenu').style.display = 'none';
    document.getElementById('missionsMenu').style.display = 'none';
    document.getElementById('mainMenu').style.display = 'block';
}

function backToRoomList() {
    document.getElementById('joinRoom').style.display = 'none';
    document.getElementById('roomList').style.display = 'block';
}

function selectCharacter(character, containerId) {
    selectedCharacter = character;
    document.querySelectorAll(`#${containerId} .character`).forEach(el => {
        el.classList.remove('selected');
    });
    event.currentTarget.classList.add('selected');
}

function createRoom() {
    const roomName = document.getElementById('roomName').value.trim() || `Sala ${Math.floor(Math.random() * 1000)}`;
    
    if (!selectedCharacter) {
        alert('Por favor selecciona un personaje');
        return;
    }
    
    socket.emit('createRoom', {
        name: roomName,
        character: selectedCharacter
    });
}

function joinRoom(roomId) {
    currentRoom = roomId;
    document.getElementById('roomList').style.display = 'none';
    document.getElementById('joinRoom').style.display = 'block';
    selectedCharacter = '';
    document.querySelectorAll('#joinRoom .character').forEach(el => {
        el.classList.remove('selected');
    });
}

function confirmJoin() {
    if (!selectedCharacter) {
        alert('Por favor selecciona un personaje');
        return;
    }
    
    socket.emit('joinRoom', {
        roomId: currentRoom,
        character: selectedCharacter
    });
}

function showDeathScreen() {
    const player = players[myId];
    if (!player) return;
    
    const totalKilled = (player.zombiesKilled?.normal || 0) + 
                      (player.zombiesKilled?.elite || 0) + 
                      (player.zombiesKilled?.boss || 0);
    
    document.getElementById('deathRound').textContent = currentRound;
    document.getElementById('deathZombies').textContent = totalKilled;
    document.getElementById('deathScore').textContent = player.score;
    document.getElementById('deathMissions').textContent = completedMissions.length;
    
    canvas.style.display = 'none';
    document.getElementById('deathScreen').style.display = 'block';
    sounds.death.currentTime = 0;
    sounds.death.play();
}

function resetGame() {
    document.getElementById('deathScreen').style.display = 'none';
    canvas.style.display = 'block';
    isDowned = false;
    reviveProgress = 0;
    if (reviveInterval) {
        clearInterval(reviveInterval);
        reviveInterval = null;
    }
    socket.emit('resetPlayer');
}

function returnToMenu() {
    socket.emit('leaveRoom');
    location.reload();
}

function showGameOverScreen(victory) {
    const player = players[myId];
    if (!player) return;
    
    const totalKilled = (player.zombiesKilled?.normal || 0) + 
                      (player.zombiesKilled?.elite || 0) + 
                      (player.zombiesKilled?.boss || 0);
    
    const gameStats = {
        timestamp: new Date().toISOString(),
        victory: victory,
        round: currentRound,
        score: player.score,
        zombiesKilled: totalKilled,
        eliteZombies: player.zombiesKilled?.elite || 0,
        bossZombies: player.zombiesKilled?.boss || 0,
        missionsCompleted: completedMissions.length
    };
    
    let history = [];
    try {
        const savedHistory = localStorage.getItem('gameHistory');
        history = savedHistory ? JSON.parse(savedHistory) : [];
    } catch (e) {
        console.error('Error al cargar historial:', e);
    }
    
    history.push(gameStats);
    
    try {
        localStorage.setItem('gameHistory', JSON.stringify(history));
    } catch (e) {
        console.error('Error al guardar historial:', e);
    }
    
    canvas.style.display = 'none';
    const gameOverScreen = document.getElementById('gameOverScreen');
    gameOverScreen.style.display = 'block';
    
    document.getElementById('finalRound').textContent = currentRound;
    document.getElementById('finalScore').textContent = player.score;
    document.getElementById('zombiesKilled').textContent = totalKilled;
    document.getElementById('missionsCompleted').textContent = completedMissions.length;
    
    if (victory) {
        document.getElementById('gameOverTitle').textContent = '¡VICTORIA!';
        document.getElementById('gameOverText').textContent = '¡Felicidades! Has completado las 100 rondas!';
        sounds.victory.currentTime = 0;
        sounds.victory.play();
    } else {
        document.getElementById('gameOverTitle').textContent = '¡JUEGO TERMINADO!';
        document.getElementById('gameOverText').textContent = '¡Los zombies te han superado!';
        sounds.gameOver.currentTime = 0;
        sounds.gameOver.play();
    }
}

function showSettings() {
    document.getElementById('mainMenu').style.display = 'none';
    document.getElementById('settingsMenu').style.display = 'block';
    
    const masterVol = parseFloat(localStorage.getItem('masterVolume') || '0.5');
    const sfxVol = parseFloat(localStorage.getItem('sfxVolume') || '0.5');
    const isFullscreen = localStorage.getItem('fullscreen') === 'true';
    
    document.getElementById('masterVolume').value = masterVol;
    document.getElementById('sfxVolume').value = sfxVol;
    document.getElementById('fullscreenBtn').textContent = isFullscreen ? 'Desactivar' : 'Activar';
    
    document.getElementById('masterVolume').addEventListener('input', (e) => {
        const value = parseFloat(e.target.value);
        localStorage.setItem('masterVolume', value);
        setGlobalVolume(value);
    });
    
    document.getElementById('sfxVolume').addEventListener('input', (e) => {
        const value = parseFloat(e.target.value);
        localStorage.setItem('sfxVolume', value);
        setSfxVolume(value);
    });
    
    setGlobalVolume(masterVol);
    setSfxVolume(sfxVol);
}

function toggleFullscreen() {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(err => {
            console.error(`Error al intentar entrar en pantalla completa: ${err.message}`);
        });
        localStorage.setItem('fullscreen', 'true');
        document.getElementById('fullscreenBtn').textContent = 'Desactivar';
    } else {
        document.exitFullscreen();
        localStorage.setItem('fullscreen', 'false');
        document.getElementById('fullscreenBtn').textContent = 'Activar';
    }
}

function showHistory() {
    document.getElementById('mainMenu').style.display = 'none';
    document.getElementById('historyMenu').style.display = 'block';
    
    let history = [];
    try {
        const savedHistory = localStorage.getItem('gameHistory');
        history = savedHistory ? JSON.parse(savedHistory) : [];
    } catch (e) {
        console.error('Error al cargar historial:', e);
        history = [];
    }
    
    const historyList = document.getElementById('historyList');
    historyList.innerHTML = '';
    
    if (history.length === 0) {
        historyList.innerHTML = '<p>No hay partidas registradas</p>';
        return;
    }
    
    history.slice().reverse().slice(0, 10).forEach((game, index) => {
        const gameElement = document.createElement('div');
        gameElement.className = 'history-item';
        
        const date = new Date(game.timestamp);
        const dateStr = date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
        
        gameElement.innerHTML = `
            <h3>Partida ${history.length - index}</h3>
            <p>Fecha: ${dateStr}</p>
            <p>Resultado: <span style="color: ${game.victory ? 'lime' : 'red'}">${game.victory ? 'Victoria' : 'Derrota'}</span></p>
            <p>Ronda alcanzada: ${game.round}</p>
            <p>Puntuación: ${game.score}</p>
            <p>Zombies eliminados: ${game.zombiesKilled} (Élites: ${game.eliteZombies}, Bosses: ${game.bossZombies})</p>
            <p>Misiones completadas: ${game.missionsCompleted || 0}</p>
            <hr>
        `;
        historyList.appendChild(gameElement);
    });
}

function showMissions() {
    document.getElementById('mainMenu').style.display = 'none';
    document.getElementById('missionsMenu').style.display = 'block';
    
    const missionsList = document.getElementById('missionsList');
    missionsList.innerHTML = '';
    
    if (missions.length === 0 && completedMissions.length === 0) {
        missionsList.innerHTML = '<p>No hay misiones disponibles</p>';
        return;
    }
    
    if (missions.length > 0) {
        missions.forEach(mission => {
            const missionElement = document.createElement('div');
            missionElement.className = 'mission-item';
            
            const progressPercent = Math.min(100, (mission.progress / mission.currentTarget) * 100);
            
            missionElement.innerHTML = `
                <h3>${mission.name}</h3>
                <p>${mission.description.replace('{target}', mission.currentTarget)}</p>
                <div class="progress-bar">
                    <div class="progress" style="width: ${progressPercent}%"></div>
                </div>
                <p>Progreso: ${mission.progress}/${mission.currentTarget}</p>
                <p>Recompensa: <span class="reward">${mission.currentReward} pts</span></p>
            `;
            missionsList.appendChild(missionElement);
        });
    }
    
    if (completedMissions.length > 0) {
        const completedHeader = document.createElement('h3');
        completedHeader.textContent = 'Misiones Completadas';
        completedHeader.style.marginTop = '20px';
        completedHeader.style.color = '#0f0';
        missionsList.appendChild(completedHeader);
        
        completedMissions.forEach(mission => {
            const missionElement = document.createElement('div');
            missionElement.className = 'mission-item completed';
            
            missionElement.innerHTML = `
                <h3>${mission.name}</h3>
                <p>${mission.description.replace('{target}', mission.currentTarget)}</p>
                <p>Recompensa obtenida: <span class="reward">${mission.currentReward} pts</span></p>
            `;
            missionsList.appendChild(missionElement);
        });
    }
}

function setGlobalVolume(volume) {
    Object.values(sounds).forEach(sound => {
        sound.volume = volume * 0.5;
    });
}

function setSfxVolume(volume) {
    sounds.shoot.volume = volume * 0.5;
    sounds.hit.volume = volume * 0.5;
    sounds.zombie.volume = volume * 0.5;
    sounds.zombieElite.volume = volume * 0.5;
    sounds.death.volume = volume * 0.5;
    sounds.eliteRound.volume = volume * 0.5;
    sounds.victory.volume = volume * 0.5;
    sounds.gameOver.volume = volume * 0.5;
    sounds.purchase.volume = volume * 0.5;
    sounds.revive.volume = volume * 0.5;
    sounds.grenadeThrow.volume = volume * 0.5;
    sounds.grenadeExplosion.volume = volume * 0.5;
    sounds.healthRegen.volume = volume * 0.5;
    sounds.explosion.volume = volume * 0.5;
    sounds.sandstorm.volume = volume * 0.3;
    sounds.fog.volume = volume * 0.3;
    sounds.bloodrain.volume = volume * 0.3;
    sounds.missionComplete.volume = volume * 0.5;
}

// Funciones de máquinas expendedoras
function checkVendingMachineProximity() {
    const player = players[myId];
    if (!player || player.hp <= 0 || isDowned) return;

    showPurchasePrompt = false;
    currentMachine = null;

    for (const machine of vendingMachines) {
        const dx = player.x - machine.x;
        const dy = player.y - machine.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance < 50 && player.score >= machine.price && 
            !player.buffs[machine.type] && 
            !(machine.type === 'Quick Revive' && quickRevivePurchases >= 3)) {
            showPurchasePrompt = true;
            currentMachine = machine;
            break;
        }
    }
}

function purchaseBuff() {
    if (!currentMachine) return;
    
    const player = players[myId];
    if (!player || player.score < currentMachine.price || 
        player.buffs[currentMachine.type] || 
        (currentMachine.type === 'Quick Revive' && quickRevivePurchases >= 3) || 
        isDowned) return;

    socket.emit('purchaseBuff', {
        buffType: currentMachine.type,
        price: currentMachine.price
    });
}

// Hacer funciones disponibles globalmente
window.showMainMenu = showMainMenu;
window.showCreateRoom = showCreateRoom;
window.showRoomList = showRoomList;
window.backToMainMenu = backToMainMenu;
window.backToRoomList = backToRoomList;
window.selectCharacter = selectCharacter;
window.createRoom = createRoom;
window.joinRoom = joinRoom;
window.confirmJoin = confirmJoin;
window.resetGame = resetGame;
window.returnToMenu = returnToMenu;
window.showSettings = showSettings;
window.showHistory = showHistory;
window.showMissions = showMissions;
window.toggleFullscreen = toggleFullscreen;

// Inicialización al cargar la página
window.onload = function() {
    const savedName = localStorage.getItem('playerName');
    if (savedName) {
        document.getElementById('nameInput').value = savedName;
    }
    
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    
    if (localStorage.getItem('fullscreen') === 'true') {
        document.documentElement.requestFullscreen().catch(err => {
            console.error(`Error al intentar entrar en pantalla completa: ${err.message}`);
        });
    }
    
    loadAssets();
};

// Definición de tipos de misiones
const MISSION_TYPES = {
    KILL_ZOMBIES: {
        name: "Eliminar Zombies",
        description: "Mata {target} zombies",
        target: [10, 25, 50, 100],
        reward: [500, 1000, 2000, 5000],
        progress: 0,
        type: "kill"
    },
    KILL_ELITES: {
        name: "Eliminar Élites",
        description: "Mata {target} zombies élites",
        target: [3, 5, 10, 20],
        reward: [1000, 2000, 4000, 8000],
        progress: 0,
        type: "elite"
    },
    KILL_BOSSES: {
        name: "Eliminar Bosses",
        description: "Mata {target} bosses",
        target: [1, 3, 5, 10],
        reward: [2000, 5000, 10000, 20000],
        progress: 0,
        type: "boss"
    },
    REACH_ROUND: {
        name: "Alcanzar Ronda",
        description: "Llega a la ronda {target}",
        target: [5, 10, 15, 20, 30, 50],
        reward: [1000, 2500, 5000, 10000, 20000, 50000],
        progress: 0,
        type: "round"
    },
    COLLECT_POINTS: {
        name: "Recolectar Puntos",
        description: "Consigue {target} puntos",
        target: [1000, 5000, 10000, 25000, 50000],
        reward: [500, 1000, 2500, 5000, 10000],
        progress: 0,
        type: "points"
    },
    USE_POWERUPS: {
        name: "Usar Powerups",
        description: "Recoge {target} powerups",
        target: [3, 5, 10, 20],
        reward: [500, 1000, 2000, 5000],
        progress: 0,
        type: "powerups"
    }
};