# Docker Build and Deploy Guide

This guide covers building and deploying the Oniri Tunnel service using Docker, including multi-architecture builds for Docker Hub.

## Prerequisites

- Docker Desktop installed and running
- Docker Hub account (for pushing to registry)
- Valid Oniri credentials (seed phrase and password)

## Local Development

### 1. Configure Environment

Copy the example environment file and add your credentials:

```bash
cp .env.example .env
```

Edit `.env` with your actual values:
```bash
ONIRI_SEED=your 12 word seed phrase from oniricloud dashboard here
ONIRI_PASSWORD=your-actual-password
HTTP_PORT=8777
```

### 2. Build and Run Locally

```bash
# Build the image
docker-compose build

# Start the service
docker-compose up -d

# Check logs
docker logs oniri-tunnel

# Stop the service
docker-compose down
```

## Docker Hub Deployment

### 1. Login to Docker Hub

```bash
docker login
```
Enter your Docker Hub username and password when prompted.

### 2. Set Up Multi-Architecture Builder

Create a buildx builder instance for multi-platform builds:

```bash
# Create and use a new builder
docker buildx create --name multiarch --use

# Bootstrap the builder (downloads required components)
docker buildx inspect --bootstrap
```

### 3. Build and Push Multi-Architecture Image

Build for both AMD64 and ARM64 architectures and push to Docker Hub:

```bash
# Replace 'your-username' with your Docker Hub username
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  -t your-username/oniri:latest \
  --push .
```

Example with actual username:
```bash
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  -t sce9sc/oniri:latest \
  --push .
```

### 4. Verify Multi-Architecture Support

Check that both architectures were pushed:

```bash
docker manifest inspect your-username/oniri:latest
```

## Using the Published Image

### With Docker Run

```bash
docker run -d -t \
  --name oniri-tunnel \
  -e ONIRI_SEED="your 12 word seed phrase here" \
  -e ONIRI_PASSWORD="your-secure-password" \
  -e HTTP_PORT=8777 \
  --network host \
  -v oniri-config:/root/.oniri \
  your-username/oniri:latest

# Check service health after startup
curl http://localhost:8777/health
```

**With custom port:**
```bash
docker run -d -t \
  --name oniri-tunnel \
  -e ONIRI_SEED="your 12 word seed phrase here" \
  -e ONIRI_PASSWORD="your-secure-password" \
  -e HTTP_PORT=9000 \
  --network host \
  -v oniri-config:/root/.oniri \
  your-username/oniri:latest

# Check service health on custom port
curl http://localhost:9000/health
```

### With Docker Compose

Create a `docker-compose.yml`:

```yaml
version: '3.8'

services:
  oniri-tunnel:
    image: your-username/oniri:latest
    container_name: oniri-tunnel
    restart: unless-stopped
    network_mode: host
    tty: true
    stdin_open: true
    environment:
      - ONIRI_SEED=${ONIRI_SEED}
      - ONIRI_PASSWORD=${ONIRI_PASSWORD}
      - HTTP_PORT=${HTTP_PORT:-8777}
    volumes:
      - oniri-config:/root/.oniri
      - oniri-logs:/root/.oniri/logs

volumes:
  oniri-config:
    driver: local
  oniri-logs:
    driver: local
```

Then run:
```bash
docker-compose up -d

# Verify service is running
curl http://localhost:8777/health
```

## Architecture Support

The Docker image automatically detects and supports:

- **linux/amd64** (Intel/AMD 64-bit systems)
- **linux/arm64** (ARM 64-bit systems - Apple Silicon, ARM servers)

Docker automatically pulls the correct architecture for your system.

## Network Configuration

The service uses `network_mode: host` to support dynamic port allocation for tunnel connections. This allows the Oniri service to:

- Open ports dynamically as needed
- Accept incoming tunnel connections  
- Provide full network access without port mapping limitations
- Expose HTTP monitoring endpoints on port 8777

## HTTP Monitoring Server

The service automatically starts an HTTP server on a configurable port (default **8777**) when running in non-TTY environments (like Docker containers). This provides REST API endpoints for monitoring and health checks.

### Port Configuration

You can customize the HTTP monitoring port using the `HTTP_PORT` environment variable:

```bash
# Default port 8777
HTTP_PORT=8777

# Custom port 9000  
HTTP_PORT=9000
```

### Available Endpoints

#### Health Check
```bash
GET http://localhost:{HTTP_PORT}/health
```
Returns service health status:
```json
{
  "status": "healthy",
  "timestamp": "2026-01-22T10:30:45.123Z", 
  "uptime": 125000,
  "service": "running"
}
```

#### Service Status  
```bash
GET http://localhost:{HTTP_PORT}/status
```
Returns detailed service information:
```json
{
  "data": {
    "daemon": {
      "status": "online",
      "pid": 1234,
      "uptime": 1642856445123
    },
    "service": {
      "status": "online", 
      "uptime": 125000
    },
    "configured": true,
    "services": {
      "local": {},
      "remote": {}
    },
    "httpServer": {
      "status": "running",
      "port": 8777,
      "endpoints": ["/health", "/status"]
    }
  }
}
```

### Monitoring Examples

```bash
# Quick health check (default port)
curl http://localhost:8777/health

# Quick health check (custom port)
curl http://localhost:9000/health

# Get detailed status
curl http://localhost:8777/status | jq

# Health check in scripts (with custom port)
HTTP_PORT=${HTTP_PORT:-8777}
if curl -f http://localhost:$HTTP_PORT/health >/dev/null 2>&1; then
  echo "Service is healthy"
else  
  echo "Service is down"
fi
```

## Volume Persistence

- **oniri-config**: Stores configuration files (`/root/.oniri`)
- **oniri-logs**: Stores application logs (`/root/.oniri/logs`)

Configuration persists across container restarts, so you only need to provide credentials on first run.

## Troubleshooting

### Check Container Status
```bash
docker ps
docker logs oniri-tunnel

# Check HTTP endpoints (default port)
curl http://localhost:8777/health
curl http://localhost:8777/status

# Check HTTP endpoints (custom port)
curl http://localhost:${HTTP_PORT}/health
curl http://localhost:${HTTP_PORT}/status
```

### Monitor Service Health
```bash
# Watch health status (default port)
watch curl -s http://localhost:8777/health

# Watch health status (custom port)
watch curl -s http://localhost:${HTTP_PORT:-8777}/health

# Get detailed service information  
curl http://localhost:${HTTP_PORT:-8777}/status | jq '.data.service'
```

### Restart Service
```bash
docker-compose restart
```

### Reset Configuration
```bash
docker-compose down
docker volume rm oniri-config
docker-compose up -d
```

### Update to Latest Version
```bash
docker-compose down
docker-compose pull
docker-compose up -d
```

## Build Arguments

The Dockerfile automatically:
- Detects system architecture (`x86_64` or `aarch64`)
- Downloads the appropriate binary from GitHub releases
- Configures the service with provided environment variables

## Security Notes

- Never commit `.env` files with real credentials to version control
- Use Docker secrets in production environments
- Store seed phrases securely
- Consider encrypting the configuration volume for production use

## Example Complete Workflow

```bash
# 1. Clone repository and configure
git clone <repository-url>
cd oniri-tunnel
cp .env.example .env
# Edit .env with your credentials

#rebuild 
docker-compose build --no-cache

# 2. Test locally
docker-compose up -d
docker logs oniri-tunnel

# 3. Build and push to Docker Hub
docker login
docker buildx create --name multiarch --use
docker buildx build --platform linux/amd64,linux/arm64 -t sce9sc/oniri:latest --push .

# 4. Use published image and verify
docker run -d -t --name oniri-tunnel --network host \
  -e ONIRI_SEED="your seed" -e ONIRI_PASSWORD="your password" \
  -v oniri-config:/root/.oniri yourusername/oniri:latest

# Check that service is healthy
curl http://localhost:8777/health
```