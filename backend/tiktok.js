const { WebcastPushConnection } = require('tiktok-live-connector');
const gameEngine = require('./gameEngine');
const config = require('./config');
const GiftQueue = require('./giftQueue');

// ================= ESTADO X2 FRENESÍ =================
let primerDonacionRecibida = false;
let x2Activo = false;
const TIEMPO_ESPERA_X2 = 10 * 60 * 1000; // 10 minutos
const TIEMPO_DURACION_X2 = 3 * 60 * 1000; // 3 minutos

function iniciarCicloX2(io) {
    console.log("[X2] Ciclo de espera iniciado (10 mins)");
    
    // El frontend también puede tener un contador, pero aquí es la fuente de la verdad
    setTimeout(() => {
        x2Activo = true;
        console.log("[X2] FRENESÍ ACTIVADO POR 3 MINUTOS");
        io.emit('x2_estado', { activo: true, duracion: TIEMPO_DURACION_X2 });
        
        // Desactivar después de 3 minutos y reiniciar el ciclo de 10 min
        setTimeout(() => {
            x2Activo = false;
            console.log("[X2] Frenesí terminado. Reiniciando ciclo de espera...");
            io.emit('x2_estado', { activo: false });
            iniciarCicloX2(io);
        }, TIEMPO_DURACION_X2);

    }, TIEMPO_ESPERA_X2);
}
// =====================================================

function connectToTikTokUser(tiktokUsername, io) {
    console.log(`Iniciando conexión con TikTok Live para @${tiktokUsername}...`);
    
    const queueManager = new GiftQueue(io);
    
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

        // Arrancar el reloj de X2 con la primerísima donación del Live
        if (!primerDonacionRecibida) {
            primerDonacionRecibida = true;
            iniciarCicloX2(io);
        }

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
                console.log(`[!] LLUVIA DE BOMBAS DESATADA POR ${nickname} CON ${giftName}`);
                // Emitimos lluvia de bombas con 10 bombas por defecto
                io.emit('lluvia_de_bombas', { usuario: nickname, regalo: giftName, cantidad: 10 });
                return;
            }

            const paisRegalo = infoRegalo.pais;
            
            // Aplicar Multiplicador X2 si el Frenesí está activo
            const fuerzaBase = x2Activo ? infoRegalo.fuerza * 2 : infoRegalo.fuerza;

            const realAtacanteId = gameEngine.getOwnerReal(paisRegalo);
            const estadoActual = gameEngine.getEstadoActual();
            const paisAtacante = estadoActual[realAtacanteId];

            if (paisAtacante && !paisAtacante.eliminado) {
                const posiblesDefensores = paisAtacante.vecinos;
                
                if (posiblesDefensores.length > 0) {
                    let porcentajeInvasionBase = fuerzaBase / 100;
                    
                    const objetivos = gameEngine.obtenerObjetivosInteligentes(realAtacanteId, posiblesDefensores);
                    
                    // Si estamos en modo Supervivencia (AoE), el porcentaje se divide entre objetivos
                    if (objetivos.length >= 3) {
                        porcentajeInvasionBase = (porcentajeInvasionBase * 1.5) / objetivos.length;
                    }
                    
                    objetivos.forEach(defensorId => {
                        // Iterar la cantidad de veces del combo para disparar múltiples ataques individuales
                        for (let i = 0; i < multiplicador; i++) {
                            // Registrar este ataque en el mapa de aggro
                            gameEngine.registrarAtaque(realAtacanteId, defensorId, porcentajeInvasionBase);
                            
                            queueManager.addEvent({
                                atacante: realAtacanteId,
                                defensor: defensorId,
                                porcentaje: porcentajeInvasionBase,
                                usuario: nickname,
                                regalo: giftName,
                                multiplicador: i === 0 ? multiplicador : 1, // El primero muestra el combo total (ej. x20)
                                ocultarAlerta: i > 0, // Solo mostrar el popup gigante en el primer golpe
                                nombrePais: paisAtacante.nombre
                            });
                        }
                    });
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
