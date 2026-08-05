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

// ================= SISTEMA DE AGGRO (MEMORIA) =================
// Mapa de agresiones: { 'victimaId': { 'agresorId': { damage: number, lastAttack: timestamp } } }
const aggroMap = {};
const AGGRO_TIMEOUT = 45000; // 45 segundos para perdonar

function registrarAtaque(atacanteId, defensorId, porcentaje) {
    if (!aggroMap[defensorId]) aggroMap[defensorId] = {};
    if (!aggroMap[defensorId][atacanteId]) {
        aggroMap[defensorId][atacanteId] = { damage: 0, lastAttack: 0 };
    }
    
    aggroMap[defensorId][atacanteId].damage += porcentaje;
    aggroMap[defensorId][atacanteId].lastAttack = Date.now();
}

function obtenerObjetivosInteligentes(paisId, posiblesDefensores) {
    if (posiblesDefensores.length === 0) return [];
    
    const misAgresores = aggroMap[paisId];
    if (!misAgresores) {
        // Modo Pacífico: atacar al azar
        return [posiblesDefensores[Math.floor(Math.random() * posiblesDefensores.length)]];
    }
    
    const ahora = Date.now();
    const agresoresActivos = [];
    
    for (const agresorId in misAgresores) {
        // Solo considerar a los que están en mis fronteras actuales y que el ataque sea reciente
        if (posiblesDefensores.includes(agresorId)) {
            const timeSinceAttack = ahora - misAgresores[agresorId].lastAttack;
            if (timeSinceAttack <= AGGRO_TIMEOUT) {
                agresoresActivos.push({ id: agresorId, damage: misAgresores[agresorId].damage });
            } else {
                // Borrar agresores viejos
                delete misAgresores[agresorId];
            }
        }
    }
    
    if (agresoresActivos.length === 0) {
        // Modo Pacífico (los agresores ya se olvidaron o murieron)
        return [posiblesDefensores[Math.floor(Math.random() * posiblesDefensores.length)]];
    }
    
    if (agresoresActivos.length >= 3) {
        // Modo Supervivencia (Onda Expansiva): Devuelve TODOS los agresores
        return agresoresActivos.map(a => a.id);
    }
    
    // Modo Venganza Concentrada (1 o 2 agresores): Atacar al que más daño hizo
    agresoresActivos.sort((a, b) => b.damage - a.damage);
    return [agresoresActivos[0].id];
}
// ===============================================================


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
        mensaje: `${atacante.nombre} asimiló a ${defensor.nombre}` 
    };
}

module.exports = {
    getEstadoActual,
    getOwnerReal,
    procesarConquista,
    reiniciarEstado,
    estadoPaises,
    registrarAtaque,
    obtenerObjetivosInteligentes
};
