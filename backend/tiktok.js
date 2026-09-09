const { WebcastPushConnection } = require('tiktok-live-connector');
const gameEngine = require('./gameEngine');
const config = require('./config');
const GiftQueue = require('./giftQueue');

// ================= EVENTO AMBIENTAL DE MAPA =================
// Evento puramente decorativo: NO multiplica el valor de ningún regalo,
// no lleva cuenta regresiva y no depende de las donaciones. Solo mantiene
// el mapa en movimiento para que la transmisión no se vea estática.
const TIEMPO_ESPERA_EVENTO   = 10 * 60 * 1000; // 10 minutos entre eventos
const TIEMPO_DURACION_EVENTO = 45 * 1000;      // 45 segundos de tormenta

let cicloEventoIniciado = false;

function iniciarCicloEventoMapa(io) {
    setTimeout(() => {
        console.log("[MAPA] Tormenta sobre el mapa");
        io.emit('evento_mapa', { tipo: 'tormenta', activo: true });

        setTimeout(() => {
            io.emit('evento_mapa', { tipo: 'tormenta', activo: false });
            iniciarCicloEventoMapa(io);
        }, TIEMPO_DURACION_EVENTO);
    }, TIEMPO_ESPERA_EVENTO);
}
// ============================================================

function connectToTikTokUser(tiktokUsername, io) {
    console.log(`Iniciando conexión con TikTok Live para @${tiktokUsername}...`);
    
    const queueManager = new GiftQueue(io);

    // El ciclo ambiental corre una sola vez por proceso, desligado de las donaciones
    if (!cicloEventoIniciado) {
        cicloEventoIniciado = true;
        iniciarCicloEventoMapa(io);
    }
    
    let tiktokLiveConnection = new WebcastPushConnection(tiktokUsername, {
        processInitialData: false,
        enableExtendedGiftInfo: true,
        enableWebsocketUpgrade: true,
        requestPollingIntervalMs: 2000,
        clientParams: {
            "app_language": "es"
        }
    });

    function connect() {
        tiktokLiveConnection.connect().then(state => {
            console.info(`Conectado al stream de TikTok Live: ${state.roomId}`);
            io.emit('tiktok_feed', `🟢 Conectado al LIVE de @${tiktokUsername}`);
        }).catch(err => {
            console.error(`Error conectando a TikTok Live de ${tiktokUsername}`, err);
            // Reintentar en 10 segundos
            setTimeout(connect, 10000);
        });
    }

    connect();

    tiktokLiveConnection.on('disconnected', () => {
        console.log(`Desconectado del LIVE de ${tiktokUsername}. Reconectando...`);
        io.emit('tiktok_feed', `🔴 Desconectado. Reintentando conexión...`);
        setTimeout(connect, 10000);
    });

    tiktokLiveConnection.on('error', err => {
        console.error('Error en conexión TikTok:', err);
    });

    tiktokLiveConnection.on('gift', data => {
        if (data.giftType === 1 && !data.repeatEnd) return;

        const giftName = data.giftName;
        const nickname = data.nickname;
        const multiplicador = data.repeatCount ? data.repeatCount : 1;
        
        console.log(`[${tiktokUsername}] Regalo recibido: ${multiplicador}x ${giftName} de ${nickname}`);
        
        // Búsqueda insensible a mayúsculas/minúsculas, incluyendo alias en inglés
        const giftNameLower = giftName.toLowerCase();
        const giftKey = Object.keys(config.gifts).find(k => {
            const isMatch = k.toLowerCase() === giftNameLower;
            const hasAlias = config.gifts[k].aliases && config.gifts[k].aliases.includes(giftNameLower);
            return isMatch || hasAlias;
        });
        const infoRegalo = giftKey ? config.gifts[giftKey] : null;
        
        if (infoRegalo) {
            if (infoRegalo.tipo === "apocalipsis") {
                console.log(`[!] Evento especial activado por ${nickname} con ${giftName}`);
                // Emitimos lluvia de bombas con 10 bombas por defecto
                io.emit('lluvia_de_bombas', { usuario: nickname, regalo: giftName, cantidad: 10 });
                return;
            }

            const paisRegalo = infoRegalo.pais;
            
            const fuerzaBase = infoRegalo.fuerza;

            const realAtacanteId = gameEngine.getOwnerReal(paisRegalo);
            const estadoActual = gameEngine.getEstadoActual();
            const paisAtacante = estadoActual[realAtacanteId];

            if (paisAtacante && !paisAtacante.eliminado) {
                const vecinos = paisAtacante.vecinos;

                if (vecinos.length > 0) {
                    // Daño completo y un solo objetivo: nunca se reparte entre varios.
                    const porcentajeInvasion = fuerzaBase / 100;

                    // El defensor definitivo lo elige el grid del cliente (el vecino
                    // que más territorio original del atacante tenga). Esto es solo
                    // un respaldo por si el grid aún no está listo.
                    const respaldo = vecinos[Math.floor(Math.random() * vecinos.length)];

                    // Un ataque por cada regalo del combo: 20 rosas = 20 empujones.
                    for (let i = 0; i < multiplicador; i++) {
                        queueManager.addEvent({
                            atacante: realAtacanteId,
                            defensor: respaldo,
                            vecinos: vecinos,
                            porcentaje: porcentajeInvasion,
                            usuario: nickname,
                            regalo: giftName,
                            multiplicador: i === 0 ? multiplicador : 1, // El primero muestra el combo total (ej. x20)
                            ocultarAlerta: i > 0, // Solo mostrar el popup gigante en el primer golpe
                            nombrePais: paisAtacante.nombre
                        });
                    }
                }
            }
        }
    });

    tiktokLiveConnection.on('like', data => {
        io.emit('tiktok_feed', `❤️ ${data.nickname} dio like al stream`);
    });

    return tiktokLiveConnection;
}

module.exports = connectToTikTokUser;
