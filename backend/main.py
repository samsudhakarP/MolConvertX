from pathlib import Path
import base64
import os
import shutil
import subprocess
import tempfile
import uuid

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from starlette.background import BackgroundTask
from pydantic import BaseModel

app = FastAPI(title="MolConvertX API", version="1.0.0")

# Set FRONTEND_ORIGIN to the deployed GitHub Pages URL, e.g.
# https://your-user.github.io/MolConvertX
frontend_origin = os.getenv("FRONTEND_ORIGIN", "http://localhost:5173")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[frontend_origin, "http://127.0.0.1:5173"],
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"] ,
    expose_headers=["Content-Disposition", "X-Conversion-Log"],
)

SUPPORTED = {"mol", "sdf", "pdb", "pdbqt", "mol2", "xyz"}
OUTPUT_DIR = Path(os.getenv("MOLCONVERTX_OUTPUT_DIR", "/tmp/molconvertx-output"))
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

class ConvertRequest(BaseModel):
    input_type: str = "smiles"
    output_type: str
    smiles: str | None = None
    output_name: str | None = None
    add_hydrogens: bool = True
    partial_charges: bool = False
    charge_model: str = "gasteiger"
    minimize: bool = False
    forcefield: str = "MMFF94"
    steps: int = 1500
    steepest_descent: bool = False
    gen3d: bool = True


def find_obabel():
    return shutil.which("obabel") or shutil.which("babel")


def safe_filename(name: str) -> str:
    name = Path(name).name
    cleaned = "".join(c for c in name if c.isalnum() or c in "._- ")
    return cleaned.strip(" .") or "molecule"


def build_options(req: ConvertRequest):
    opts = []
    if req.gen3d:
        opts += ["--gen3d"]
    if req.add_hydrogens:
        opts += ["-h"]
    if req.partial_charges:
        opts += ["--partialcharge", req.charge_model]
    if req.minimize:
        opts += ["--minimize", "--ff", req.forcefield, "--steps", str(max(1, min(req.steps, 100000)))]
        if req.steepest_descent:
            opts += ["--sd"]
    return opts


def run_obabel(cmd, output_path: Path, cwd: str):
    try:
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=600, cwd=cwd)
    except subprocess.TimeoutExpired:
        raise HTTPException(status_code=504, detail="Open Babel conversion timed out.")
    log = ((proc.stdout or "") + "\n" + (proc.stderr or "")).strip()
    if proc.returncode != 0 or not output_path.exists() or output_path.stat().st_size == 0:
        raise HTTPException(status_code=400, detail=f"Open Babel conversion failed.\n{log}")
    return log


def response_file(path: Path, filename: str, log: str):
    encoded_log = base64.urlsafe_b64encode(log.encode("utf-8", errors="replace")).decode("ascii")
    return FileResponse(
        path,
        media_type="application/octet-stream",
        filename=filename,
        headers={"X-Conversion-Log": encoded_log},
        background=BackgroundTask(path.unlink, missing_ok=True),
    )


@app.get("/api/health")
def health():
    obabel = find_obabel()
    return {"status": "ok", "openbabel_found": bool(obabel), "openbabel_version": _obabel_version() if obabel else None}


def _obabel_version():
    try:
        p = subprocess.run([find_obabel(), "-V"], capture_output=True, text=True, timeout=10)
        return (p.stdout or p.stderr).strip()
    except Exception:
        return "unknown"


@app.post("/api/convert-file")
async def convert_file(
    file: UploadFile = File(...),
    input_type: str = Form(...),
    output_type: str = Form(...),
    output_name: str = Form(""),
    add_hydrogens: bool = Form(True),
    partial_charges: bool = Form(False),
    charge_model: str = Form("gasteiger"),
    minimize: bool = Form(False),
    forcefield: str = Form("MMFF94"),
    steps: int = Form(1500),
    steepest_descent: bool = Form(False),
    gen3d: bool = Form(False),
):
    input_type = input_type.lower().lstrip(".")
    output_type = output_type.lower().lstrip(".")
    if input_type not in SUPPORTED or output_type not in SUPPORTED:
        raise HTTPException(400, "Unsupported input or output format.")
    obabel = find_obabel()
    if not obabel:
        raise HTTPException(500, "Open Babel is unavailable on the conversion server.")

    req = ConvertRequest(input_type=input_type, output_type=output_type,
        add_hydrogens=add_hydrogens, partial_charges=partial_charges,
        charge_model=charge_model, minimize=minimize, forcefield=forcefield,
        steps=steps, steepest_descent=steepest_descent, gen3d=gen3d)
    filename = safe_filename(output_name.strip()) if output_name.strip() else f"{Path(safe_filename(file.filename or 'molecule')).stem}.{output_type}"
    if not filename.lower().endswith(f".{output_type}"):
        filename += f".{output_type}"

    with tempfile.TemporaryDirectory() as td:
        temp_dir = Path(td)
        temp_in = temp_dir / f"input.{input_type}"
        temp_out = temp_dir / f"output.{output_type}"
        with temp_in.open("wb") as target:
            while chunk := await file.read(1024 * 1024):
                target.write(chunk)
        log = run_obabel([obabel, str(temp_in), "-O", str(temp_out)] + build_options(req), temp_out, td)
        persisted = OUTPUT_DIR / f"{uuid.uuid4().hex}_{filename}"
        shutil.copy2(temp_out, persisted)
    return response_file(persisted, filename, log)


@app.post("/api/convert-smiles")
def convert_smiles(req: ConvertRequest):
    if not req.smiles or not req.smiles.strip():
        raise HTTPException(400, "SMILES input is empty.")
    req.output_type = req.output_type.lower().lstrip(".")
    if req.output_type not in SUPPORTED:
        raise HTTPException(400, "Unsupported output format.")
    obabel = find_obabel()
    if not obabel:
        raise HTTPException(500, "Open Babel is unavailable on the conversion server.")
    filename = safe_filename(req.output_name or f"smiles_molecule.{req.output_type}")
    if not filename.lower().endswith(f".{req.output_type}"):
        filename += f".{req.output_type}"

    with tempfile.TemporaryDirectory() as td:
        temp_out = Path(td) / f"output.{req.output_type}"
        cmd = [obabel, f"-:{req.smiles.strip()}", "-O", str(temp_out)] + build_options(req)
        log = run_obabel(cmd, temp_out, td)
        persisted = OUTPUT_DIR / f"{uuid.uuid4().hex}_{filename}"
        shutil.copy2(temp_out, persisted)
    return response_file(persisted, filename, log)
