# build
FROM node:20-alpine as build
WORKDIR /app
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ .
ARG VITE_API_URL
ARG VITE_WS_URL
ARG VITE_API_SAME_HOST
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_WS_URL=$VITE_WS_URL
ENV VITE_API_SAME_HOST=$VITE_API_SAME_HOST
RUN npm run build

# prod nginx
FROM nginx:stable-alpine as production
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx/nginx.conf /etc/nginx/nginx.conf
RUN mkdir -p /etc/nginx/sites-available /etc/nginx/includes
COPY nginx/sites-available/ /etc/nginx/sites-available/
COPY nginx/includes/ /etc/nginx/includes/
COPY deploy/scripts/start-nginx.sh /start-nginx.sh
RUN chmod +x /start-nginx.sh
EXPOSE 80 443
CMD ["/start-nginx.sh"]

# dev
FROM node:20-alpine as development
WORKDIR /app
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ .
EXPOSE 5173
