# Stage 1: Build the application
FROM node:22-alpine AS builder

WORKDIR /app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies
RUN npm ci --legacy-peer-deps

# Copy the rest of the application code
COPY . .

# Build the application
RUN npm run build

# Stage 2: Create a lightweight production image
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# Copy built assets and necessary files from the builder stage
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package*.json ./
# Full node_modules on purpose: the server bundle imports vite (a dev
# dependency) at startup via server/vite.ts, so --omit=dev would crash it.
COPY --from=builder /app/node_modules ./node_modules

# Nothing is written to disk at runtime; don't run as root.
USER node

# Expose the port the app runs on
EXPOSE 5000

# Start the application
CMD ["npm", "start"]
