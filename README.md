# Oniri Tunnel Docker Image

A secure, lightweight Docker container for running Oniri Tunnel service - enabling encrypted peer-to-peer tunneling and remote access to your services.

## Quick Start

```bash
docker run -d -t \
  --name oniri-tunnel \
  -e ONIRI_SEED="your 12 word seed phrase from oniricloud.com" \
  -e ONIRI_PASSWORD="your-secure-password" \
  --network host \
  -v oniri-config:/root/.oniri \
  sce9sc/oniri:latest
```

## What It Does

- **Secure Tunneling**: Creates encrypted P2P tunnels between remote devices
- **Dynamic Port Management**: Automatically handles port allocation for tunnel connections  
- **Remote Access**: Enables secure access to local services from anywhere
- **Multi-Platform**: Supports both AMD64 and ARM64 architectures

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `ONIRI_SEED` | Your 12-word seed phrase from [oniricloud.com](https://oniricloud.com) dashboard | ✅ Yes |
| `ONIRI_PASSWORD` | Password for encrypting your configuration | ✅ Yes |

## Supported Architectures

This image supports multiple architectures and automatically selects the correct one:

- `linux/amd64` - Intel/AMD 64-bit systems
- `linux/arm64` - ARM 64-bit systems (Apple Silicon, ARM servers)

## Docker Compose

```yaml
version: '3.8'

services:
  oniri-tunnel:
    image: sce9sc/oniri:latest
    container_name: oniri-tunnel
    restart: unless-stopped
    network_mode: host
    tty: true
    stdin_open: true
    environment:
      - ONIRI_SEED=${ONIRI_SEED}
      - ONIRI_PASSWORD=${ONIRI_PASSWORD}
    volumes:
      - oniri-config:/root/.oniri

volumes:
  oniri-config:
    driver: local
```

Create a `.env` file:
```bash
ONIRI_SEED=your 12 word seed phrase here
ONIRI_PASSWORD=your-secure-password
```

Run with:
```bash
docker-compose up -d
```

## Network Configuration

Uses `--network host` to support dynamic port allocation. The service will:
- Automatically open ports as needed for tunnel connections
- Accept incoming tunnel requests
- Provide full network access without port mapping limitations

## Persistent Storage

Configuration is stored in the `/root/.oniri` directory. Using a Docker volume ensures:
- Configuration persists across container restarts
- No need to reconfigure after updates
- Secure storage of encrypted credentials

## Usage Examples

### Basic tunnel service
```bash
docker run -d -t \
  --name oniri-tunnel \
  --network host \
  -e ONIRI_SEED="word1 word2 word3 ... word12" \
  -e ONIRI_PASSWORD="mypassword" \
  -v oniri-config:/root/.oniri \
  sce9sc/oniri:latest
```

### With custom container name
```bash
docker run -d -t \
  --name my-tunnel-service \
  --network host \
  -e ONIRI_SEED="$ONIRI_SEED" \
  -e ONIRI_PASSWORD="$ONIRI_PASSWORD" \
  -v tunnel-config:/root/.oniri \
  sce9sc/oniri:latest
```

## Monitoring

Check service status:
```bash
docker logs oniri-tunnel
docker exec -it oniri-tunnel /bin/bash
```

## Security Notes

- Store credentials securely - never commit them to version control
- Use strong, unique passwords
- Consider using Docker secrets in production
- Keep your seed phrase backed up safely

## Get Started

1. **Get credentials**: Sign up at [oniricloud.com](https://oniricloud.com) to get your seed phrase
2. **Run container**: Use the quick start command above with your credentials
3. **Configure tunnels**: Set up your tunnel connections through the Oniri dashboard
4. **Connect securely**: Access your services remotely through encrypted tunnels

## Links

- **Documentation**: [Full Docker Guide](https://github.com/oniricloud/oniriTunnel-build-terminal/blob/main/DOCKER.md)
- **Source Code**: [GitHub Repository](https://github.com/oniricloud/oniriTunnel-build-terminal)
- **Oniri Platform**: [oniricloud.com](https://oniricloud.com)
- **Support**: [GitHub Issues](https://github.com/oniricloud/oniriTunnel-build-terminal/issues)

## License

Apache-2.0

---

**Need help?** Check the [full documentation](https://github.com/oniricloud/oniriTunnel-build-terminal/blob/main/DOCKER.md) or open an [issue](https://github.com/oniricloud/oniriTunnel-build-terminal/issues).