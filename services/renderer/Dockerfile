FROM python:3.11-slim

# System libraries required by Blender headless rendering
RUN apt-get update && apt-get install -y \
    curl \
    xz-utils \
    libglu1-mesa \
    libxi6 \
    libxrender1 \
    libxxf86vm1 \
    libxfixes3 \
    libgl1 \
    libxkbcommon0 \
    libsm6 \
    libice6 \
    libegl1 \
    libgles2 \
    && rm -rf /var/lib/apt/lists/*

# Download Blender 5.1 from the official mirror
ARG BLENDER_VERSION=5.1.1
RUN curl -fSL "https://download.blender.org/release/Blender5.1/blender-${BLENDER_VERSION}-linux-x64.tar.xz" \
    | tar -xJ -C /opt \
    && ln -s "/opt/blender-${BLENDER_VERSION}-linux-x64/blender" /usr/local/bin/blender \
    && blender --version

WORKDIR /app/renderer

# Install Python deps into the system Python (for server.py / Flask)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Install openai into Blender's embedded Python too (ai_enhance.py runs inside Blender)
RUN blender -b --python-expr \
    "import subprocess, sys; subprocess.check_call([sys.executable, '-m', 'pip', 'install', 'openai>=1.0.0'])"

# Copy all renderer scripts
COPY . .

ENV BLENDER_BIN=blender
ENV OUTPUT_DIR=/tmp/renderer_output

EXPOSE 5000

HEALTHCHECK --interval=15s --timeout=5s --start-period=60s --retries=5 \
    CMD curl -f http://localhost:5000/health || exit 1

CMD ["gunicorn", "server:app", "--bind", "0.0.0.0:5000", "--workers", "1", "--threads", "4", "--timeout", "120", "--access-logfile", "-"]
