# bSignalizer: Comprehensive Software Requirements & Design Specification (SRDS)

---

## 1. Introduction
### 1.1 Purpose
This document defines the full technical specification, design rationale, and implementation roadmap for **bSignalizer**, a web‑native, AI‑enhanced CAN bus analysis and time‑series visualization platform that supersedes Vector vSignalyzer.

### 1.2 Scope
*   Target audience: Embedded software engineers, data scientists, UI/UX designers, DevOps engineers.
*   Supported operating environments: Windows, Linux, macOS (both local and cloud‑hosted deployments).
*   Data sources: Vector `.asc/.blf`, CANedge `.mf4`, SocketCAN `.log`, proprietary binary logs, live CAN bus streams.

### 1.3 Definitions & Acronyms
| Acronym | Definition |
| :--- | :--- |
| **CAN** | Controller Area Network – automotive field‑bus protocol |
| **DBC** | Database file describing CAN message layouts |
| **MF4** | ASAM Measurement Data Format version 4 – column‑oriented binary log format |
| **LTTB** | Largest‑Triangle‑Three‑Buckets, a perceptually‑accurate downsampling method |
| **AI** | Artificial Intelligence – algorithms for anomaly detection, data summarisation |
| **AR** | Augmented Reality – optional future extension for overlaying sensor data |
| **VDM** | Vector Data Management – legacy vector ecosystem |

---

## 2. Problem Statement & Vision
Legacy tools suffer from three core limitations:
1. **Performance bottlenecks** – loading >1 GB logs stalls the UI for minutes.
2. **Closed ecosystems** – Windows‑only, costly licenses, difficult to integrate with CI pipelines.
3. **Lack of intelligence** – No native AI for anomaly detection or natural‑language search.

**bSignalizer** aims to create a *Google‑Docs‑style* collaborative environment where engineers can upload, decode, explore, annotate, and share CAN data instantly, while leveraging AI to surface insights automatically.

---

## 3. Architecture Overview
```mermaid
flowchart LR
    subgraph Backend [Python Backend]
        A[Ingestion (python‑can)] --> B[Decode (cantools)] --> C[Standardize (asammdf → MF4)] --> D[Analytics (DuckDB)] --> E[API (FastAPI)]
        D --> F[AI Services (PyOD, LSTM, Gemini)]
    end
    subgraph Frontend [React SPA]
        G[Signal Tree UI] --> H[Plotting (Plotly.js / uPlot)]
        G --> I[3D Twin (Three.js)]
        H --> J[Web Workers (Downsampling, LTTB)]
        E --> K[Arrow Stream (Binary)] --> H
        E --> L[WebSocket (Live Collaboration)] --> G
    end
    style Backend fill:#f9f,stroke:#333,stroke-width:2px;
    style Frontend fill:#9ff,stroke:#333,stroke-width:2px;
```

### 3.1 Backend Components
| Component | Library | Key Responsibilities |
| :--- | :--- | :--- |
| **Ingestion** | `python‑can` | Reads raw log files or live sockets, normalises timestamps, emits `CanMessage` objects |
| **Decoding** | `cantools` | Parses DBC files, resolves multiplexed signals, produces pandas DataFrames per signal |
| **Standardisation** | `asammdf` | Converts any source to MF4, applies compression (`zlib`, `lz4`), builds channel index |
| **Analytics** | `DuckDB` | Provides SQL‑style querying, aggregation, rolling windows, anomaly flag generation |
| **AI Services** | `PyOD`, `torch` (LSTM), `google‑gemini‑client` | Outlier detection, predictive health forecasting, natural‑language summarisation |
| **API Layer** | `FastAPI` (async) | Auth, session management, Arrow streaming, WebSocket hub for collaboration |

### 3.2 Frontend Components
| Component | Library | Highlights |
| :--- | :--- | :--- |
| **State Mgmt** | `Zustand` + `React‑Query` | Global store for session ID, selected DBC, layout; auto‑caching of Arrow chunks |
| **Plotting** | `Plotly.js` (scattergl) + `uPlot` | Feature‑rich hover, lasso, annotation, but also ultra‑fast pixel‑perfect overview |
| **Downsampling** | `Web Workers` (LTTB impl in TypeScript) | Off‑main‑thread reduction from millions → thousands of points |
| **3D Twin** | `Three.js` + `React‑Three‑Fiber` | Syncs IMU/GPS to vehicle model, renders Radar/LiDAR frustums as transparent meshes |
| **Video Sync** | `HTMLVideoElement` + `MediaSource` API | Frame‑accurate correlation with vertical cursor (≤5 ms drift) |
| **Collaboration** | `Yjs` + `WebSocket` | Real‑time cursor sharing, annotation broadcasting, conflict‑free CRDT state |

---

## 4. Detailed Data Pipeline
1. **Upload** – `POST /session/create` with binary log + optionally a DBC zip. Backend stores the raw file in `data/raw/`.
2. **Conversion** – A `ProcessPoolExecutor` worker runs:
   * `python‑can` parses raw frames → `Frame` objects.
   * `cantools` loads one or more DBCs, creates a `Database`.
   * `asammdf` writes an MF4 file (`data/standardized/<session>.mf4`).
3. **Indexing** – DuckDB creates a virtual table `SELECT * FROM read_mdf('*.mf4')` allowing column‑wise SQL.
4. **Signal Tree Generation** – The backend extracts a hierarchical JSON (`Message → Signal`) and caches it in Redis.
5. **Arrow Streaming** – When a client requests `GET /data?signal=XYZ&start=...&end=...&maxPoints=5000`, the server:
   * Runs a DuckDB query for the time window.
   * Applies optional LTTB downsampling.
   * Serialises the result as an Arrow `RecordBatch` and streams via HTTP/2.
6. **Frontend Rendering** – A dedicated Web Worker receives the Arrow buffer, populates a `Float32Array`, and triggers the Plotly/uPlot redraw.
7. **Annotation Persistence** – Annotations are stored as JSON documents in PostgreSQL, linked to session ID and timestamp range.

---

## 5. API Specification (FastAPI) – Expanded
```python
# ---------------------------------------------------------------------------
# Session Management
# ---------------------------------------------------------------------------
@app.post("/session/create")
async def create_session(
    log_file: UploadFile = File(...),
    dbc_files: List[UploadFile] = File(None),
    description: Optional[str] = Form(None),
    auth: AuthInfo = Depends(auth_required),
) -> SessionInfo:
    """Create a new analysis session.
    * Stores raw file under `data/raw/`.
    * Starts async conversion pipeline.
    * Returns a UUID session_id used for all subsequent calls.
    """
    pass

@app.get("/session/{session_id}/status")
async def session_status(session_id: str) -> SessionStatus:
    """Poll conversion progress – returns one of: `queued`, `converting`, `ready`, `failed`."""
    pass

# ---------------------------------------------------------------------------
# Signal Discovery
# ---------------------------------------------------------------------------
@app.get("/session/{session_id}/signals")
async def list_signals(session_id: str, search: Optional[str] = None) -> List[SignalMeta]:
    """Return a tree‑structured list of available signals. Supports fuzzy search on name/ID/unit."""
    pass

# ---------------------------------------------------------------------------
# Data Retrieval
# ---------------------------------------------------------------------------
@app.get("/session/{session_id}/data")
async def get_signal_data(
    session_id: str,
    signal: str,
    start: float,
    end: float,
    max_points: int = 5000,
    downsample: bool = True,
) -> StreamingResponse:
    """Stream Arrow‑encoded data for a single signal.
    * `start`/`end` are epoch seconds.
    * If `downsample` is True, LTTB is applied to produce ≤ `max_points`.
    """
    pass

# ---------------------------------------------------------------------------
# Query Engine (DuckDB)
# ---------------------------------------------------------------------------
@app.post("/session/{session_id}/query")
async def run_query(session_id: str, sql: str) -> QueryResult:
    """Execute arbitrary SQL against the underlying MF4/DuckDB tables. Returns Arrow payload.
    * The endpoint is sandboxed – only SELECT queries are allowed.
    """
    pass

# ---------------------------------------------------------------------------
# AI Services
# ---------------------------------------------------------------------------
@app.post("/session/{session_id}/ai/anomaly")
async def detect_anomalies(
    session_id: str,
    signals: List[str],
    model: Literal["isolation_forest", "autoencoder"] = "isolation_forest",
) -> AnomalyReport:
    """Run AI anomaly detection on the selected signals and return spans of outliers.
    * Returns JSON with `start`, `end`, `score`.
    """
    pass

@app.post("/session/{session_id}/ai/summary")
async def summarize_log(
    session_id: str,
    window: Optional[Tuple[float, float]] = None,
) -> SummaryReport:
    """Ask Gemini to produce a natural‑language summary of the whole log or a time window.
    * Output includes key events, statistic tables, and recommended actions.
    """
    pass

# ---------------------------------------------------------------------------
# Collaboration
# ---------------------------------------------------------------------------
@app.websocket("/ws/collab/{session_id}")
async def collaboration_socket(websocket: WebSocket, session_id: str):
    """WebSocket hub for shared cursor positions, annotation broadcasting, and live chat.
    * Utilises Yjs CRDT for conflict‑free state.
    """
    pass
```

---

## 6. Frontend UI Blueprint
### 6.1 Layout Grid System
* **Responsive 12‑column grid** (Tailwind) – each plot canvas occupies a configurable set of columns.
* **Saved Layouts**: JSON schema storing panel IDs, dimensions, and assigned signals.
* **Sync Modes**: `globalZoom` (default) or `independent` toggles on a per‑panel basis.

### 6.2 Signal Tree Panel
* **Search Box** – fuzzy match on name, CAN ID, unit, or description.
* **Tree Nodes** – expand/collapse per DBC message; leaf nodes are individual signals.
* **Context Menu** – right‑click → `Add to Plot`, `Create Virtual Channel`, `Export CSV`.

### 6.3 Plot Canvas
| Feature | Plotly | uPlot |
| :--- | :--- | :--- |
| Hover tooltips | ✅ (HTML) | ❌ (limited) |
| LTTB downsampling | ✅ (via backend) | ✅ (client‑side) |
| Real‑time streaming | ✅ (WebSocket) | ✅ |
| Export PNG/SVG | ✅ | ✅ |
| Custom axis scaling | ✅ | ✅ |

* **Annotations Toolbar** – rectangle ROI, vertical marker, text label.
* **Keyboard Shortcuts** – `Z` zoom, `P` pan, `A` add annotation, `S` save layout.

### 6.4 3D Twin Panel
* **Model Loading** – GLTF files for vehicle body; separate mesh for sensors.
* **Telemetry Mapping** – IMU (pitch/roll/yaw) drives vehicle orientation, GPS drives world position.
* **Sensor Frustums** – Radar/LiDAR beams visualised as transparent cones, colour‑coded by range.
* **Sync Cursor** – A vertical line in 2D plots moves a 3D “time‑slice” marker.

---

## 7. AI/ML Detailed Design
### 7.1 Anomaly Detection Service
1. **Feature Engineering** – Normalise each selected signal (z‑score).
2. **Model Selection** – Isolation Forest (default) for unsupervised, Autoencoder (optional) for deep patterns.
3. **Training** – Per‑session lightweight model trained on a user‑selected “baseline” window (e.g., first 30 s).
4. **Scoring** – Output a **contamination score** per timestamp; thresholds configurable via UI.
5. **Visualization** – Heatmap overlay beneath the signal trace, with a legend.

### 7.2 Predictive Maintenance (LSTM)
* **Input Window** – 60 s sliding window of multi‑signal tensor.
* **Target** – Future values of critical metrics (e.g., battery temperature, coolant pressure).
* **Training** – Periodic offline job on historical logs; persisted model in `models/`.
* **Inference API** – `POST /session/{id}/ai/predict` returning a forecast curve and confidence interval.

### 7.3 Gemini‑Powered Summarisation
* **Prompt Template** – "Summarize the following log segment, focusing on temperature spikes, error frames, and any driver actions. Include a table of max/min values."
* **Chunking** – Logs >5 min are split into overlapping windows (10 % overlap) to respect token limits.
* **Post‑Processing** – Merge overlapping summaries, deduplicate bullet points, and generate markdown output.

---

## 8. Deployment & Operations
### 8.1 Containerisation
* **Backend Dockerfile** – multi‑stage: build stage installs `python‑3.12`, requirements, compiles any C extensions; runtime stage uses `python‑slim`.
* **Frontend Dockerfile** – Vite build -> `nginx` static serve.
* **Compose** – `docker-compose.yaml` defines services: `backend`, `frontend`, `postgres`, `redis`, `arrow-flight-server`.

### 8.2 Kubernetes Production
* **Helm Chart** – values for replica count, resource limits, autoscaling thresholds.
* **Ingress** – TLS termination via cert‑manager.
* **Observability** – Prometheus metrics (`/metrics` endpoint), Grafana dashboards for request latency, Arrow payload size, and AI inference time.

### 8.3 CI/CD Pipeline (GitHub Actions)
```yaml
name: CI
on: [push, pull_request]
jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Install Python deps
        run: pip install flake8
      - run: flake8 backend/
      - name: Install JS deps
        run: npm ci --prefix frontend
      - run: npm run lint --prefix frontend
  test:
    runs-on: ubuntu-latest
    needs: lint
    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_USER: test
          POSTGRES_PASSWORD: test
          POSTGRES_DB: testdb
        ports: [5432:5432]
    steps:
      - uses: actions/checkout@v3
      - name: Run backend tests
        run: pytest backend/tests
      - name: Playwright E2E
        run: npx playwright test --project=chromium
  build:
    runs-on: ubuntu-latest
    needs: test
    steps:
      - uses: actions/checkout@v3
      - name: Build Docker images
        run: |
          docker build -t ghcr.io/yourorg/bsignalizer-backend:latest -f backend/Dockerfile .
          docker build -t ghcr.io/yourorg/bsignalizer-frontend:latest -f frontend/Dockerfile .
      - name: Push to registry
        run: |
          echo ${{ secrets.GITHUB_TOKEN }} | docker login ghcr.io -u ${{ github.actor }} --password-stdin
          docker push ghcr.io/yourorg/bsignalizer-backend:latest
          docker push ghcr.io/yourorg/bsignalizer-frontend:latest
```
---

## 9. Testing Strategy
| Test Type | Scope | Tools |
| :--- | :--- | :--- |
| Unit | Backend decoding, Arrow serialization, AI model inference | `pytest`, `pytest‑asyncio` |
| Integration | End‑to‑end upload → plot → annotation workflow | `requests`, `httpx`, `Playwright` |
| Performance | Load 2 GB MF4, query 10 k‑point window, measure latency | `locust`, custom benchmark script |
| Security | JWT validation, role‑based endpoint gating, OWASP scan | `zap`, `bandit` |
| UI/UX | Accessibility (WCAG 2.1 AA), responsive breakpoints | `axe‑core`, manual testing |

### 9.1 Benchmark Sample (Backend)
```bash
# Simulate a 2 GB MF4 with 5 M rows, request 100 k points
python benchmark.py --session test123 --signal Engine_RPM --points 100000
# Expected latency < 250 ms for Arrow payload, < 100 ms for UI render
```

---

## 10. Risk & Mitigation Matrix
| Risk | Likelihood | Impact | Mitigation |
| :--- | :--- | :--- | :--- |
| Large log ingestion exceeds container memory | Medium | High | Use streaming conversion, limit max concurrent jobs, monitor with Prometheus |
| AI model drift (false positives) | Low | Medium | Provide UI for manual threshold tuning, periodic retraining on validated datasets |
| Vendor DBC incompatibility | Medium | Low | Implement a DBC validation step, fallback to raw hex view |
| Real‑time collaboration latency > 200 ms | Low | Medium | Deploy WebSocket servers in edge locations, enable client‑side prediction of cursor movement |

---

## 11. Future Enhancements (Roadmap)
| Milestone | Target Release | Features |
| :--- | :--- | :--- |
| **MVP (Q4 2026)** | v0.1 | Upload, decode, Plotly view, basic annotation |
| **Performance Tier (Q1 2027)** | v0.2 | Arrow streaming, uPlot fallback, LTTB downsampling |
| **AI Suite (Q2 2027)** | v0.3 | Anomaly detection, Gemini summarisation, predictive LSTM |
| **Collaboration (Q3 2027)** | v0.4 | Yjs shared sessions, live cursor, comment threads |
| **3D Twin + Video (Q4 2027)** | v0.5 | Full three‑js vehicle model, dashcam sync, AR preview |
| **Enterprise Hardened (2028)** | v1.0 | RBAC, audit logs, multi‑tenant isolation, on‑prem installer |

---

## 12. Appendix – Reference Library Versions
| Category | Library | Recommended Version |
| :--- | :--- | :--- |
| **Backend** | `FastAPI` | 0.110.0 |
| **Backend** | `python‑can` | 4.4.0 |
| **Backend** | `cantools` | 39.4.0 |
| **Backend** | `asammdf` | 8.1.0 |
| **Backend** | `DuckDB` | 0.10.2 |
| **Backend** | `PyArrow` | 15.0.0 |
| **AI** | `PyOD` | 1.1.2 |
| **AI** | `torch` | 2.3.0 |
| **Frontend** | `React` | 18.2.0 |
| **Frontend** | `Tailwind` | 3.4.0 |
| **Plotting** | `Plotly.js` | 2.30.0 |
| **Plotting** | `uPlot` | 1.6.21 |
| **3D** | `Three.js` | r165 |
| **Collab** | `Yjs` | 13.6.2 |
| **Testing** | `Playwright` | 1.41.0 |

---

## 13. Glossary (Extended)
* **Virtual Signal** – A user‑defined expression that computes a new channel from existing ones (e.g., power = voltage * current).
* **Chunk** – A time‑bounded slice of an MF4 file, typically 1 s – 10 s, used for parallel processing.
* **Telemetry Hub** – Service that aggregates live CAN streams from multiple test benches and forwards them to the backend.
* **Arrow Flight** – A high‑performance RPC protocol for sending Arrow‑encoded data over the network.
* **CRDT** – Conflict‑free Replicated Data Type, enabling real‑time collaborative edits without merge conflicts.
* **LTTB** – Algorithm that selects points maximizing visual fidelity when downsampling.
* **OT** – Operational Transformation, alternative to CRDT (mentioned for future comparative study).

---

## 14. Bibliography & References
1. **Vector vSignalyzer** – Official product documentation, Vector GmbH.
2. **asammdf** – https://github.com/danielhrisca/asammdf
3. **cantools** – https://github.com/eerimoq/cantools
4. **DuckDB** – https://duckdb.org
5. **PyOD** – https://pyod.readthedocs.io
6. **Plotly.js** – https://github.com/plotly/plotly.js
7. **uPlot** – https://github.com/leeoniya/uPlot
8. **Apache Arrow** – https://arrow.apache.org
9. **Yjs** – https://github.com/yjs/yjs
10. **FastAPI** – https://fastapi.tiangolo.com

---

*Prepared by the Antigravity team, April 2026. This SRDS will be version‑controlled and evolves with each sprint.*
