const { Server } = require('socket.io');
const gameEngine = require('./gameEngine');
const connectToTikTokUser = require('./tiktok');

function setupSocket(server) {
    const io = new Server(server, {
        cors: {
            origin: process.env.FRONTEND_URL || "*",
            methods: ["GET", "POST"],
            credentials: true
        }
    });

    // Mapa de conexiones activas para evitar duplicados en producción
    const activeStreams = new Map();

    // Evita disparar dos finales si llegan varios reportes de victoria juntos
    let finalEnCurso = false;

    io.on('connection', (socket) => {
        console.log('Un cliente se ha conectado:', socket.id);

        // Enviar el estado inicial a quien se conecte
        socket.emit('estado_inicial', gameEngine.getEstadoActual());

        // Evento lanzado por el Frontend cuando detecta ?user=ALGUIEN
        socket.on('iniciar_stream', (username) => {
            if (!username) return;

            username = username.toLowerCase().replace('@', '');
            console.log(`Solicitud para iniciar stream de: ${username}`);

            const existente = activeStreams.get(username);

            if (existente) {
                const vivo = existente.__conectado === true;
                // Margen para que una conexión recién creada termine de establecerse
                // sin que otro cliente la tumbe a mitad del intento.
                const reciente = (Date.now() - (existente.__creado || 0)) < 30000;

                if (vivo || reciente) {
                    console.log(`El stream de ${username} ya está ${vivo ? 'conectado' : 'conectando'}.`);
                    return;
                }

                // Conexión zombi: se registró pero nunca llegó a conectarse (por
                // ejemplo, se pidió antes de que el usuario iniciara su live). Si no
                // se descarta, bloquea para siempre cualquier intento nuevo y hay
                // que reiniciar el servidor a mano.
                console.log(`Descartando conexión muerta de ${username} y reintentando...`);
                try {
                    if (typeof existente.disconnect === 'function') existente.disconnect();
                } catch (e) { /* ya estaba rota */ }
                activeStreams.delete(username);
            }

            console.log(`Conectando nuevo stream para ${username}...`);
            activeStreams.set(username, connectToTikTokUser(username, io));
        });

        // Evento de prueba desde el cliente
        socket.on('test_ataque_parcial', (data) => {
            const { atacante, defensor } = data;

            const estadoActual = gameEngine.getEstadoActual();
            const realAtacanteId = gameEngine.getOwnerReal(atacante);
            const realDefensorId = gameEngine.getOwnerReal(defensor);
            const paisAtacante = estadoActual[realAtacanteId];

            if (!paisAtacante || paisAtacante.eliminado || realAtacanteId === realDefensorId) return;

            if (!paisAtacante.vecinos.includes(realDefensorId)) return;

            io.emit('aplicar_ataque_parcial', { atacante: realAtacanteId, defensor: realDefensorId, porcentaje: 0.05 });
        });

        socket.on('reportar_victoria_total', (data) => {
            const { atacante, defensor } = data;
            const resultado = gameEngine.procesarConquista(atacante, defensor);
            if (resultado.exito) {
                io.emit('conquista_realizada', {
                    atacante,
                    defensor,
                    nuevoEstado: gameEngine.getEstadoActual()
                });

                // Fin de partida: un solo superviviente. Se anuncia y se reinicia
                // solo, para que la transmisión arranque una ronda nueva.
                const ganador = gameEngine.hayGanador();
                if (ganador && !finalEnCurso) {
                    finalEnCurso = true;
                    console.log(`[JUEGO] ${ganador.nombre} conquistó el mapa. Reinicio en 12s.`);
                    io.emit('juego_terminado', { id: ganador.id, nombre: ganador.nombre });

                    setTimeout(() => {
                        io.emit('estado_inicial', gameEngine.reiniciarEstado());
                        io.emit('juego_reiniciado');
                        finalEnCurso = false;
                    }, 12000);
                }
            }
        });

        // El cliente es quien ve el territorio real (el grid), así que es quien
        // detecta que un solo país conserva celdas en todo el mapa.
        socket.on('reportar_dominio_total', (data) => {
            if (finalEnCurso || !data || !data.ganador) return;

            const ganador = gameEngine.declararDominioTotal(data.ganador);
            if (!ganador) return;

            finalEnCurso = true;
            console.log(`[JUEGO] ${ganador.nombre} domina todo el mapa. Reinicio en 12s.`);

            io.emit('conquista_realizada', {
                atacante: ganador.id,
                defensor: ganador.id,
                nuevoEstado: gameEngine.getEstadoActual()
            });
            io.emit('juego_terminado', { id: ganador.id, nombre: ganador.nombre });

            setTimeout(() => {
                io.emit('estado_inicial', gameEngine.reiniciarEstado());
                io.emit('juego_reiniciado');
                finalEnCurso = false;
            }, 12000);
        });

        socket.on('reset_juego', () => {
            const nuevoEstado = gameEngine.reiniciarEstado();
            io.emit('estado_inicial', nuevoEstado);
            io.emit('juego_reiniciado');
        });

        socket.on('disconnect', () => {
            console.log('Cliente desconectado:', socket.id);
        });
    });

    return io;
}

module.exports = setupSocket;

