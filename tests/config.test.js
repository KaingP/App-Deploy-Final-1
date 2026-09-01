const test = require("node:test");
const assert = require("node:assert/strict");
const { getAdminPassword, getRuntimePort } = require("../config.js");

test("reads admin password from uppercase or lowercase env keys", () => {
    assert.equal(
        getAdminPassword({ ADMIN_PASSWORD: "UpperCasePwd" }),
        "UpperCasePwd",
    );
    assert.equal(
        getAdminPassword({ admin_password: "lowerCasePwd" }),
        "lowerCasePwd",
    );
    assert.equal(getAdminPassword({}), "hungvuong2026");
});

test("reads port from uppercase or lowercase env keys", () => {
    assert.equal(getRuntimePort({ PORT: "3500" }), 3500);
    assert.equal(getRuntimePort({ port: "4100" }), 4100);
    assert.equal(getRuntimePort({}), 3000);
});
