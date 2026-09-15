const { WebcastPushConnection } = require('tiktok-live-connector');
const gameEngine = require('./gameEngine');
const config = require('./config');
const GiftQueue = require('./giftQueue');

// TikTok manda los nombres de regalo en inglés y con apóstrofes tipográficos
// ("You’re amazing"), así que se normaliza todo antes de comparar: minúsculas,
// sin acentos, apóstrofes unificados y espacios colapsados.
function normalizarNombre(txt) {
    return String(txt || '')
        .toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[\u2018\u2019\u02bc\u00b4\u0060]/g, "'")
        .replace(/\s+/g, ' ')
        .trim();
}

// Índice construido una sola vez: nombre normalizado -> clave del catálogo
const indiceRegalos = {};
for (const clave of Object.keys(config.gifts)) {
    indiceRegalos[normalizarNombre(clave)] = clave;
    (config.gifts[clave].aliases || []).forEach(function (a) {
        indiceRegalos[normalizarNombre(a)] = clave;
    });
}

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

    // El .catch de connect() y el evento 'disconnected' podían programar dos
    // reintentos a la vez; en la v2 del conector eso lanza AlreadyConnecting y la
    // conexión se quedaba atascada. Ahora solo puede haber un reintento en curso.
    let conectando = false;
    let reintentoPendiente = null;

    function programarReintento() {
        if (reintentoPendiente) return;
        reintentoPendiente = setTimeout(() => {
            reintentoPendiente = null;
            connect();
        }, 10000);
    }

    function connect() {
        if (conectando) return;
        conectando = true;
        tiktokLiveConnection.connect().then(state => {
            conectando = false;
            console.info(`Conectado al stream de TikTok Live: ${state.roomId}`);
            io.emit('tiktok_feed', `🟢 Conectado al LIVE de @${tiktokUsername}`);
        }).catch(err => {
            conectando = false;
            console.error(`Error conectando a TikTok Live de ${tiktokUsername}:`,
                          err && err.message ? err.message : err);
            programarReintento();
        });
    }

    connect();

    tiktokLiveConnection.on('disconnected', () => {
        console.log(`Desconectado del LIVE de ${tiktokUsername}. Reintentando...`);
        io.emit('tiktok_feed', `🔴 Desconectado. Reintentando conexión...`);
        programarReintento();
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
        
        const giftKey = indiceRegalos[normalizarNombre(giftName)] || null;
        const infoRegalo = giftKey ? config.gifts[giftKey] : null;

        // Antes un regalo sin asignar se descartaba sin dejar rastro, lo que hacía
        // imposible diagnosticar por qué el mapa no se movía. Ahora cada motivo de
        // descarte queda escrito en el log.
        if (!infoRegalo) {
            console.warn(`[REGALO SIN ASIGNAR] "${giftName}" no figura en config.gifts. ` +
                         `Agrégalo como alias del país que corresponda para que mueva el mapa.`);
            return;
        }

        if (infoRegalo.tipo === "apocalipsis") {
            console.log(`[!] Evento especial activado por ${nickname} con ${giftName}`);
            io.emit('lluvia_de_bombas', { usuario: nickname, regalo: giftName, cantidad: 10 });
            return;
        }

        const paisRegalo = infoRegalo.pais;
        const fuerzaBase = infoRegalo.fuerza;

        const realAtacanteId = gameEngine.getOwnerReal(paisRegalo);
        const estadoActual = gameEngine.getEstadoActual();
        const paisAtacante = estadoActual[realAtacanteId];

        if (!paisAtacante || paisAtacante.eliminado) {
            console.warn(`[REGALO PERDIDO] "${giftName}" apunta a ${paisRegalo} ` +
                         `(dueño real: ${realAtacanteId}), que no está disponible.`);
            return;
        }

        const vecinos = paisAtacante.vecinos;
        if (vecinos.length === 0) {
            console.warn(`[REGALO PERDIDO] ${paisAtacante.nombre} no tiene vecinos vivos.`);
            return;
        }

        const porcentajeInvasion = fuerzaBase / 100;
        // Respaldo por si el grid del cliente todavía no puede elegir objetivo
        const respaldo = vecinos[Math.floor(Math.random() * vecinos.length)];

        console.log(`  -> ${paisAtacante.nombre} empuja el mapa (x${multiplicador})`);

        // Un ataque por cada regalo del combo: 20 rosas = 20 empujones.
        for (let i = 0; i < multiplicador; i++) {
            queueManager.addEvent({
                atacante: realAtacanteId,
                defensor: respaldo,
                vecinos: vecinos,
                porcentaje: porcentajeInvasion,
                usuario: nickname,
                regalo: giftName,
                multiplicador: i === 0 ? multiplicador : 1, // El primero muestra el combo total
                ocultarAlerta: i > 0, // Solo el primer golpe muestra el popup gigante
                nombrePais: paisAtacante.nombre
            });
        }
    });

    tiktokLiveConnection.on('like', data => {
        io.emit('tiktok_feed', `❤️ ${data.nickname} dio like al stream`);
    });

    return tiktokLiveConnection;
}

module.exports = connectToTikTokUser;
