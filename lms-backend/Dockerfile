# Build stage
FROM node:18 AS builder

WORKDIR /app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies (only production dependencies)
RUN npm install --production

# Copy application code
COPY . .

# Production stage
FROM node:18-slim

WORKDIR /app

# Set environment to production
ENV NODE_ENV=production

# Copy only necessary files from builder stage
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/server.js ./server.js
COPY --from=builder /app /app

# Run as non-root user for security
RUN useradd -m appuser
USER appuser

# Expose port
EXPOSE 5000

# Start the application
CMD ["npm", "run", "start"]