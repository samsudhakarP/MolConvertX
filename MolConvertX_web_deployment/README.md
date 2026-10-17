# MolConvertX

MolConvertX is a browser-based molecular format converter and PDBQT preparation interface. The React + TypeScript frontend is hosted on GitHub Pages; the Python/FastAPI API and Open Babel run on a separate container host.

## Architecture

```text
Browser (GitHub Pages)
  React + TypeScript + Vite
           | HTTPS requests
           v
FastAPI service (Docker host, e.g. Render)
  Python + Open Babel
           |
           v
Conversion result streamed to browser download
```

The online version downloads the converted file through the browser. It cannot choose or write to an arbitrary folder on the visitor's computer: browser security restricts that. Users choose their download location through the browser's normal download settings. Electron/native folder selection is only available in the desktop build.

## Deploy the API (Render example)

1. Push this repository to a public GitHub repository named `MolConvertX`.
2. In Render, create a **Web Service** from that repository and choose **Docker** as the runtime.
3. Set the service root directory to `backend` and select Docker as the runtime. Use `backend/Dockerfile` if the platform asks for a repository-relative Dockerfile path, or `Dockerfile` if it resolves paths from the root directory.
4. Add environment variable `FRONTEND_ORIGIN` with your exact Pages URL, e.g. `https://YOUR-USERNAME.github.io` (no trailing slash). This is the origin, not the path `/MolConvertX/`.
5. Deploy. Test `https://YOUR-API-HOST/api/health`; expect JSON with `status: ok` and `openbabel_found: true`.
6. Keep in mind that free hosting may sleep when idle and may have CPU, memory, request-size, and execution-time limits. Molecular 3D generation/minimization may need a paid or more capable host for larger jobs.

## Deploy the frontend to GitHub Pages

1. Ensure the repository name is exactly `MolConvertX`. If it differs, change `base` in `frontend/vite.config.ts` and the workflow accordingly.
2. In GitHub repository **Settings → Pages → Build and deployment**, choose **GitHub Actions** as the source.
3. In **Settings → Secrets and variables → Actions → Variables**, add repository variable `MOLCONVERTX_API_URL` with the deployed API origin, e.g. `https://YOUR-API-HOST` (no trailing slash and no `/api` suffix).
4. Push to the `main` branch. The workflow builds `frontend/` and deploys `frontend/dist` to Pages.
5. Visit `https://YOUR-USERNAME.github.io/MolConvertX/` and check the Open Babel status indicator.

## Local development

### API

Install Open Babel on your computer and ensure `obabel -V` works. Then:

```bash
cd backend
python -m venv .venv
# Windows: .venv\\Scripts\\activate
# macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

For local Vite development, `VITE_API_URL` defaults to `http://127.0.0.1:8000`.

## Supported operations

- Upload MOL, SDF, PDB, PDBQT, MOL2, and XYZ files.
- Convert SMILES strings to supported output formats.
- Optional 3D coordinate generation, hydrogen addition, partial charges, and force-field minimization.
- PDBQT preparation controls for docking workflows.
- Conversion logs shown in the UI; output files download through the browser.

## Security and operational notes

- Treat uploaded molecular files as untrusted input. Set upload size limits, rate limits, request timeouts, and monitoring before exposing the service broadly.
- The API stores each result temporarily until the response finishes and then removes it. Do not use persistent server paths as client-side save locations.
- This starter has no authentication, queue, or per-user quota. Add these before offering the service at scale.
- Open Babel output, charge assignment, and energy minimization should be validated for the target downstream docking workflow. A successful file conversion is not scientific validation.
- Electron files remain for the separate desktop distribution; GitHub Pages only deploys the browser frontend.
