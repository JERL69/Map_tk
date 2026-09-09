// Estado inicial de los países
const estadoPaises = {
    mexico: { id: 'mexico', nombre: 'México', color: '#1B5E20', poder: 100, territorio: 100, eliminado: false, owner: 'mexico', vecinos: ['el_salvador'] },
    el_salvador: { id: 'el_salvador', nombre: 'El Salvador', color: '#1E40AF', poder: 100, territorio: 100, eliminado: false, owner: 'el_salvador', vecinos: ['mexico', 'costa_rica'] },
    costa_rica: { id: 'costa_rica', nombre: 'Costa Rica', color: '#F43F5E', poder: 100, territorio: 100, eliminado: false, owner: 'costa_rica', vecinos: ['el_salvador', 'panama'] },
    panama: { id: 'panama', nombre: 'Panamá', color: '#14B8A6', poder: 100, territorio: 100, eliminado: false, owner: 'panama', vecinos: ['costa_rica', 'colombia'] },
    colombia: { id: 'colombia', nombre: 'Colombia', color: '#EAB308', poder: 100, territorio: 100, eliminado: false, owner: 'colombia', vecinos: ['panama', 'venezuela', 'brasil', 'ecuador', 'peru'] },
    venezuela: { id: 'venezuela', nombre: 'Venezuela', color: '#722F37', poder: 100, territorio: 100, eliminado: false, owner: 'venezuela', vecinos: ['colombia', 'brasil'] },
    ecuador: { id: 'ecuador', nombre: 'Ecuador', color: '#0284C7', poder: 100, territorio: 100, eliminado: false, owner: 'ecuador', vecinos: ['colombia', 'peru'] },
    peru: { id: 'peru', nombre: 'Perú', color: '#EC4899', poder: 100, territorio: 100, eliminado: false, owner: 'peru', vecinos: ['ecuador', 'colombia', 'brasil', 'bolivia', 'chile'] },
    brasil: { id: 'brasil', nombre: 'Brasil', color: '#22C55E', poder: 100, territorio: 100, eliminado: false, owner: 'brasil', vecinos: ['venezuela', 'colombia', 'peru', 'bolivia', 'paraguay', 'argentina', 'uruguay'] },
    bolivia: { id: 'bolivia', nombre: 'Bolivia', color: '#F97316', poder: 100, territorio: 100, eliminado: false, owner: 'bolivia', vecinos: ['peru', 'brasil', 'paraguay', 'argentina', 'chile'] },
    paraguay: { id: 'paraguay', nombre: 'Paraguay', color: '#7E22CE', poder: 100, territorio: 100, eliminado: false, owner: 'paraguay', vecinos: ['bolivia', 'brasil', 'argentina'] },
    chile: { id: 'chile', nombre: 'Chile', color: '#DC2626', poder: 100, territorio: 100, eliminado: false, owner: 'chile', vecinos: ['peru', 'bolivia', 'argentina'] },
    argentina: { id: 'argentina', nombre: 'Argentina', color: '#38BDF8', poder: 100, territorio: 100, eliminado: false, owner: 'argentina', vecinos: ['chile', 'bolivia', 'paraguay', 'brasil', 'uruguay'] },
    uruguay: { id: 'uruguay', nombre: 'Uruguay', color: '#FCD34D', poder: 100, territorio: 100, eliminado: false, owner: 'uruguay', vecinos: ['argentina', 'brasil'] }
};

const estadoInicialStr = JSON.stringify(estadoPaises);

// El juego no tiene objetivos automáticos: el territorio solo cambia cuando
// llega un regalo, y quién defiende lo decide el grid del cliente según quién
// tenga territorio original del atacante.

function reiniciarEstado() {
    const estadoLimpio = JSON.parse(estadoInicialStr);
    for (let key in estadoPaises) {
        estadoPaises[key] = estadoLimpio[key];
    }
    return estadoPaises;
}

function getEstadoActual() {
    return estadoPaises;
}

function getOwnerReal(idPais) {
    let current = estadoPaises[idPais];
    // Rastrear recursivamente si el owner fue conquistado por otro
    while (current && current.owner !== current.id && estadoPaises[current.owner]) {
        current = estadoPaises[current.owner];
    }
    return current ? current.id : idPais;
}

function procesarConquista(atacanteId, defensorId) {
    const atacante = estadoPaises[atacanteId];
    const defensor = estadoPaises[defensorId];

    if (!atacante || !defensor || defensor.eliminado) {
        return { exito: false, mensaje: "País no encontrado o ya eliminado" };
    }

    // Verificar si son vecinos directos (la lógica dinámica de fronteras)
    const esVecino = atacante.vecinos.includes(defensorId);

    if (!esVecino) {
        return { exito: false, mensaje: "No son vecinos directos en el mapa dinámico" };
    }

    // Fusión de países (defensor desaparece y atacante absorbe sus propiedades)
    defensor.eliminado = true;
    defensor.owner = atacanteId;
    
    atacante.poder += 10;
    atacante.territorio += defensor.territorio;
    defensor.territorio = 0;

    // Actualizar fronteras dinámicamente
    const nuevosVecinos = new Set([...atacante.vecinos, ...defensor.vecinos]);
    nuevosVecinos.delete(atacanteId);
    nuevosVecinos.delete(defensorId);
    atacante.vecinos = Array.from(nuevosVecinos);

    // Actualizar referencias en el resto del mundo
    for (const key in estadoPaises) {
        if (!estadoPaises[key].eliminado && estadoPaises[key].vecinos.includes(defensorId)) {
            // Remover al defensor de la lista de vecinos
            estadoPaises[key].vecinos = estadoPaises[key].vecinos.filter(v => v !== defensorId);
            // Añadir al atacante (si no estaba ya)
            if (!estadoPaises[key].vecinos.includes(atacanteId) && key !== atacanteId) {
                estadoPaises[key].vecinos.push(atacanteId);
            }
        }
    }

    return { 
        exito: true, 
        mensaje: `${atacante.nombre} se expandió sobre ${defensor.nombre}` 
    };
}

// Un país arrasado por bombas sigue vivo (puede resurgir), así que la partida
// solo termina cuando queda un único país sin eliminar.
function hayGanador() {
    const vivos = Object.values(estadoPaises).filter(p => !p.eliminado);
    return vivos.length === 1 ? vivos[0] : null;
}

module.exports = {
    getEstadoActual,
    hayGanador,
    getOwnerReal,
    procesarConquista,
    reiniciarEstado,
    estadoPaises
};
