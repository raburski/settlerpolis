FROM node:20-alpine as backend-builder
WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm install
COPY backend/ ./
RUN npm run build

FROM node:20-alpine as frontend-builder
WORKDIR /app/frontend
COPY package*.json ./
RUN npm install
COPY . ./
RUN npm run build

FROM nginx:alpine
# Install Node.js for running the backend
RUN apk add --update nodejs npm

# Copy nginx configuration
COPY nginx.conf /etc/nginx/nginx.conf

# Copy frontend build
COPY --from=frontend-builder /app/frontend/dist /usr/share/nginx/html

# Copy backend
COPY --from=backend-builder /app/backend/dist /app/backend/dist
COPY --from=backend-builder /app/backend/package*.json /app/backend/

# Install backend production dependencies
WORKDIR /app/backend
RUN npm install --production

# Copy start script
COPY start.sh /start.sh
RUN chmod +x /start.sh

EXPOSE 80

CMD ["/start.sh"] 