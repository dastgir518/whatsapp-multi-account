"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getMessageType = getMessageType;
exports.getMessageBody = getMessageBody;
exports.hasMedia = hasMedia;
function getMessageType(msg) {
    if (!msg)
        return "other";
    if (msg.conversation || msg.extendedTextMessage)
        return "text";
    if (msg.imageMessage)
        return "image";
    if (msg.videoMessage)
        return "video";
    if (msg.audioMessage)
        return "audio";
    if (msg.documentMessage)
        return "document";
    if (msg.stickerMessage)
        return "sticker";
    return "other";
}
function getMessageBody(msg) {
    if (!msg)
        return null;
    if (msg.conversation)
        return msg.conversation;
    if (msg.extendedTextMessage?.text)
        return msg.extendedTextMessage.text;
    if (msg.imageMessage?.caption)
        return msg.imageMessage.caption;
    if (msg.videoMessage?.caption)
        return msg.videoMessage.caption;
    if (msg.documentMessage?.fileName)
        return msg.documentMessage.fileName;
    if (msg.audioMessage)
        return "[Audio]";
    if (msg.stickerMessage)
        return "[Sticker]";
    if (msg.imageMessage)
        return "[Image]";
    if (msg.videoMessage)
        return "[Video]";
    if (msg.documentMessage)
        return "[Document]";
    return null;
}
function hasMedia(type) {
    return ["image", "video", "audio", "document", "sticker"].includes(type);
}
