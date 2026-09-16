// Inicializar el Mapa SVG (actúa como máscara y UI interactiva)
const mapaInteractivos = new MapaGeografico('#map-svg-container');

// Conexión Socket.IO apuntando al Backend separado
const backendUrl = window.CONFIG && window.CONFIG.BACKEND_URL ? window.CONFIG.BACKEND_URL : undefined;
const socket = io(backendUrl, { transports: ['websocket', 'polling'] });

// Configuración Multi-Streamer
const urlParams = new URLSearchParams(window.location.search);
const tiktokUser = urlParams.get('user');

if (!tiktokUser) {
    alert("¡Atención! Para conectar a TikTok Live, debes añadir tu usuario a la URL. Ejemplo: tuyo.com/?user=MiUsuario");
}

// Se pide el stream en CADA conexión, no solo al cargar la página. Si el backend
// se reinicia (un redespliegue, por ejemplo), Socket.IO reconecta solo pero el
// servidor ya no tiene el stream: sin este reenvío el overlay se queda mudo para
// siempre, sin avisar, en mitad de una transmisión.
socket.on('connect', () => {
    if (tiktokUser) {
        console.log('Conectado al backend. Solicitando stream de', tiktokUser);
        socket.emit('iniciar_stream', tiktokUser);
    }
});

let estadoGlobal = {};

function getOwnerReal(idPais) {
    let current = estadoGlobal[idPais];
    while (current && current.owner !== current.id && estadoGlobal[current.owner]) {
        current = estadoGlobal[current.owner];
    }
    return current ? current.id : idPais;
}

socket.on('estado_inicial', (estado) => {
    estadoGlobal = estado;
    actualizarInterfazUI(estado);
    
    // Si el grid ya está listo, lo sincronizamos
    if (window.gridManager && window.gridManager.numCells > 0) {
        window.gridManager.syncEstado(estado);
    } else {
        window.addEventListener('gridListo', () => window.gridManager.syncEstado(estado));
    }
});

socket.on('juego_reiniciado', () => {
    console.log("El juego ha sido reiniciado. Recargando...");
    location.reload(); 
});

socket.on('lluvia_de_bombas', (data) => {
    // 1. Mostrar alerta masiva (pero no ocultamos la UI entera como antes)
    mostrarAlertaGigante(data.usuario, data.regalo, "∞", "EVENTO ESPECIAL");
    const container = document.getElementById('giant-alert-container');
    if (container) {
        container.classList.add('apocalipsis-theme'); 
    }

    // 2. Disparar bombardeo en el Grid
    if (window.gridManager) {
        window.gridManager.lanzarBombas(data.cantidad || 10);
    }
});

// ================= EVENTO AMBIENTAL DE MAPA =================
// Efecto decorativo. No altera el valor de los regalos ni lleva contador.
socket.on('evento_mapa', (data) => {
    const banner = document.getElementById('event-banner');
    if (!banner) return;

    if (data.activo) {
        banner.style.display = 'block';
        if (window.gridManager) window.gridManager.iniciarTormenta();
    } else {
        banner.style.display = 'none';
        if (window.gridManager) window.gridManager.detenerTormenta();
    }
});

window.addEventListener('mapaListo', () => {
    // Ya no re-aplicamos colores al SVG, todo lo hace el Canvas subyacente.
    // Solo sincronizamos el estado global de UI
});

// ================= GUERRA Y EVENTOS =================

function agregarEventoFeed(mensaje) {
    const feed = document.getElementById('event-feed');
    const msgDiv = document.createElement('div');
    msgDiv.className = 'event-msg';
    msgDiv.innerText = mensaje;
    feed.appendChild(msgDiv);

    setTimeout(() => {
        msgDiv.style.opacity = '0';
        setTimeout(() => msgDiv.remove(), 500);
    }, 5000);
}

socket.on('tiktok_feed', (mensaje) => {
    agregarEventoFeed(mensaje);
});

// Racha de un país: regalos consecutivos dentro de una ventana corta.
// No ocupa espacio nuevo, se muestra dentro de la barra de guerra existente.
const RACHA_VENTANA_MS = 8000;
let racha = { pais: null, cuenta: 0, ultimo: 0 };

function registrarRacha(paisId) {
    const ahora = Date.now();
    if (racha.pais === paisId && ahora - racha.ultimo <= RACHA_VENTANA_MS) {
        racha.cuenta++;
    } else {
        racha = { pais: paisId, cuenta: 1, ultimo: ahora };
    }
    racha.ultimo = ahora;
    return racha.cuenta;
}

// Escuchar los eventos del GiftQueue del backend
socket.on('attack', (data) => {
    const { atacante, porcentaje, usuario, regalo, multiplicador, nombrePais } = data;

    // Quién defiende lo decide el grid, que es la fuente de verdad del territorio:
    // se prioriza al vecino que retenga territorio original del atacante.
    let defensor = data.defensor;
    if (window.gridManager && window.gridManager.numCells > 0 && data.vecinos) {
        const elegido = window.gridManager.elegirObjetivo(atacante, data.vecinos);
        // Ningún vecino conserva territorio: no hay nada que atacar. Se corta aquí
        // para no disparar alertas ni mover la cámara sobre países inexistentes.
        if (!elegido) return;
        defensor = elegido;
    }

    const atacanteObj = estadoGlobal[atacante];
    const defensorObj = estadoGlobal[defensor];
    if (!atacanteObj || !defensorObj) return; // El estado inicial todavía no llegó

    // Racha: el mapa reacciona más fuerte cuando un país recibe regalos seguidos
    const enRacha = registrarRacha(atacante);
    const streakEl = document.getElementById('war-streak');
    if (streakEl) {
        streakEl.innerText = enRacha >= 3 ? `🔥 x${enRacha}` : '';
        streakEl.style.display = enRacha >= 3 ? 'inline' : 'none';
    }
    if (window.gridManager && (enRacha === 3 || (enRacha > 3 && enRacha % 5 === 0))) {
        window.gridManager.pulsoPais(atacante);
    }
    
    // 1. Mostrar Alerta Gigante en Pantalla solo si no está oculta (combos)
    if (!data.ocultarAlerta) {
        mostrarAlertaGigante(usuario, regalo, multiplicador, nombrePais);
    }

    // 2. UI: Mostrar barra de guerra brevemente
    const warBar = document.getElementById('war-bar-container');
    warBar.classList.remove('hidden');
    document.getElementById('war-attacker').innerText = atacanteObj.nombre;
    document.getElementById('war-defender').innerText = defensorObj.nombre;
    
    mapaInteractivos.setEstadoGuerra(atacante, 'atacante', true);
    mapaInteractivos.setEstadoGuerra(defensor, 'defensor', true);

    // 3. Grid.js manejará el daño celular progresivo
    if (window.gridManager) {
        window.gridManager.iniciarInfeccion(atacante, defensor, porcentaje);
    }

    // Registrar batalla activa para controlar la cámara
    window.batallasActivas = window.batallasActivas || new Set();
    const battleId = `${atacante}-${defensor}`;
    window.batallasActivas.add(battleId);
    
    // Remover de la lista activa después del impacto principal
    setTimeout(() => {
        if (window.batallasActivas) window.batallasActivas.delete(battleId);
    }, 2500);

    // 4. Zoom automático inteligente (Directorio de cámaras)
    if (mapaInteractivos) {
        const defensoresActivos = new Set(Array.from(window.batallasActivas).map(b => b.split('-')[1]));
        
        if (defensoresActivos.size > 1) {
            // Múltiples zonas de guerra simultáneas: Mostrar panorama completo
            mapaInteractivos.zoomRestaurar(1200);
            if (window.zoomResetTimeout) clearTimeout(window.zoomResetTimeout);
        } else {
            // Foco exclusivo en el único defensor atacado
            mapaInteractivos.zoomAPais(defensor, 1500, 3.8); 

            if (window.zoomResetTimeout) clearTimeout(window.zoomResetTimeout);
            window.zoomResetTimeout = setTimeout(() => {
                // Solo alejar la cámara si la guerra se detuvo verdaderamente
                if (!window.batallasActivas || window.batallasActivas.size === 0) {
                    mapaInteractivos.zoomRestaurar(2500);
                }
            }, 6000); 
        }
    }

    // 5. Agregar al feed pequeño lateral
    if (!data.ocultarAlerta) {
        agregarEventoFeed(`💥 ${atacanteObj.nombre} empuja la frontera con ${defensorObj.nombre}`);
    }
    
    setTimeout(() => {
        warBar.classList.add('hidden');
        mapaInteractivos.setEstadoGuerra(atacante, 'atacante', false);
        mapaInteractivos.setEstadoGuerra(defensor, 'defensor', false);
    }, 1000);
});

// Anuncio de un evento del mapa: no hay usuario ni regalo detrás, así que no
// usa la plantilla de "X envió Y".
function mostrarAnuncio(titulo, subtitulo) {
    const container = document.getElementById('giant-alert-container');
    if (!container) return;

    while (container.children.length >= 3) container.removeChild(container.firstChild);

    const el = document.createElement('div');
    el.className = 'giant-alert';
    el.innerHTML = `
        <div class="giant-alert-gift">${titulo}</div>
        <div class="giant-alert-action">${subtitulo}</div>
    `;
    container.appendChild(el);
    setTimeout(() => el.remove(), 2500);
}

// Un país arrasado por el evento especial queda en ruinas, no eliminado.
// Fin de partida: el backend reinicia solo 12 segundos después.
socket.on('juego_terminado', (data) => {
    mostrarAnuncio(`🏆 ${data.nombre.toUpperCase()}`, 'conquistó todo el mapa');
    agregarEventoFeed(`🏆 ${data.nombre} gana la partida`);
    if (mapaInteractivos) mapaInteractivos.zoomRestaurar(2000);
});

window.addEventListener('pais_arrasado', (e) => {
    const pais = estadoGlobal[e.detail.pais];
    if (!pais) return;
    mostrarAnuncio(`☠️ ${pais.nombre.toUpperCase()}`, 'ha sido borrado del mapa');
    agregarEventoFeed(`☠️ ${pais.nombre} queda en ruinas`);
});

window.addEventListener('pais_resurgido', (e) => {
    const pais = estadoGlobal[e.detail.pais];
    if (!pais) return;
    mostrarAnuncio(`✨ ${pais.nombre.toUpperCase()}`, 'ha resurgido de las ruinas');
    agregarEventoFeed(`✨ ${pais.nombre} vuelve al mapa`);
    if (mapaInteractivos) mapaInteractivos.zoomAPais(e.detail.pais, 1500, 3.5);
});

function mostrarAlertaGigante(usuario, regalo, multiplicador, nombrePais) {
    let container = document.getElementById('giant-alert-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'giant-alert-container';
        document.getElementById('ui-layer').appendChild(container);
    }

    // Limitar máximo a 3 alertas simultáneas para no invadir la pantalla
    while (container.children.length >= 3) {
        container.removeChild(container.firstChild);
    }

    const alertEl = document.createElement('div');
    alertEl.className = 'giant-alert';
    
    // Obtener ícono según el regalo
    let icono = "🎁";
    if (regalo === "Rosa" || regalo === "White Rose") icono = "🌹";
    if (regalo === "Alas Guardianas") icono = "🪽";
    if (regalo === "TikTok") icono = "🌈";
    if (regalo === "Un fragmento de mí" || regalo === "Un fragmento de mi") icono = "🐱";
    if (regalo === "GG") icono = "🎮";
    if (regalo === "Eres increíble" || regalo === "Eres increible") icono = "😻";
    if (regalo === "Cono de helado" || regalo === "Ice Cream") icono = "🍦";
    if (regalo === "Estilo libre") icono = "🎹";
    if (regalo === "Cake Slice") icono = "🍰";
    if (regalo === "Maracas") icono = "🪘";
    if (regalo === "Guiño guiño") icono = "😉";
    if (regalo === "Pop") icono = "👾";
    if (regalo === "Clásicos") icono = "📻";
    if (regalo === "Corazoncito") icono = "💖";
    if (regalo === "Te adoro") icono = "🥰";
    if (regalo === "It's corn") icono = "🌽";
    if (regalo === "Fútbol giratorio") icono = "⚽";
    if (regalo === "Fuegos artificiales") icono = "🎆";

    alertEl.innerHTML = `
        <div class="giant-alert-title"><span class="giant-alert-user">${usuario}</span> envió</div>
        <div class="giant-alert-gift">${multiplicador}x ${icono} ${regalo}</div>
        <div class="giant-alert-action">${nombrePais} avanza en el mapa</div>
    `;

    container.appendChild(alertEl);

    // Destruir alerta después de la animación de salida (2.3 segundos)
    setTimeout(() => {
        alertEl.remove();
    }, 2500);
}

socket.on('conquista_realizada', (data) => {
    // Los nombres se leen ANTES de reemplazar el estado, y con respaldo por si
    // el evento llega antes que el 'estado_inicial'.
    const atacanteObj = estadoGlobal[data.atacante];
    const defensorObj = estadoGlobal[data.defensor];
    const nombreAtacante = atacanteObj ? atacanteObj.nombre : data.atacante;
    const nombreDefensor = defensorObj ? defensorObj.nombre : data.defensor;

    // Adoptar el estado autoritativo del servidor. Sin esto el defensor nunca
    // queda marcado como eliminado en el cliente, sus vecinos quedan obsoletos
    // y 'victoria_total' se re-reporta en bucle sobre el mismo país.
    if (data.nuevoEstado) {
        estadoGlobal = data.nuevoEstado;
        if (window.gridManager && window.gridManager.numCells > 0) {
            window.gridManager.syncEstado(estadoGlobal);
        }
    }

    document.getElementById('war-bar-container').classList.add('hidden');

    mapaInteractivos.setEstadoGuerra(data.atacante, 'atacante', false);
    mapaInteractivos.setEstadoGuerra(data.defensor, 'defensor', false);

    agregarEventoFeed(`👑 ${nombreAtacante} se expandió sobre ${nombreDefensor}`);

    actualizarInterfazUI(estadoGlobal);
});

socket.on('conquista_fallida', (mensaje) => {
    console.warn('Conquista fallida:', mensaje);
});



function actualizarInterfazUI(estado) {
    const listaPaises = Object.values(estado).filter(p => !p.eliminado);
    const rankingArray = listaPaises.sort((a, b) => b.territorio - a.territorio || b.poder - a.poder);
    
    const rankingListEl = document.getElementById('ranking-list');
    rankingListEl.innerHTML = '';
    
    rankingArray.slice(0, 6).forEach((item, index) => {
        const li = document.createElement('li');
        li.innerHTML = `
            <span class="ranking-pos">#${index + 1}</span>
            <span class="ranking-name" style="color:${item.color}">${item.nombre}</span>
            <span class="ranking-score">${(item.territorio/100).toFixed(0)}k</span>
        `;
        rankingListEl.appendChild(li);
    });

    if (rankingArray.length > 0) {
        const lider = rankingArray[0];
        document.getElementById('dominante-name').innerText = lider.nombre.toUpperCase();
        document.getElementById('dominante-name').style.color = lider.color;
        
        // Suma de celdas de todos los países activos en juego para un porcentaje real
        const totalTerritorios = rankingArray.reduce((sum, p) => sum + p.territorio, 0) || 1;
        const porcentaje = (lider.territorio / totalTerritorios) * 100;
        
        const barFill = document.getElementById('poder-bar');
        if (barFill) {
            barFill.style.width = `${Math.min(100, porcentaje)}%`;
            barFill.style.background = lider.color;
            barFill.style.boxShadow = `0 0 10px ${lider.color}`;
        }
    }
}

window.addEventListener('victoria_total', (e) => {
    const { atacante, defensor } = e.detail;
    // Evitar múltiples reportes si ya lo consideramos eliminado
    if (estadoGlobal[defensor] && !estadoGlobal[defensor].eliminado) {
        console.log(`Reportando victoria total de ${atacante} sobre ${defensor}`);
        socket.emit('reportar_victoria_total', { atacante, defensor });
    }
});

// Bucle de sincronización de territorios (1 vez por segundo)
setInterval(() => {
    if (window.gridManager && window.gridManager.numCells > 0) {
        const conteos = window.gridManager.calcularTerritorios();
        let huboCambios = false;

        // Iterar sobre TODOS los países activos en el estado
        for (const paisStr in estadoGlobal) {
            if (!estadoGlobal[paisStr].eliminado) {
                const intId = window.gridManager.paisStrToInt[paisStr];
                const nuevoTerritorio = conteos[intId] || 0; // Si no está en conteos, es 0

                if (estadoGlobal[paisStr].territorio !== nuevoTerritorio) {
                    estadoGlobal[paisStr].territorio = nuevoTerritorio;
                    huboCambios = true;
                }
            }
        }

        if (huboCambios) {
            actualizarInterfazUI(estadoGlobal);
        }
    }
}, 1000);

// Escaramuzas / Patrullas ambientales periódicas (Mantiene la pantalla en movimiento constante)
setInterval(() => {
    if (typeof estadoGlobal === 'undefined' || !window.gridManager) return;

    const paisesKeys = Object.keys(estadoGlobal).filter(k => !estadoGlobal[k].eliminado);
    if (paisesKeys.length < 2) return;

    // Seleccionar un país al azar para hacer una patrulla ambiental
    const atacanteId = paisesKeys[Math.floor(Math.random() * paisesKeys.length)];
    const atacanteData = estadoGlobal[atacanteId];
    if (!atacanteData || !atacanteData.vecinos || atacanteData.vecinos.length === 0) return;

    const defensorId = atacanteData.vecinos[Math.floor(Math.random() * atacanteData.vecinos.length)];
    
    // Iluminar sutilmente la celda de la frontera
    const atacanteInt = window.gridManager.paisStrToInt[atacanteId];
    if (atacanteInt) {
        for (let i = 0; i < window.gridManager.numCells; i += 13) {
            if (window.gridManager.ownerGrid[i] === atacanteInt) {
                window.gridManager.glowGrid[i] = 180;
                break;
            }
        }
    }
}, 2500);

// ================= MÚSICA DE FONDO =================
const btnAudio = document.getElementById('btn-audio');
if (btnAudio) {
    btnAudio.addEventListener('click', (e) => {
        // Evitar que el click se propague y moleste a otros elementos
        e.stopPropagation();
        
        const bgMusic = document.getElementById('bg-music');
        if (bgMusic) {
            bgMusic.volume = 0.5; // Volumen moderado para no opacar el stream
            bgMusic.loop = true;  // Nos aseguramos por código que siempre esté en bucle
            bgMusic.currentTime = 0;

            bgMusic.play().then(() => {
                console.log("Música de fondo iniciada.");
                btnAudio.style.display = 'none'; // Ocultar el botón si tuvo éxito
            }).catch(e => {
                console.error("Error al iniciar la música:", e);
                alert("Hubo un error al reproducir la música. Fíjate en la consola (F12) o verifica que el archivo DAI-DAI.mp3 sea válido. Detalle: " + e.message);
            });
        }
    });
}

// ================= MIGRACIÓN Y MINIMIZADO DE LEYENDA =================
const btnToggleLegend = document.getElementById('btn-toggle-legend');
const legendBody = document.getElementById('legend-body');
const legendHeaderBar = document.getElementById('legend-header-bar');

if (btnToggleLegend && legendBody) {
    const toggleFunc = () => {
        const isCollapsed = legendBody.classList.toggle('collapsed');
        btnToggleLegend.innerText = isCollapsed ? '➕' : '➖';
    };
    btnToggleLegend.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleFunc();
    });
    if (legendHeaderBar) {
        legendHeaderBar.addEventListener('click', toggleFunc);
    }
}

// ================= ATAJOS DE TECLADO =================
document.addEventListener('keydown', (e) => {
    // Si presionas Shift + R, se reinicia el juego
    if (e.shiftKey && (e.key === 'r' || e.key === 'R')) {
        if (confirm('¿Estás seguro de que quieres reiniciar el estado del juego desde cero?')) {
            socket.emit('reset_juego');
        }
    }
});
