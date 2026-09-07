FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY worker.mjs ./
ENV PORT=3000
EXPOSE 3000
CMD ["npm","start"]
