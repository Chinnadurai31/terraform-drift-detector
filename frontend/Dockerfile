FROM node:22-alpine AS build

WORKDIR /app
COPY . .
RUN npm install

ENV NODE_OPTIONS=--openssl-legacy-provider
RUN npm run build

FROM nginx:alpine

COPY --from=build /app/build /usr/share/nginx/html
COPY nginx.conf.template /etc/nginx/templates/default.conf.template

# nginx:alpine processes /etc/nginx/templates/*.template via envsubst at startup
# BACKEND_HOST and BACKEND_PORT are injected as env vars
ENV BACKEND_HOST=localhost1
ENV BACKEND_PORT=5050

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]