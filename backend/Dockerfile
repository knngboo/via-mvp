# start container
#
FROM node:20-alpine
WORKDIR /app
# build tools needed to compile native modules (better-sqlite3 via gtfs)
RUN apk add --no-cache python3 make g++
RUN npm install -g pnpm
COPY package*.json pnpm-lock.yaml* pnpm-workspace.yaml* ./
RUN pnpm install
COPY . .
EXPOSE 5000
CMD ["pnpm", "start"]