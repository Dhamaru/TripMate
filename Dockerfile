# Stage 1: Build the application
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies
RUN npm ci --legacy-peer-deps

# Copy the rest of the application code
COPY . .

# Client-side (VITE_*) env vars are baked into the bundle at BUILD time by
# Vite, not read at container runtime — Render's dashboard env vars are
# otherwise only injected into the running container, never into a Docker
# build stage. Render DOES forward its dashboard env vars as --build-arg
# for any ARG declared here with a matching name, so each one needed at
# build time must be declared explicitly (live-confirmed missing: the
# MapTiler migration shipped with an empty key because this Dockerfile had
# no ARG for it, and Docker's layer cache had no way to know the env
# changed, so `RUN npm run build` kept reusing its old cached output).
ARG VITE_MAPTILER_KEY
ENV VITE_MAPTILER_KEY=$VITE_MAPTILER_KEY
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL

# Build the application
RUN npm run build

# Stage 2: Create a lightweight production image
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# Copy built assets and necessary files from the builder stage
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules

# Expose the port the app runs on
EXPOSE 5000

# Start the application
CMD ["npm", "start"]
