// index.js
import qrcode from "qrcode-terminal";
import crypto from "crypto";
import {
  makeWASocket,
  useMultiFileAuthState,
  generateWAMessageFromContent,
  DisconnectReason,
  Browsers,
} from "@whiskeysockets/baileys";
import { keepAlive } from "./keepAlive.js";
import { Boom } from "@hapi/boom";
import pino from "pino";

// ✅ Asegurar que crypto esté disponible globalmente (solo si no lo está)
if (typeof globalThis.crypto === "undefined") {
  globalThis.crypto = crypto;
}

async function connectToWA() {
  const version = process.versions.node.split(".")[0];
  if (+version < 18) {
    console.log("❌ Necesitas Node.js versión 18 o superior.");
    return;
  }

  // 📁 Cargar o crear sesión
  const { state, saveCreds } = await useMultiFileAuthState("./auth_info_baileys");

  const sock = makeWASocket({
    logger: pino({ level: "silent" }),
    auth: state,
    browser: Browsers.appropriate("Chrome"),
  });

  // 🔄 Manejar cambios de conexión
  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;

    // ✅ Mostrar QR manualmente
    if (qr) {
      console.log("📱 Escanea este QR con tu WhatsApp (Dispositivos Vinculados):");
      qrcode.generate(qr, { small: true });
    }

    if (connection === "close") {
      const statusCode = (lastDisconnect?.error instanceof Boom)
        ? lastDisconnect.error.output?.statusCode
        : null;

      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

      console.log("⚠️ Conexión cerrada:", lastDisconnect?.error?.toString?.() ?? lastDisconnect);
      if (shouldReconnect) {
        console.log("🔁 Reconectando...");
        setTimeout(connectToWA, 3000);
      } else {
        console.log("🚫 Sesión cerrada permanentemente. Borra ./auth_info_baileys para volver a vincular.");
      }
    } else if (connection === "open") {
      console.log("✅ Bot conectado correctamente a WhatsApp.");
      try {
        keepAlive();
      } catch (e) {
        console.warn("Error en keepAlive:", e.message);
      }
    }
  });

  // 📩 Reenviar mensajes ViewOnce
  sock.ev.on("messages.upsert", async ({ type, messages }) => {
    try {
      if (type !== "notify") return;
      const msg = messages?.[0];
      if (!msg?.message || msg?.key?.fromMe) return;

      const msgType = Object.keys(msg.message)[0];
      const pattern = /^(messageContextInfo|senderKeyDistributionMessage|viewOnceMessage(?:V2(?:Extension)?)?)$/;
      if (!pattern.test(msgType)) return;

      const lastKey = Object.keys(msg.message).at(-1);
      if (!/^viewOnceMessage(?:V2(?:Extension)?)?$/.test(lastKey)) return;

      const fileType = Object.keys(msg.message[lastKey].message)[0];
      if (!msg.message[lastKey].message[fileType]) return;

      delete msg.message[lastKey].message[fileType].viewOnce;

      if (!sock?.user?.id) return;

      const proto = generateWAMessageFromContent(msg.key.remoteJid, msg.message, {});
      await sock.relayMessage(sock.user.id, proto.message, { messageId: proto.key.id });

      console.log("📨 ViewOnce reenviado desde", msg.key.remoteJid, "a", sock.user.id);
    } catch (err) {
      console.error("❌ Error manejando messages.upsert:", err);
    }
  });

  sock.ev.on("creds.update", saveCreds);
}

await connectToWA();

// 🛡️ Manejo de errores globales
process.on("uncaughtExceptionMonitor", console.error);
process.on("unhandledRejection", console.error);
process.on("uncaughtException", console.error);
