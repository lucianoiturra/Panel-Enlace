# Panel-Enlace (Next.js 16) para cabserver
FROM node:22-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# DATABASE_URL dummy en build: la app crea tablas en runtime, no en build.
ARG DATABASE_URL="postgresql://build:build@localhost:5432/build"
RUN npm run build

FROM node:22-slim AS run
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=build /app ./
EXPOSE 3000
CMD ["npm", "run", "start"]
