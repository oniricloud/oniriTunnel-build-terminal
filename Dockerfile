# Use Ubuntu as base image
FROM ubuntu:22.04

# Install required dependencies
RUN apt-get update && apt-get install -y \
    curl \
    ca-certificates \
    expect \
    && rm -rf /var/lib/apt/lists/*

# Create app directory
WORKDIR /app

# Create oniri config directory
RUN mkdir -p /root/.oniri

# Detect architecture and download appropriate executable
RUN ARCH=$(uname -m) && \
    if [ "$ARCH" = "x86_64" ]; then \
        DOWNLOAD_URL="https://github.com/oniricloud/oniri-terminal-repo/releases/download/v1/oniri-terminal-linux-x64"; \
    elif [ "$ARCH" = "aarch64" ]; then \
        DOWNLOAD_URL="https://github.com/oniricloud/oniri-terminal-repo/releases/download/v1/oniri-terminal-linux-arm64"; \
    else \
        echo "Unsupported architecture: $ARCH" && exit 1; \
    fi && \
    echo "Downloading from: $DOWNLOAD_URL" && \
    curl -L -o /app/oniri "$DOWNLOAD_URL" && \
    chmod +x /app/oniri

# Environment variables
ENV ONIRI_SEED=""
ENV ONIRI_PASSWORD=""
ENV HTTP_PORT="8777"

# Create main entrypoint script
RUN cat > /app/entrypoint.sh << 'EOF'
#!/bin/bash
set -e

# Check if required environment variables are set
if [ -z "$ONIRI_SEED" ] || [ -z "$ONIRI_PASSWORD" ]; then
    echo "Error: ONIRI_SEED and ONIRI_PASSWORD environment variables must be set"
    echo "Example:"
    echo "  docker run -e ONIRI_SEED='word1 word2 ... word12' -e ONIRI_PASSWORD='your-password' oniri-tunnel"
    exit 1
fi

echo "Starting Oniri Tunnel Service..."
echo "Seed: ${ONIRI_SEED:0:20}..."
echo "Password: [HIDDEN]"
echo "HTTP Port: ${HTTP_PORT:-8777}"

# Set default HTTP_PORT if not provided
if [ -z "$HTTP_PORT" ]; then
    HTTP_PORT=8777
fi

# Check if already configured
if [ ! -f "/root/.oniri/encp.json" ]; then
    echo "Configuring and starting Oniri Tunnel Service..."
    if [ ! -z "$HTTP_PORT" ] && [ "$HTTP_PORT" != "8777" ]; then
        echo "Running: /app/oniri config -s [SEED] -p [PASSWORD] --port $HTTP_PORT"
        /app/oniri config -n -s "$ONIRI_SEED" -p "$ONIRI_PASSWORD" --port "$HTTP_PORT" || {
            echo "Configuration failed, trying with long flags..."
            /app/oniri config --notty --seed "$ONIRI_SEED" --pass "$ONIRI_PASSWORD" --port "$HTTP_PORT" || {
                echo "Configuration failed with both flag formats"
                exit 1
            }
        }
    else
        echo "Running: /app/oniri config -s [SEED] -p [PASSWORD]"
        /app/oniri config -n -s "$ONIRI_SEED" -p "$ONIRI_PASSWORD" || {
            echo "Configuration failed, trying with long flags..."
            /app/oniri config --notty --seed "$ONIRI_SEED" --pass "$ONIRI_PASSWORD" || {
                echo "Configuration failed with both flag formats"
                exit 1
            }
        }
    fi
    echo "Configuration completed, now starting service..."
fi

echo "Starting Oniri service..."
if [ ! -z "$HTTP_PORT" ] && [ "$HTTP_PORT" != "8777" ]; then
    exec /app/oniri config --notty --seed "$ONIRI_SEED" --pass "$ONIRI_PASSWORD" --port "$HTTP_PORT"
else
    exec /app/oniri config --notty --seed "$ONIRI_SEED" --pass "$ONIRI_PASSWORD"
fi
EOF

# Make entrypoint script executable
RUN chmod +x /app/entrypoint.sh

# Expose configurable HTTP port (default 8777)
EXPOSE ${HTTP_PORT:-8777}

# Use entrypoint script
ENTRYPOINT ["/app/entrypoint.sh"]
