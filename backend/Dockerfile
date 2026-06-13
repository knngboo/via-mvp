# Production backend container — uses 'node server.js' (not nodemon)
#
FROM node:18-alpine
WORKDIR /app

# Install dependencies first (layer-cached unless package.json changes)
COPY package.json pnpm-lock.yaml* ./
RUN npm install -g pnpm && pnpm install --prod

# Copy application source
COPY . .

# Run as non-root user for security
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser

ENV NODE_ENV=production
EXPOSE 5001
CMD ["pnpm", "run", "start"]
