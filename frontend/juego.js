// Inicializar el Mapa SVG (actúa como máscara y UI interactiva)
const mapaInteractivos = new MapaGeografico('#map-svg-container');

// Conexión Socket.IO apuntando al Backend separado
const backendUrl = window.CONFIG && window.CONFIG.BACKEND_URL ? window.CONFIG.BACKEND_URL : undefined;
const socket = io(backendUrl, { transports: ['websocket', 'polling'] });

// Configuración Multi-Streamer
const urlParams = new URLSearchParams(window.location.search);
const tiktokUser = urlParams.get('user');

if (tiktokUser) {
    socket.emit('iniciar_stream', tiktokUser);
} else {
    alert("¡Atención! Para conectar a TikTok Live, debes añadir tu usuario a la URL. Ejemplo: tuyo.com/?user=MiUsuario");
}

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
    mostrarAlertaGigante(data.usuario, data.regalo, "∞", "LLUVIA DE BOMBAS");
    const container = document.getElementById('giant-alert-container');
    if (container) {
        container.classList.add('apocalipsis-theme'); 
    }

    // 2. Disparar bombardeo en el Grid
    if (window.gridManager) {
        window.gridManager.lanzarBombas(data.cantidad || 10);
    }
});

// ================= ESTADO X2 =================
let x2Interval = null;
socket.on('x2_estado', (data) => {
    const banner = document.getElementById('x2-banner');
    const timerSpan = document.getElementById('x2-timer');
    if (!banner || !timerSpan) return;

    if (data.activo) {
        banner.style.display = 'block';
        let timeLeft = Math.floor(data.duracion / 1000);
        
        // Actualizar UI inicial
        const m = Math.floor(timeLeft / 60).toString().padStart(2, '0');
        const s = (timeLeft % 60).toString().padStart(2, '0');
        timerSpan.innerText = `${m}:${s}`;

        if (x2Interval) clearInterval(x2Interval);
        
        x2Interval = setInterval(() => {
            timeLeft--;
            if (timeLeft <= 0) {
                clearInterval(x2Interval);
            }
            const mins = Math.floor(timeLeft / 60).toString().padStart(2, '0');
            const secs = (timeLeft % 60).toString().padStart(2, '0');
            timerSpan.innerText = `${mins}:${secs}`;
        }, 1000);

        // Alerta inicial para llamar la atención
        mostrarAlertaGigante("SISTEMA", "X2", "2x", "¡FRENESÍ! TODO VALE DOBLE");
    } else {
        banner.style.display = 'none';
        if (x2Interval) clearInterval(x2Interval);
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

// Escuchar los eventos del GiftQueue del backend
socket.on('attack', (data) => {
    const { atacante, defensor, porcentaje, usuario, regalo, multiplicador, nombrePais } = data;
    const atacanteObj = estadoGlobal[atacante];
    const defensorObj = estadoGlobal[defensor];
    
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
        agregarEventoFeed(`💥 ${atacanteObj.nombre} empuja la frontera sobre ${defensorObj.nombre}!`);
    }
    
    setTimeout(() => {
        warBar.classList.add('hidden');
        mapaInteractivos.setEstadoGuerra(atacante, 'atacante', false);
        mapaInteractivos.setEstadoGuerra(defensor, 'defensor', false);
    }, 1000);
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
        <div class="giant-alert-action">¡ATAQUE MASIVO POR ${nombrePais}!</div>
    `;

    container.appendChild(alertEl);

    // Destruir alerta después de la animación de salida (2.3 segundos)
    setTimeout(() => {
        alertEl.remove();
    }, 2500);
}

socket.on('conquista_realizada', (data) => {
    const atacanteObj = estadoGlobal[data.atacante];
    const defensorObj = estadoGlobal[data.defensor];
    
    document.getElementById('war-bar-container').classList.add('hidden');

    mapaInteractivos.setEstadoGuerra(data.atacante, 'atacante', false);
    mapaInteractivos.setEstadoGuerra(data.defensor, 'defensor', false);

    agregarEventoFeed(`👑 ${atacanteObj.nombre} ha asimilado completamente a ${defensorObj.nombre}!`);

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

// ================= ATAJOS DE TECLADO =================
document.addEventListener('keydown', (e) => {
    // Si presionas Shift + R, se reinicia el juego
    if (e.shiftKey && (e.key === 'r' || e.key === 'R')) {
        if (confirm('¿Estás seguro de que quieres reiniciar el estado del juego desde cero?')) {
            socket.emit('reset_juego');
        }
    }
});
