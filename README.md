# VIA MVP Platform

## Project Overview

**The Full Stack Architecture**
*   **Frontend:** React built with Vite for lightning-fast UI rendering.
*   **Backend:** Node.js with Express to handle API requests and data processing.
*   **Database:** PostgreSQL to securely store all platform data.
*   **Orchestration:** Docker Compose to run the entire stack locally with a single command.

**The Full Package**
*   **Secure Login:** A token-based authentication system to protect all routes and platform access.
*   **Buffi AI Dashboard:** The core interactive interface featuring markdown-enabled chat, geospatial mapping (Leaflet), and advanced data visualization (MUI Charts).
*   **Hub Data Platform:** A dedicated ingestion portal allowing users to securely upload, queue, clarify, and submit massive CSV datasets to the backend system.
*   **Database Architecture:** A fully containerized PostgreSQL database equipped with automated initialization scripts for instant, zero-config local setup.

## Local Setup Instructions

You do not need to manually install Node.js, NPM, or any packages to run this project. Docker handles absolutely everything for you in the background.

### Prerequisites
*   Docker Desktop installed and running on your machine.

### Quick Start
1. Open your terminal.
2. Navigate into the root directory of the project:

    cd via-mvp

3. Boot up the entire architecture (frontend, backend, and database) by running:

    docker compose up --build

4. Once the terminal says the containers are running, open your web browser and go to:
*   **Frontend UI:** `http://localhost:5173`
*   **Backend API:** `http://localhost:5001`

*(Note: If you ever add new dependencies to the project in the future, always run the command with the `--build` flag to ensure Docker installs them).*

## Accomplished Checkpoints
*   [x] Fully containerized Frontend, Backend, and Database with live hot-reloading.
*   [x] PostgreSQL configured with automated initialization scripts.
*   [x] Express server established and listening on port 5001.
*   [x] Clean React architecture established (`src/components`, `src/pages`, `src/context`, `src/services`).
*   [x] Secure React Router protected by an AuthContext token verification system.
*   [x] Merged fragmented legacy directories into a unified, flattened frontend architecture.
*   [x] Implemented UI for Data Platform pages (Sources, Queue, Clarification, Success).
*   [x] Integrated complex third-party libraries (Leaflet, Turf, MUI Charts, Emotion) for the main Dashboard.

## Next Milestones
*   [ ] UI Polish: Debug and fix the distorted CSS layouts on the main dashboard caused by the architecture migration.
*   [ ] API Wiring: Replace the frontend dummy data services with real Axios calls to the Express backend.
*   [ ] Database Schema: Design and implement the actual Postgres tables for User accounts and CSV metadata.
*   [ ] Backend Processing: Build the Express logic to parse, validate, and store uploaded CSV files.
*   [ ] AI Chat Integration: Wire the dashboard's chat UI to the AI processing layer.

