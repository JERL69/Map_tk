// Base de datos de los países — solo los 14 países activos con paleta Premium
const paisesData = {
    mexico: { id: "mexico", topoName: "Mexico", nombre: "México", colorOriginal: "#1B5E20", vecinos: ["el_salvador"] },
    el_salvador: { id: "el_salvador", topoName: "El Salvador", nombre: "El Salvador", colorOriginal: "#1E40AF", vecinos: ["mexico", "costa_rica"] },
    costa_rica: { id: "costa_rica", topoName: "Costa Rica", nombre: "Costa Rica", colorOriginal: "#F43F5E", vecinos: ["el_salvador", "panama"] },
    panama: { id: "panama", topoName: "Panama", nombre: "Panamá", colorOriginal: "#14B8A6", vecinos: ["costa_rica", "colombia"] },
    colombia: { id: "colombia", topoName: "Colombia", nombre: "Colombia", colorOriginal: "#EAB308", vecinos: ["panama", "venezuela", "brasil", "ecuador", "peru"] },
    venezuela: { id: "venezuela", topoName: "Venezuela", nombre: "Venezuela", colorOriginal: "#722F37", vecinos: ["colombia", "brasil"] },
    ecuador: { id: "ecuador", topoName: "Ecuador", nombre: "Ecuador", colorOriginal: "#0284C7", vecinos: ["colombia", "peru"] },
    peru: { id: "peru", topoName: "Peru", nombre: "Perú", colorOriginal: "#EC4899", vecinos: ["ecuador", "colombia", "brasil", "bolivia", "chile"] },
    brasil: { id: "brasil", topoName: "Brazil", nombre: "Brasil", colorOriginal: "#22C55E", vecinos: ["venezuela", "colombia", "peru", "bolivia", "paraguay", "argentina", "uruguay"] },
    bolivia: { id: "bolivia", topoName: "Bolivia", nombre: "Bolivia", colorOriginal: "#F97316", vecinos: ["peru", "brasil", "paraguay", "argentina", "chile"] },
    paraguay: { id: "paraguay", topoName: "Paraguay", nombre: "Paraguay", colorOriginal: "#7E22CE", vecinos: ["bolivia", "brasil", "argentina"] },
    chile: { id: "chile", topoName: "Chile", nombre: "Chile", colorOriginal: "#DC2626", vecinos: ["peru", "bolivia", "argentina"] },
    argentina: { id: "argentina", topoName: "Argentina", nombre: "Argentina", colorOriginal: "#38BDF8", vecinos: ["chile", "bolivia", "paraguay", "brasil", "uruguay"] },
    uruguay: { id: "uruguay", topoName: "Uruguay", nombre: "Uruguay", colorOriginal: "#FCD34D", vecinos: ["argentina", "brasil"] }
};

window.paisesData = paisesData;
