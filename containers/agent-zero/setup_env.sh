#!/bin/bash
set -e

# Enhanced environment setup that preserves parent environment
# This script ensures environment variables are inherited from parent process

echo "Setting up environment inheritance..."

# Create environment preservation script
ENV_PRESERVE_SCRIPT="/etc/profile.d/preserve-env.sh"
cat > "$ENV_PRESERVE_SCRIPT" << 'ENVEOF'
#!/bin/bash
# Preserve important environment variables from parent process

# If we have a parent environment file, source it
if [ -f "/root/agent_env.sh" ]; then
    source "/root/agent_env.sh"
fi

# Ensure GITHUB_TOKEN is available if set in parent
if [ -n "$GITHUB_TOKEN" ] && [ -z "$GITHUB_TOKEN_PRESERVED" ]; then
    export GITHUB_TOKEN_PRESERVED="$GITHUB_TOKEN"
fi

# Preserve all KUBERNETES_* variables
for var in $(env | grep '^KUBERNETES_' | cut -d= -f1); do
    if [ -n "${!var}" ]; then
        export "${var}_PRESERVED"="${!var}"
    fi
done
ENVEOF

chmod +x "$ENV_PRESERVE_SCRIPT"

# Update bashrc to source environment preservation
if ! grep -q "preserve-env.sh" /root/.bashrc 2>/dev/null; then
    echo "" >> /root/.bashrc
    echo "# Preserve environment from parent process" >> /root/.bashrc
    echo "source /etc/profile.d/preserve-env.sh" >> /root/.bashrc
fi

echo "Environment inheritance setup complete."
