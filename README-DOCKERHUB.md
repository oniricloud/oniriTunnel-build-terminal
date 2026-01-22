# Oniri Tunnel Docker Image

A secure, lightweight Docker container for running Oniri Tunnel service - enabling encrypted peer-to-peer tunneling and remote access to your services.

## What It Does

- **Secure Tunneling**: Creates encrypted P2P tunnels between remote devices
- **Dynamic Port Management**: Automatically handles port allocation for tunnel connections  
- **Remote Access**: Enables secure access to local services from anywhere
- **HTTP Monitoring**: Built-in health check and status endpoints
- **Multi-Platform**: Supports both AMD64 and ARM64 architectures

## Quick Start

```bash
docker run -d \
  --name oniri-tunnel \
  -e ONIRI_SEED="your 12 word seed phrase from oniricloud.com" \
  -e ONIRI_PASSWORD="your-secure-password" \
  --network host \
  -v oniri-config:/root/.oniri \
  sce9sc/oniri:latest
```

## Environment Variables

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `ONIRI_SEED` | Your 12-word seed phrase from [oniricloud.com](https://oniricloud.com) dashboard | ✅ Yes | - |
| `ONIRI_PASSWORD` | Password for encrypting your configuration | ✅ Yes | - |
| `HTTP_PORT` | HTTP monitoring server port | ❌ No | 8777 |

## Monitoring & Health Checks

The service provides HTTP endpoints for monitoring:

```bash
# Health check
curl http://localhost:8777/health

# Detailed status  
curl http://localhost:8777/status
```

**Custom Port:**
```bash
docker run -d \
  -e HTTP_PORT=9000 \
  -e ONIRI_SEED="..." \
  -e ONIRI_PASSWORD="..." \
  --network host \
  sce9sc/oniri:latest

curl http://localhost:9000/health
```

## Docker Compose

```yaml
version: '3.8'

services:
  oniri-tunnel:
    image: sce9sc/oniri:latest
    container_name: oniri-tunnel
    restart: unless-stopped
    network_mode: host
    environment:
      - ONIRI_SEED=${ONIRI_SEED}
      - ONIRI_PASSWORD=${ONIRI_PASSWORD}
      - HTTP_PORT=${HTTP_PORT:-8777}
    volumes:
      - oniri-config:/root/.oniri

volumes:
  oniri-config:
    driver: local
```

Create `.env` file:
```bash
ONIRI_SEED=your 12 word seed phrase here
ONIRI_PASSWORD=your-secure-password
HTTP_PORT=8777
```

Run with:
```bash
docker-compose up -d
curl http://localhost:8777/health
```

## Supported Architectures

This image supports multiple architectures and automatically selects the correct one:

- `linux/amd64` - Intel/AMD 64-bit systems
- `linux/arm64` - ARM 64-bit systems (Apple Silicon, ARM servers)

## Network Configuration

Uses `--network host` to support dynamic port allocation. The service will:
- Automatically open ports as needed for tunnel connections
- Accept incoming tunnel requests
- Provide full network access without port mapping limitations
- Expose HTTP monitoring endpoints on configured port

## Persistent Storage

Configuration is stored in `/root/.oniri` directory. Using a Docker volume ensures:
- Configuration persists across container restarts
- No need to reconfigure after updates
- Secure storage of encrypted credentials

## Usage Examples

### Basic tunnel service
```bash
docker run -d \
  --name oniri-tunnel \
  --network host \
  -e ONIRI_SEED="word1 word2 word3 ... word12" \
  -e ONIRI_PASSWORD="mypassword" \
  -v oniri-config:/root/.oniri \
  sce9sc/oniri:latest
```

### With custom monitoring port
```bash
docker run -d \
  --name oniri-tunnel \
  --network host \
  -e ONIRI_SEED="$ONIRI_SEED" \
  -e ONIRI_PASSWORD="$ONIRI_PASSWORD" \
  -e HTTP_PORT=9000 \
  -v oniri-config:/root/.oniri \
  sce9sc/oniri:latest
```

## Verification

Check that your service is running:

```bash
# Container status
docker ps

# Service logs
docker logs oniri-tunnel

# Health check
curl http://localhost:8777/health

# Detailed status
curl http://localhost:8777/status | jq
```

## Get Started

1. **Get credentials**: Sign up at [oniricloud.com](https://oniricloud.com) to get your seed phrase
2. **Run container**: Use the quick start command above with your credentials
3. **Verify health**: Check `curl http://localhost:8777/health` returns `{"status":"healthy"}`
4. **Configure tunnels**: Set up your tunnel connections through the Oniri dashboard
5. **Connect securely**: Access your services remotely through encrypted tunnels

## Security Notes

- Store credentials securely - never commit them to version control
- Use strong, unique passwords
- Consider using Docker secrets in production
- Keep your seed phrase backed up safely

## Support

- **Documentation**: [Full Docker Guide](https://github.com/your-org/oniri-tunnel/blob/main/DOCKER.md)
- **Source Code**: [GitHub Repository](https://github.com/your-org/oniri-tunnel)
- **Oniri Platform**: [oniricloud.com](https://oniricloud.com)
- **Issues**: [GitHub Issues](https://github.com/your-org/oniri-tunnel/issues)

## License

Apache-2.0

---

**Need help?** Check the [full documentation](https://github.com/your-org/oniri-tunnel/blob/main/DOCKER.md) or open an [issue](https://github.com/your-org/oniri-tunnel/issues).