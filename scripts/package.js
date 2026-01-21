#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const platform = process.platform === 'darwin' ? 'darwin' : process.platform === 'win32' ? 'win32' : 'linux';
const arch = process.arch === 'arm64' ? 'arm64' : 'x64';
const targetPlatform = `${platform}-${arch}`;

const outputDir = path.join(__dirname, '..', 'prebuilds', 'package');
const binDir = path.join(__dirname, '..', 'prebuilds', 'bin');
const nodeModulesDir = path.join(__dirname, '..', 'node_modules');

// Create output directory structure
const packageNodeModulesDir = path.join(outputDir, 'node_modules');
fs.mkdirSync(outputDir, { recursive: true });

console.log(`📦 Packaging for ${targetPlatform}...`);

// Copy executable
const executableName = 'oniritunnel';
const executableSrc = path.join(binDir, executableName);
const executableDest = path.join(outputDir, executableName);

if (!fs.existsSync(executableSrc)) {
  console.error(`❌ Executable not found: ${executableSrc}`);
  console.error('   Run "npm run build" first');
  process.exit(1);
}

fs.copyFileSync(executableSrc, executableDest);
fs.chmodSync(executableDest, 0o755);
console.log(`✓ Copied executable: ${executableName}`);

// Copy entire node_modules directory (required for Bare module resolution)
console.log(`\n📦 Copying complete node_modules directory...`);
console.log(`   This ensures all JavaScript modules and .bare addons are available`);

function copyDirRecursive(src, dest) {
  if (!fs.existsSync(src)) return;
  
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    
    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else if (entry.isFile()) {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

copyDirRecursive(nodeModulesDir, packageNodeModulesDir);
console.log(`✓ Complete node_modules copied`);

// Create wrapper script
const wrapperScript = `#!/bin/bash
SCRIPT_DIR="$(cd "$(dirname "\${BASH_SOURCE[0]}")" && pwd)"
export BARE_MODULE_PATH="\${SCRIPT_DIR}/node_modules"
exec "\${SCRIPT_DIR}/oniritunnel" "$@"
`;

const wrapperPath = path.join(outputDir, 'oniritunnel.sh');
fs.writeFileSync(wrapperPath, wrapperScript);
fs.chmodSync(wrapperPath, 0o755);

console.log(`\n✓ Created wrapper script: oniritunnel.sh`);

// Create README
const readme = `# OniriTunnel - ${targetPlatform}

This package contains the OniriTunnel executable and all required addon modules.

## Important: Runtime Requirements

The OniriTunnel executable requires the \`node_modules\` directory to be present in the same directory.

**Option 1: Run from the package directory (recommended)**
\`\`\`bash
cd oniritunnel-${targetPlatform}
./oniritunnel [options]
\`\`\`

**Option 2: Create symlink at /main.bundle (macOS/Linux)**
\`\`\`bash
sudo mkdir -p /main.bundle
sudo ln -sfn "$(pwd)/node_modules" /main.bundle/node_modules
./oniritunnel [options]
\`\`\`

**Option 3: Use the wrapper script**
\`\`\`bash
./oniritunnel.sh [options]
\`\`\`
Note: The wrapper script is currently a workaround that doesn't fully resolve the path issue.

## Structure
- \`oniritunnel\` - Main executable  
- \`node_modules/\` - Required .bare addon files and JavaScript modules (DO NOT REMOVE)
- \`oniritunnel.sh\` - Wrapper script
- \`README.md\` - This file

## Technical Details

The Bare runtime dynamically loads native addons (.bare files) from \`/main.bundle/node_modules/\`.  
This is a virtual filesystem path that currently cannot be redirected in standalone builds.

For production deployment, consider one of these approaches:
1. Package the entire directory and run from within it
2. Create the /main.bundle symlink as part of your installation process
3. Contribute to Bare to add support for customizable addon search paths

## Platform
Built for: ${targetPlatform}
`;

fs.writeFileSync(path.join(outputDir, 'README.md'), readme);

console.log(`\n✅ Packaging complete!`);
console.log(`\n📍 Output: ${outputDir}`);
console.log(`\n🚀 To run:`);
console.log(`   cd ${path.relative(process.cwd(), outputDir)}`);
console.log(`   ./oniritunnel.sh --version`);
console.log(`\n💡 Or create a tarball:`);
console.log(`   tar -czf oniritunnel-${targetPlatform}.tar.gz -C prebuilds package`);
