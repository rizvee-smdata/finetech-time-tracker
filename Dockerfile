# FROM node:22-alpine

# WORKDIR /app

# COPY package*.json ./

# RUN npm install

# COPY . .

# ENV HOST=0.0.0.0
# ENV PORT=8080

# EXPOSE 8080

# CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "8080"]

FROM node:22-alpine

WORKDIR /app

COPY package*.json ./

RUN npm install

COPY . .

# ==========================================
# Supabase / Vite environment variables
# ==========================================

ARG VITE_SUPABASE_PROJECT_ID
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_PUBLISHABLE_KEY

ARG VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY
ARG VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_TRACKING_ID

ENV VITE_SUPABASE_PROJECT_ID=$VITE_SUPABASE_PROJECT_ID
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_PUBLISHABLE_KEY=$VITE_SUPABASE_PUBLISHABLE_KEY

ENV VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY=$VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY
ENV VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_TRACKING_ID=$VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_TRACKING_ID

# ==========================================
# Application
# ==========================================

ENV HOST=0.0.0.0
ENV PORT=8080

EXPOSE 8080

CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "8080"]
