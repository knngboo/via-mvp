# VIA MVP: Transit Data Platform

A secure, containerized full-stack application to centralize and analyze VIA Metropolitan Transit ridership data using Node.js, MongoDB, and React.

## Architecture

* **Frontend:** React (Vite) - Accessible at localhost:5173.
* **Backend:** Node.js / Express - API Gateway, accessible at localhost:5001.
* **Database:** MongoDB (Dockerized) - Securely gated via environment variables.
* **Orchestration:** Docker Compose - Manages the unified network.

## Getting Started

### 1. Prerequisites
* Docker Desktop installed and running.
* `pnpm` installed for managing frontend/backend dependencies.

### 2. Environment Configuration
You must create a `.env` file in the root directory before launching. This file is ignored by Git to protect your database credentials.

Create a `.env` file and add:

```plaintext
PORT=5001
MONGO_INITDB_ROOT_USERNAME=admin
MONGO_INITDB_ROOT_PASSWORD=your_secure_password_here
MONGO_URI=mongodb://admin:your_secure_password_here@mongodb:27017/viadata?authSource=admin
```

### 3. Launching the Platform
* Open your terminal in the root `via-mvp` folder.
* Build and start the containerized environment:

```bash
docker compose up --build
```

* Verify the backend connection by visiting: [http://localhost:5001/health](http://localhost:5001/health)

## Project Roadmap
* **Phase 1: Ingestion (In Progress)** - Implementing GTFS/APC data parsing via `node-gtfs`.
* **Phase 2: Analytics** - Porting visualization components from the legacy potholes project.
* **Phase 3: AI Integration** - Implementing MongoDB-native aggregation pipelines for Gemini analysis.