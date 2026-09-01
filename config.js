function readEnvValue(env, key) {
    if (!env) return undefined;
    if (Object.prototype.hasOwnProperty.call(env, key)) {
        const val = env[key];
        if (val !== undefined && val !== null && String(val).trim() !== "") {
            return String(val);
        }
    }
    const lowerKey = key.toLowerCase();
    if (Object.prototype.hasOwnProperty.call(env, lowerKey)) {
        const val = env[lowerKey];
        if (val !== undefined && val !== null && String(val).trim() !== "") {
            return String(val);
        }
    }
    return undefined;
}

function getAdminPassword(env = process.env) {
    return readEnvValue(env, "ADMIN_PASSWORD") || "hungvuong2026";
}

function getRuntimePort(env = process.env) {
    const raw = readEnvValue(env, "PORT");
    const parsed = Number.parseInt(raw || "3000", 10);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
    return 3000;
}

module.exports = {
    readEnvValue,
    getAdminPassword,
    getRuntimePort,
};
