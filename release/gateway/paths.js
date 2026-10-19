"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authDir = authDir;
exports.clearAuthDir = clearAuthDir;
exports.mediaDir = mediaDir;
exports.ensureDataDirs = ensureDataDirs;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const root = path_1.default.resolve(__dirname, "../../..");
function authDir(userId, accountId) {
    const dir = path_1.default.resolve(root, process.env.AUTH_DIR || "auth", userId, accountId);
    fs_1.default.mkdirSync(dir, { recursive: true });
    return dir;
}
/** Wipe Baileys session files so pairing can start clean. */
function clearAuthDir(userId, accountId) {
    const dir = path_1.default.resolve(root, process.env.AUTH_DIR || "auth", userId, accountId);
    if (fs_1.default.existsSync(dir)) {
        fs_1.default.rmSync(dir, { recursive: true, force: true });
    }
    fs_1.default.mkdirSync(dir, { recursive: true });
    return dir;
}
function mediaDir(accountId) {
    const dir = path_1.default.resolve(root, process.env.MEDIA_DIR || "media", accountId);
    fs_1.default.mkdirSync(dir, { recursive: true });
    return dir;
}
function ensureDataDirs() {
    fs_1.default.mkdirSync(path_1.default.resolve(root, "data"), { recursive: true });
    fs_1.default.mkdirSync(path_1.default.resolve(root, process.env.AUTH_DIR || "auth"), {
        recursive: true,
    });
    fs_1.default.mkdirSync(path_1.default.resolve(root, process.env.MEDIA_DIR || "media"), {
        recursive: true,
    });
}
