import express from "express";
import { writeFileSync } from "fs";

let lastQr = null;

// 🔹 Genera o actualiza el HTML del QR
export function setQr(qrDataUrl) {
  lastQr = qrDataUrl;

  const html = `
  <!DOCTYPE html>
  <html lang="es">
  <head>
    <meta charset="UTF-8" />
    <title>WhatsApp Bot - Escanea el QR</title>
    <style>
      body {
        font-family: Arial, sans-serif;
        background: #f1f1f1;
        text-align: center;
        padding-top: 50px;
      }
      img {
        width: 250px;
        height: 250px;
        border: 10px solid #fff;
        box-shadow: 0 0 15px rgba(0,0,0,0.2);
      }
      h2 {
        color: #333;
      }
    </style>
  </head>
  <body>
    <h2>📱 Escanea este código QR con WhatsApp</h2>
    ${qrDataUrl ? `<img src="${qrDataUrl}" alt="QR Code">` : "<p>Esperando QR...</p>"}
  </body>
  </html>
  `;

  writeFileSync("./public/qr.html", html);
}

// 🔹 Servidor web simple (mantiene activo el contenedor en Render)
export function keepAlive() {
  const app = express();
  app.use(express.static("public"));

  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log(`🌐 Servidor web activo en puerto ${PORT}`));
}
