module.exports = {
    // Usuario de TikTok para conectarse (sin @)
    tiktokUsername: "TU_USUARIO",

    // ================================================
    //  SISTEMA DE DONACIONES POR PAÍS
    //  1 Moneda = fuerza 5 | 1 regalo único por país
    // ================================================
    gifts: {
        "Guiño guiño":    { pais: "brasil",      fuerza: 5, aliases: ["wink"] },
        "White Rose":     { pais: "argentina",   fuerza: 5, aliases: ["white rose"] },
        "Rosa":           { pais: "mexico",      fuerza: 5, aliases: ["rose"] },
        "Cono de helado": { pais: "peru",        fuerza: 5, aliases: ["ice cream cone", "ice cream"] },
        "TikTok":         { pais: "colombia",    fuerza: 5, aliases: ["tiktok"] },
        "Cake Slice":     { pais: "bolivia",     fuerza: 5, aliases: ["cake slice", "cake"] },
        "GG":             { pais: "venezuela",   fuerza: 5, aliases: ["gg"] },
        "Maracas":        { pais: "chile",       fuerza: 5, aliases: ["maracas"] },
        "Clásicos":       { pais: "paraguay",    fuerza: 5, aliases: ["classic", "classics", "radio"] },
        "Eres increíble": { pais: "ecuador",     fuerza: 5, aliases: ["you're amazing", "amazing"] },
        "Pop":            { pais: "uruguay",     fuerza: 5, aliases: ["pop"] },
        "Corazoncito":    { pais: "el_salvador", fuerza: 5, aliases: ["heart", "finger heart", "little heart"] },
        "Te adoro":       { pais: "costa_rica",  fuerza: 5, aliases: ["love you", "adore you"] },
        "It's corn":      { pais: "panama",      fuerza: 5, aliases: ["it's corn", "corn"] },

        // ================================================
        //  REGALOS GLOBALES (APOCALIPSIS / REINICIO)
        // ================================================
        "Leon":           { tipo: "apocalipsis", aliases: ["lion"] },
        "Galaxia":        { tipo: "apocalipsis", aliases: ["galaxy"] },
        "Tiktok Universe":{ tipo: "apocalipsis", aliases: ["tiktok universe", "universe"] }
    },

    // Configuración de la Cola de Regalos
    queue: {
        intervaloProcesamientoMs: 300 // Reducido para procesar rápido las lluvias de regalos
    }
};

