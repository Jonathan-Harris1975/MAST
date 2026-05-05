FROM node:22-alpine

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8000

COPY package.json ./
RUN npm install --omit=dev --ignore-scripts

COPY src ./src
COPY README.md ./README.md

EXPOSE 8000
CMD ["npm", "start"]
