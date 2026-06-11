# Build the React app, then serve the static bundle with nginx.
#
# NOTE: build context must be the REPO ROOT (not ./frontend) because
# craco.config.js pulls in ../Plugins. docker-compose.yml sets this up:
#   build: { context: ., dockerfile: frontend/Dockerfile }
#
FROM node:20-alpine AS build
WORKDIR /app/frontend
RUN npm install -g pnpm
COPY frontend/package.json frontend/pnpm-lock.yaml frontend/pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY Plugins /app/Plugins
COPY frontend ./
RUN pnpm build

FROM nginx:alpine
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/frontend/build /usr/share/nginx/html
EXPOSE 80
