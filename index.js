import qrcode from "qrcode";
import crypto from "crypto";
import pino from "pino";
import { Boom } from "@hapi/boom";
import {
  makeWASocket,
  useMultiFileAuthState,
  generateWAMessageFromContent,
  DisconnectReason,
  Browsers,
} from "@whiskeysockets/baileys";
import { keepAlive, setQr } from "./keepAlive.js";

// Asegurar crypto disponible globalmente
if (typeof globalThis.crypto === "undefined") {
  globalThis.crypto = crypto;
}

async function connectToWA() {
  const { state, saveCreds } = await useMultiFileAuthState("./auth_info_baileys");

  const sock = makeWASocket({
    logger: pino({ level: "silent" }),
    auth: state,
    browser: Browsers.appropriate("Chrome"),
  });

  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      const qrImage = await qrcode.toDataURL(qr);
      setQr(qrImage);
      console.log("📲 Abre tu navegador y escanea el QR en: https://tu-bot.onrender.com");
    }

    if (connection === "open") {
      console.log("✅ Bot conectado correctamente a WhatsApp.");
      setQr(null);
    }

    if (connection === "close") {
      const statusCode =
        lastDisconnect?.error instanceof Boom
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

keepAlive();
await connectToWA();

// 🛡️ Manejo de errores globales
process.on("uncaughtExceptionMonitor", console.error);
process.on("unhandledRejection", console.error);
process.on("uncaughtException", console.error);
