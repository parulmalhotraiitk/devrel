# Stage 1: Build
FROM node:20 AS builder
WORKDIR /usr/src/app

# Copy manifests and install ALL dependencies (including devDependencies for tsc)
COPY package*.json ./
RUN npm install

# Copy source and compile TypeScript
COPY . .
RUN npm run build

# Stage 2: Production image
FROM node:20-slim
WORKDIR /usr/src/app

# Copy manifests and install ONLY production dependencies
COPY package*.json ./
RUN npm install --omit=dev

# Copy compiled output from the build stage
COPY --from=builder /usr/src/app/dist ./dist

# The frontend assets are in dist/frontend, which is now inside the dist folder 
# because of our base build and the vite build outDir configuration.
# We'll make sure the start command is correct.

# Run the web service
CMD [ "node", "dist/index.js" ]
