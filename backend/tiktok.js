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

// Convierte un regalo en ataques sobre el mapa. Se usa tanto para los regalos
// reales de TikTok como para los simulados del modo de prueba, para que ambos
// recorran exactamente el mismo camino.
function procesarRegalo(io, queueManager, giftName, nickname, multiplicador, etiqueta, opciones) {
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

    console.log(`  -> ${paisAtacante.nombre} empuja el mapa (x${multiplicador})${etiqueta || ''}`);

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
            // Solo el primer golpe muestra el popup gigante, y ninguno si el regalo
            // es la continuación de un combo que ya tuvo su alerta
            ocultarAlerta: (opciones && opciones.sinAlerta) || i > 0,
            nombrePais: paisAtacante.nombre
        });
    }
}


function connectToTikTokUser(tiktokUsername, io) {
    console.log(`Iniciando conexión con TikTok Live para @${tiktokUsername}...`);

    const queueManager = new GiftQueue(io);

    // El ciclo ambiental corre una sola vez por proceso, desligado de las donaciones
    if (!cicloEventoIniciado) {
        cicloEventoIniciado = true;
        iniciarCicloEventoMapa(io);
    }

    const tiktokLiveConnection = new WebcastPushConnection(tiktokUsername, {
        processInitialData: false,
        enableExtendedGiftInfo: true,
        enableWebsocketUpgrade: true,
        requestPollingIntervalMs: 2000,
        clientParams: {
            "app_language": "es"
        }
    });

    // Estado observable desde fuera (socket.js y la página /estado)
    tiktokLiveConnection.__usuario = tiktokUsername;
    tiktokLiveConnection.__conectado = false;
    tiktokLiveConnection.__creado = Date.now();
    tiktokLiveConnection.__roomId = null;
    tiktokLiveConnection.__conectadoDesde = null;
    tiktokLiveConnection.__eventos = 0;
    tiktokLiveConnection.__ultimoEvento = null;
    tiktokLiveConnection.__ultimoError = null;
    tiktokLiveConnection.__regalosCrudos = [];

    const registrarEvento = () => {
        tiktokLiveConnection.__eventos++;
        tiktokLiveConnection.__ultimoEvento = Date.now();
    };

    // El .catch de connect() y el evento 'disconnected' podían programar dos
    // reintentos a la vez; en la v2 del conector eso lanza AlreadyConnecting y la
    // conexión se quedaba atascada. Solo puede haber un reintento en curso.
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
            tiktokLiveConnection.__conectado = true;
            tiktokLiveConnection.__roomId = String(state.roomId);
            tiktokLiveConnection.__conectadoDesde = Date.now();
            tiktokLiveConnection.__ultimoError = null;
            console.info(`Conectado al stream de TikTok Live: ${state.roomId}`);
            io.emit('tiktok_feed', `🟢 Conectado al LIVE de @${tiktokUsername}`);
        }).catch(err => {
            conectando = false;
            tiktokLiveConnection.__conectado = false;
            const motivo = err && err.message ? err.message : String(err);
            tiktokLiveConnection.__ultimoError = motivo;
            // Que el usuario aún no haya iniciado su live es lo normal mientras se
            // espera, así que se registra como una línea limpia y no como un error.
            if (/isn't online|not online|offline/i.test(motivo)) {
                console.log(`Esperando a que @${tiktokUsername} inicie su live...`);
            } else {
                console.error(`Error conectando a TikTok Live de ${tiktokUsername}:`, motivo);
            }
            programarReintento();
        });
    }

    // Suelta la conexión actual y vuelve a conectar desde cero. Al desconectarse,
    // la librería borra la sala guardada, así que el nuevo intento busca la sala
    // del live vigente.
    function reconectarDesdeCero(motivo) {
        console.log(`[${tiktokUsername}] ${motivo} Reconectando desde cero...`);
        tiktokLiveConnection.__conectado = false;
        Promise.resolve()
            .then(() => tiktokLiveConnection.disconnect())
            .catch(() => { /* ya estaba cerrada */ })
            .then(() => programarReintento());
    }

    connect();

    tiktokLiveConnection.on('disconnected', () => {
        tiktokLiveConnection.__conectado = false;
        console.log(`Desconectado del LIVE de ${tiktokUsername}. Reintentando...`);
        io.emit('tiktok_feed', `🔴 Desconectado. Reintentando conexión...`);
        programarReintento();
    });

    // El live terminó: se suelta la sala para no quedarse escuchando una muerta
    tiktokLiveConnection.on('streamEnd', () => {
        reconectarDesdeCero('El live terminó.');
    });

    tiktokLiveConnection.on('error', err => {
        console.error('Error en conexión TikTok:', err && err.info ? err.info : err);
    });

    // Vigilante de sala: si el live se cerró de golpe y se abrió otro, TikTok no
    // siempre avisa, y la conexión se queda "conectada" a la sala vieja sin recibir
    // nada. Cada minuto se compara con la sala vigente del usuario.
    const vigilanteSala = setInterval(async () => {
        if (!tiktokLiveConnection.__conectado || conectando) return;
        try {
            const salaActual = String(await tiktokLiveConnection.fetchRoomId());
            if (salaActual && tiktokLiveConnection.__roomId && salaActual !== tiktokLiveConnection.__roomId) {
                reconectarDesdeCero(`Sala vieja ${tiktokLiveConnection.__roomId}, el live vigente es ${salaActual}.`);
            }
        } catch (e) {
            // No se pudo consultar la sala: se reintenta en el siguiente minuto
        }
    }, 60000);
    if (vigilanteSala.unref) vigilanteSala.unref();

    // Combos de regalo en curso: cuántos toques de cada racha ya se aplicaron
    const rachasEnCurso = new Map();

    tiktokLiveConnection.on('gift', data => {
        registrarEvento();

        // Registro crudo ANTES de cualquier filtro, para poder ver en /estado que
        // el regalo llegó aunque luego se descarte (por ejemplo, a mitad de racha).
        tiktokLiveConnection.__regalosCrudos.unshift({
            hora: new Date().toISOString(),
            regalo: data.giftName,
            usuario: data.nickname,
            cantidad: data.repeatCount,
            tipo: data.giftType,
            finDeRacha: data.repeatEnd
        });
        tiktokLiveConnection.__regalosCrudos.length = Math.min(tiktokLiveConnection.__regalosCrudos.length, 15);

        const giftName = data.giftName;
        const nickname = data.nickname;
        const total = data.repeatCount ? data.repeatCount : 1;

        // Regalos sin combo: se aplican tal cual
        if (data.giftType !== 1) {
            console.log(`[${tiktokUsername}] Regalo recibido: ${total}x ${giftName} de ${nickname}`);
            procesarRegalo(io, queueManager, giftName, nickname, total);
            return;
        }

        // Regalos de combo (Rosa, TikTok...): TikTok manda un evento por cada toque
        // con el contador acumulado y otro al cerrar la racha, 3 o 4 segundos
        // después. Antes se esperaba a ese cierre y el mapa reaccionaba tarde. Ahora
        // en cada evento se aplica solo lo nuevo desde el anterior: el mapa responde
        // al primer toque y el combo no se cuenta dos veces.
        const clave = `${data.userId || data.uniqueId || nickname}|${data.giftId || giftName}`;
        const ahora = Date.now();
        let racha = rachasEnCurso.get(clave);
        // Racha nueva si no había, si el contador volvió a empezar o si la anterior
        // quedó abandonada sin evento de cierre
        if (!racha || total < racha.aplicados || ahora - racha.ultimo > 15000) {
            racha = { aplicados: 0, ultimo: ahora };
        }
        const nuevos = total - racha.aplicados;
        const esPrimerToque = racha.aplicados === 0;
        racha.aplicados = total;
        racha.ultimo = ahora;

        if (data.repeatEnd) rachasEnCurso.delete(clave);
        else rachasEnCurso.set(clave, racha);

        // Limpieza de rachas abandonadas para que el mapa no crezca sin límite
        if (rachasEnCurso.size > 200) {
            for (const [k, r] of rachasEnCurso) if (ahora - r.ultimo > 60000) rachasEnCurso.delete(k);
        }

        if (nuevos <= 0) return;

        console.log(`[${tiktokUsername}] Regalo recibido: +${nuevos}x ${giftName} de ${nickname} ` +
                    `(combo x${total}${data.repeatEnd ? ', cerrado' : ''})`);
        procesarRegalo(io, queueManager, giftName, nickname, nuevos, '', { sinAlerta: !esPrimerToque });
    });

    tiktokLiveConnection.on('like', data => {
        registrarEvento();
        io.emit('tiktok_feed', `❤️ ${data.nickname} dio like al stream`);
    });
    tiktokLiveConnection.on('member', registrarEvento);
    tiktokLiveConnection.on('chat', registrarEvento);
    tiktokLiveConnection.on('social', registrarEvento);

    return tiktokLiveConnection;
}

module.exports = connectToTikTokUser;
module.exports.procesarRegalo = procesarRegalo;
