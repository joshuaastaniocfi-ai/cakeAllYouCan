# Production Dockerfile for Goldilocks Cake All You Can E-Coupon System
# Includes both Node.js runtime and Python 3 + Pillow for coupon generation

FROM node:20-bookworm-slim

# Install Python 3, pip, Pillow dependencies, and fonts
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    python3-pil \
    fonts-dejavu-core \
    && rm -rf /var/lib/apt/lists/*

# Ensure `python` command points to `python3`
RUN ln -sf /usr/bin/python3 /usr/bin/python

WORKDIR /app

# Install npm production dependencies
COPY package*.json ./
RUN npm install --omit=dev

# Copy project files
COPY . .

# Expose port (Render/Railway map this automatically via process.env.PORT)
EXPOSE 3000

ENV NODE_ENV=production

CMD ["node", "server.js"]

