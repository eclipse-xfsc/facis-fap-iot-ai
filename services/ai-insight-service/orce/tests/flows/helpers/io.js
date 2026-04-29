"use strict";

const fs = require("node:fs");
const path = require("node:path");

function readJsonFromOrce(relPath) {
    const fullPath = path.join(__dirname, "..", "..", "..", relPath);
    const raw = fs.readFileSync(fullPath, "utf8");
    return JSON.parse(raw);
}

module.exports = {
    readJsonFromOrce,
};
