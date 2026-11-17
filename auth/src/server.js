const config = require("./config");
const createUserRepository = require("./repositories/user.repository");
const createApp = require("./app");

const repository = createUserRepository(config.databaseUrl);
const app = createApp(repository, config.jwtSecret);

app.listen(config.port, () => {
    console.log({
        date: new Date().toISOString(),
        level: "info",
        message: `Servicio auth ejecutandose en puerto ${config.port}`
    });
});
