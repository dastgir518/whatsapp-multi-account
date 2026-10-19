"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyToken = verifyToken;
const jose_1 = require("jose");
const secret = () => new TextEncoder().encode(process.env.JWT_SECRET || "dev-secret-change-me-in-production");
async function verifyToken(token) {
    try {
        const { payload } = await (0, jose_1.jwtVerify)(token, secret());
        if (typeof payload.userId !== "string" || typeof payload.email !== "string") {
            return null;
        }
        return { userId: payload.userId, email: payload.email };
    }
    catch {
        return null;
    }
}
