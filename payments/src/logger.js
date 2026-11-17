function log(level, message, meta = {}) {
    console.log(JSON.stringify({
        date: new Date().toISOString(),
        level,
        message,
        ...meta
    }));
}

module.exports = { log };
