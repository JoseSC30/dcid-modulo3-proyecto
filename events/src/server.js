
require("dotenv").config();

const express = require("express");
const eventRoutes = require("./routes/event.routes");

const app = express();

app.use(express.json());

// Chequeo de salud
app.get("/health", (req, res) => {
    res.status(200).json({
        status: "ok",
        service: "events"
    });
});

// Rutas de eventos
app.use("/events", eventRoutes);

// Ruta no encontrada
app.use((req, res) => {
    res.status(404).json({
        message: "Ruta no encontrada"
    });
});

// Manejo centralizado de errores
app.use((err, req, res, next) => {
    console.error({
        date: new Date().toISOString(),
        level: "error",
        message: err.message
    });

    res.status(err.status || 500).json({
        error: err.message || "Error interno del servidor"
    });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Servicio events ejecutándose en puerto ${PORT}`);
});
