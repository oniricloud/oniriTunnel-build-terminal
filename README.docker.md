# Oniri Tunnel Docker Setup

## Prerequisites

1. Have the URL to download the Linux executable (from GitHub releases or artifacts)
2. Your Oniri seed phrase and password

## Building the Docker Image

```bash
# Build with the executable download URL
docker build \
  --build-arg ONIRI_DOWNLOAD_URL="https://github.com/user/repo/releases/download/v1.0.0/oniri" \
  -t oniri-tunnel .
```

Or using a GitHub Actions artifact URL:
```bash
docker build \
  --build-arg ONIRI_DOWNLOAD_URL="https://github.com/user/repo/actions/runs/123456/artifacts/oniri" \
  -t oniri-tunnel .
```

## Running with Docker

### Option 1: Using Docker Run

```bash
docker run -d \
  --name oniri-tunnel \
  -e ONIRI_SEED="word1 word2 word3 word4 word5 word6 word7 word8 word9 word10 word11 word12" \
  -e ONIRI_PASSWORD="your-secure-password" \
  -v oniri-config:/root/.oniri \
  oniri-tunnel
```

### Option 2: Using Docker Compose

1. Create a `.env` file:
```bash
ONIRI_SEED=word1 word2 word3 word4 word5 word6 word7 word8 word9 word10 word11 word12
ONIRI_PASSWORD=your-secure-password
```

2. Start the service:
```bash
docker-compose up -d
```

## Environment Variables

- `ONIRI_SEED` (required on first run): Your 12-word seed phrase
- `ONIRI_PASSWORD` (required on first run): Your password for encryption
- `ONIRI_AUTO_START`: Auto-start the service (default: true)

## Persistent Configuration

The configuration is stored in `/root/.oniri/encp.json` inside the container. Using a Docker volume (`oniri-config`) ensures the configuration persists across container restarts.

Once configured, you can restart the container without providing `ONIRI_SEED` and `ONIRI_PASSWORD` again.

## Viewing Logs

```bash
# Follow logs
docker logs -f oniri-tunnel

# View last 100 lines
docker logs --tail 100 oniri-tunnel
```

## Managing the Container

```bash
# Stop the container
docker stop oniri-tunnel

# Start the container
docker start oniri-tunnel

# Restart the container
docker restart oniri-tunnel

# Remove the container
docker rm -f oniri-tunnel

# Reset configuration (remove volume)
docker volume rm oniri-config
```

## Security Notes

- Never commit `.env` files with real credentials to version control
- Store seed phrases securely
- Use Docker secrets in production environments
- Consider encrypting the configuration volume
