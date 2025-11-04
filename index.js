// index.js
import crypto from "crypto";
if (!globalThis.crypto) {
  globalThis.crypto = crypto;
}
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

async function connectToWA() {
  const version = process.versions.node.split(".")[0];

  if (+version < 18) {
    console.log("Necesitas Node.js versión 18 o superior.");
    return;
  }

  // Cargar o crear sesión
  const { state, saveCreds } = await useMultiFileAuthState("auth");
  const browser = Browsers.appropriate("Chrome");

  const sock = makeWASocket({
    logger: pino({ level: "silent" }),
    auth: state,
    browser,
  });

  // Mostrar QR
  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      try {
        const qrcode = await import("qrcode-terminal");
        qrcode.generate(qr, { small: true });
        console.log("Escanea el QR con tu app de WhatsApp (Dispositivos -> Vincular un dispositivo).");
      } catch (err) {
        console.log("No está instalada 'qrcode-terminal'. Copia este string y pégalo en https://webqr.com/");
        console.log(qr);
      }
    }

    if (connection === "close") {
      const shouldReconnect =
        (lastDisconnect?.error instanceof Boom)?.output?.statusCode !==
        DisconnectReason.loggedOut;

      console.log("Conexión cerrada:", lastDisconnect?.error?.toString?.() ?? lastDisconnect);
      if (shouldReconnect) {
        console.log("Reconectando...");
        setTimeout(connectToWA, 2000);
      } else {
        console.log("La sesión fue desconectada. Borra ./auth si quieres volver a vincular.");
      }
    } else if (connection === "open") {
      console.log("Bot conectado correctamente a WhatsApp.");
      try { keepAlive(); } catch (e) {}
    }
  });

  // Reenviar mensajes ViewOnce
  sock.ev.on("messages.upsert", async ({ type, messages }) => {
    try {
      if (type !== "notify") return;
      const msg = messages?.[0];
      if (!msg?.message) return;
      if (msg?.key?.fromMe) return;

      const msgType = Object.keys(msg.message)[0];
      const pattern =
        /^(messageContextInfo|senderKeyDistributionMessage|viewOnceMessage(?:V2(?:Extension)?)?)$/;

      if (!pattern.test(msgType)) return;

      const lastKey = Object.keys(msg.message).at(-1);
      if (!/^viewOnceMessage(?:V2(?:Extension)?)?$/.test(lastKey)) return;

      const fileType = Object.keys(msg.message[lastKey].message)[0];
      if (!msg.message[lastKey].message[fileType]) return;

      delete msg.message[lastKey].message[fileType].viewOnce;

      if (!sock?.user?.id) return;

      const proto = generateWAMessageFromContent(msg.key.remoteJid, msg.message, {});
      await sock.relayMessage(sock.user.id, proto.message, { messageId: proto.key.id });

      console.log("ViewOnce reenviado desde", msg.key.remoteJid, "a", sock.user.id);
    } catch (err) {
      console.error("Error manejando messages.upsert:", err);
    }
  });

  sock.ev.on("creds.update", saveCreds);
  sock.ev.on("connection.error", (err) => console.error("Socket connection error:", err));
}

await connectToWA();

// Manejo de errores globales
process.on("uncaughtExceptionMonitor", console.error);
process.on("unhandledRejection", console.error);
process.on("uncaughtException", console.error);
