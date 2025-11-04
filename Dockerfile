# Imagen base con Node 18 o superior (requerido por Baileys)
FROM node:18

# Directorio de trabajo
WORKDIR /app

# Copiar archivos de dependencias
COPY package*.json ./

# Instalar dependencias
RUN npm install --production

# Copiar el resto de los archivos del proyecto
COPY . .

# Exponer el puerto (Render usará este valor)
EXPOSE 3000

# Variable de entorno para Render
ENV PORT=3000

# Comando para iniciar el bot
CMD ["npm", "start"]
