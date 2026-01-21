#!/bin/bash
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}Oniri Tunnel Docker Container${NC}"
echo "================================"

# Check if configuration exists
CONFIG_DIR="/root/.oniri"
CONFIG_FILE="$CONFIG_DIR/encp.json"

if [ ! -f "$CONFIG_FILE" ]; then
    echo -e "${YELLOW}No configuration found. Initializing...${NC}"
    
    # Check if ONIRI_SEED and ONIRI_PASSWORD are set
    if [ -z "$ONIRI_SEED" ] || [ -z "$ONIRI_PASSWORD" ]; then
        echo -e "${RED}ERROR: ONIRI_SEED and ONIRI_PASSWORD environment variables must be set${NC}"
        echo ""
        echo "Usage:"
        echo "  docker run -e ONIRI_SEED='your-seed' -e ONIRI_PASSWORD='your-password' oniri-tunnel"
        echo ""
        echo "Example:"
        echo "  docker run -e ONIRI_SEED='word1 word2 ... word12' -e ONIRI_PASSWORD='mypassword' oniri-tunnel"
        exit 1
    fi
    
    echo -e "${GREEN}Creating configuration with provided seed and password...${NC}"
    
    # Create config directory if it doesn't exist
    mkdir -p "$CONFIG_DIR"
    
    # Create a Node.js script to generate the encrypted config
    cat > /tmp/create-config.js << 'EOFJS'
import { setEncKey } from '/app/services/oniri-core/src/oniriService/encKey.js';
import crypto from 'crypto';

const seed = process.env.ONIRI_SEED;
const password = process.env.ONIRI_PASSWORD;

// Generate encryption key from password (simplified version - adjust to match your actual implementation)
const encKey = crypto.createHash('sha256').update(password + seed).digest('hex');

const configData = {
    encKey: encKey,
    seed: seed,
    timestamp: Date.now()
};

// Write config file
setEncKey(configData, false, false, '/root');

console.log('Configuration created successfully');
EOFJS

    # Run the config creation script
    node /tmp/create-config.js || {
        # Fallback: Create config file directly with JSON
        echo -e "${YELLOW}Using direct JSON configuration...${NC}"
        
        # Simple approach: create the config JSON directly
        # Note: This stores the seed and a hash - adjust based on your actual encryption needs
        HASH=$(echo -n "${ONIRI_PASSWORD}${ONIRI_SEED}" | sha256sum | cut -d' ' -f1)
        
        cat > "$CONFIG_FILE" << EOF
{
    "encKey": "$HASH",
    "seed": "$ONIRI_SEED",
    "timestamp": $(date +%s)000
}
EOF
        chmod 600 "$CONFIG_FILE"
    }
    
    echo -e "${GREEN}Configuration created!${NC}"
else
    echo -e "${GREEN}Configuration found. Using existing configuration.${NC}"
fi

# Execute the command passed to the container
echo -e "${GREEN}Starting Oniri Tunnel Service...${NC}"
exec /app/oniri "$@"
