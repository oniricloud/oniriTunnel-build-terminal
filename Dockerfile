FROM ubuntu:22.04

# Build argument for the executable URL
ARG ONIRI_DOWNLOAD_URL=""

# Install dependencies
RUN apt-get update && apt-get install -y \
    curl \
    ca-certificates \
    libgtk-4-1 \
    fuse \
    nodejs \
    && rm -rf /var/lib/apt/lists/*

# Create app directory
WORKDIR /app

# Download the Oniri executable from URL
RUN if [ -n "$ONIRI_DOWNLOAD_URL" ]; then \
        echo "Downloading Oniri from $ONIRI_DOWNLOAD_URL"; \
        curl -L "$ONIRI_DOWNLOAD_URL" -o /app/oniri; \
    else \
        echo "ERROR: ONIRI_DOWNLOAD_URL build arg is required"; \
        exit 1; \
    fi && \
    chmod +x /app/oniri

# Copy service files for configuration script
COPY services /app/services

# Copy entrypoint script
COPY docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh

# Create directory for configuration
RUN mkdir -p /root/.oniri

# Environment variables for configuration
ENV ONIRI_SEED=""
ENV ONIRI_PASSWORD=""
ENV ONIRI_AUTO_START="true"

# Expose any ports if needed (adjust based on your app needs)
# EXPOSE 8080

ENTRYPOINT ["/app/docker-entrypoint.sh"]
CMD ["start"]
