# Production backend container — Flask served by gunicorn (gthread workers so
# SSE chat streaming isn't blocked by concurrent requests).
#
FROM python:3.12-slim
WORKDIR /app

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

# Install dependencies first (layer-cached unless requirements.txt changes)
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy application source
COPY . .

# Run as non-root user for security
RUN useradd --create-home appuser
USER appuser

ENV NODE_ENV=production
EXPOSE 5001
CMD ["gunicorn", "--bind", "0.0.0.0:5001", \
     "--worker-class", "gthread", "--workers", "2", "--threads", "4", \
     "--timeout", "360", "app:app"]
