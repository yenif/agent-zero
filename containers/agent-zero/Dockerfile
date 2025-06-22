FROM frdel/agent-zero-run:latest

# Copy our custom install script
COPY install_dependencies.sh /tmp/install_dependencies.sh
RUN chmod +x /tmp/install_dependencies.sh

# Install additional dependencies that were previously in init container
RUN /tmp/install_dependencies.sh

# Set up the virtual environment and install Python dependencies
RUN /ins/setup_venv.sh

# Clone our fork and install dependencies
WORKDIR /git
RUN if [ -d "agent-zero" ]; then \
        cd agent-zero && \
        git remote add fork https://github.com/yenif/agent-zero.git && \
        git fetch fork && \
        git checkout fork/main; \
    else \
        git clone https://github.com/yenif/agent-zero.git && \
        cd agent-zero; \
    fi

# Install Python dependencies using uv
WORKDIR /git/agent-zero
RUN . /opt/venv/bin/activate && \
    if command -v uv >/dev/null 2>&1; then \
        uv pip install -r requirements.txt; \
    else \
        pip install -r requirements.txt; \
    fi

# Update environment handling to inherit from parent
COPY setup_env.sh /ins/setup_env.sh
RUN chmod +x /ins/setup_env.sh

# Copy the updated run script that preserves environment
COPY run_A0_with_env.sh /exe/run_A0.sh
RUN chmod +x /exe/run_A0.sh

WORKDIR /a0
