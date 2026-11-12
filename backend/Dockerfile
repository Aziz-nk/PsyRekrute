# Image de DEVELOPPEMENT (non validee : Docker indisponible sur la machine de dev actuelle)
FROM node:20-bookworm-slim
# openssl requis par le moteur Prisma
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY prisma ./prisma
RUN npx prisma generate
COPY . .
EXPOSE 4000
CMD ["npm", "run", "start:dev"]
