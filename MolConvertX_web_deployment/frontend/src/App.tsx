import { useEffect, useMemo, useState } from "react";

// Set VITE_API_URL in the deployment environment to the public FastAPI URL.
const API = (import.meta.env.VITE_API_URL || "http://127.0.0.1:8000").replace(/\/$/, "");
const formats = ["mol", "sdf", "pdb", "pdbqt", "mol2", "xyz"];
const forcefields = ["MMFF94", "MMFF94s", "UFF", "GAFF", "Ghemical"];

function decodeLog(value: string | null) {
  if (!value) return "Open Babel completed successfully.";
  try {
    const binary = atob(value.replace(/-/g, "+").replace(/_/g, "/"));
    const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch { return "Conversion completed. (Could not decode conversion log.)"; }
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function App() {
  const [mode, setMode] = useState<"file" | "smiles">("file");
  const [file, setFile] = useState<File | null>(null);
  const [inputType, setInputType] = useState("sdf");
  const [outputType, setOutputType] = useState("pdbqt");
  const [smiles, setSmiles] = useState("");
  const [outputName, setOutputName] = useState("");
  const [addHydrogens, setAddHydrogens] = useState(true);
  const [partialCharges, setPartialCharges] = useState(true);
  const [chargeModel, setChargeModel] = useState("gasteiger");
  const [minimize, setMinimize] = useState(true);
  const [forcefield, setForcefield] = useState("MMFF94");
  const [steps, setSteps] = useState(1500);
  const [steepest, setSteepest] = useState(false);
  const [gen3d, setGen3d] = useState(true);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("Ready");
  const [log, setLog] = useState("");
  const [savedPath, setSavedPath] = useState("");
  const [obabelOK, setObabelOK] = useState(false);

  useEffect(() => {
    fetch(`${API}/api/health`)
      .then(async r => { if (!r.ok) throw new Error("Health check failed"); return r.json(); })
      .then(x => { setObabelOK(Boolean(x.openbabel_found)); setStatus(x.openbabel_found ? "Ready" : "Open Babel is unavailable on the server"); })
      .catch(() => { setObabelOK(false); setStatus("Conversion server is unavailable"); });
  }, []);

  const isPdbqt = outputType === "pdbqt";
  const canRun = mode === "file" ? !!file : !!smiles.trim();
  const outputFilename = useMemo(() => {
    if (outputName.trim()) return outputName.trim();
    if (file) return file.name.replace(/\.[^.]+$/, `.${outputType}`);
    return `smiles_molecule.${outputType}`;
  }, [file, outputName, outputType]);

  async function convert() {
    if (!canRun || busy) return;
    setBusy(true); setStatus("Converting..."); setLog(""); setSavedPath("");
    try {
      const common = {
        output_type: outputType, output_name: outputFilename,
        add_hydrogens: addHydrogens, partial_charges: partialCharges,
        charge_model: chargeModel, minimize, forcefield, steps,
        steepest_descent: steepest, gen3d
      };
      let response: Response;
      if (mode === "smiles") {
        response = await fetch(`${API}/api/convert-smiles`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...common, input_type: "smiles", smiles })
        });
      } else {
        const form = new FormData();
        form.append("file", file!); form.append("input_type", inputType);
        Object.entries(common).forEach(([k, v]) => form.append(k, String(v)));
        response = await fetch(`${API}/api/convert-file`, { method: "POST", body: form });
      }
      if (!response.ok) {
        let message = "Conversion failed";
        try { const data = await response.json(); message = data.detail || message; } catch { /* non-JSON error */ }
        throw new Error(message);
      }
      const blob = await response.blob();
      const disposition = response.headers.get("Content-Disposition") || "";
      const match = disposition.match(/filename\*=UTF-8''([^;]+)|filename="?([^";]+)"?/i);
      const filename = decodeURIComponent(match?.[1] || match?.[2] || outputFilename);
      downloadBlob(blob, filename);
      setStatus("Conversion completed — download started");
      setLog(decodeLog(response.headers.get("X-Conversion-Log")));
      setSavedPath(`Downloaded as ${filename}`);
    } catch (e: unknown) {
      setStatus("Conversion failed");
      setLog(e instanceof Error ? e.message : String(e));
    } finally { setBusy(false); }
  }

  return (
    <div className="app">
      <header>
        <div><div className="brand">🧬 MolConvertX</div><div className="subtitle">Molecular format conversion & docking preparation</div></div>
        <div className={obabelOK ? "engine ok" : "engine bad"}>Open Babel: {obabelOK ? "Ready" : "Unavailable"}</div>
      </header>
      <main>
        <section className="card">
          <h2>Input</h2>
          <div className="tabs">
            <button className={mode === "file" ? "active" : ""} onClick={() => setMode("file")}>File Upload</button>
            <button className={mode === "smiles" ? "active" : ""} onClick={() => setMode("smiles")}>SMILES</button>
          </div>
          {mode === "file" ? <>
            <label>Input format</label>
            <select value={inputType} onChange={e => setInputType(e.target.value)}>{formats.map(f => <option key={f} value={f}>{f.toUpperCase()}</option>)}</select>
            <label className="dropzone"><input type="file" accept={formats.map(f => `.${f}`).join(",")} onChange={e => setFile(e.target.files?.[0] || null)} /><strong>{file ? file.name : "Drop a molecule file here"}</strong><span>or click to browse</span></label>
          </> : <>
            <label>SMILES</label><textarea value={smiles} onChange={e => setSmiles(e.target.value)} placeholder="Example: CC(C)Cc1ccc(cc1)[C@@H](C)C(=O)O" />
            <div className="hint">Open Babel will generate 3D coordinates when enabled.</div>
          </>}
        </section>
        <section className="card">
          <h2>Conversion</h2><label>Output format</label>
          <select value={outputType} onChange={e => setOutputType(e.target.value)}>{formats.map(f => <option key={f} value={f}>{f.toUpperCase()}</option>)}</select>
          {isPdbqt && <div className="panel">
            <h3>PDBQT / Docking Preparation</h3>
            <label className="check"><input type="checkbox" checked={gen3d} onChange={e => setGen3d(e.target.checked)} /> Generate 3D coordinates</label>
            <label className="check"><input type="checkbox" checked={addHydrogens} onChange={e => setAddHydrogens(e.target.checked)} /> Add hydrogens</label>
            <label className="check"><input type="checkbox" checked={partialCharges} onChange={e => setPartialCharges(e.target.checked)} /> Calculate partial charges</label>
            {partialCharges && <><label>Charge model</label><select value={chargeModel} onChange={e => setChargeModel(e.target.value)}><option value="gasteiger">Gasteiger</option><option value="mmff94">MMFF94</option></select></>}
            <label className="check"><input type="checkbox" checked={minimize} onChange={e => setMinimize(e.target.checked)} /> Energy minimize</label>
            {minimize && <><label>Force field</label><select value={forcefield} onChange={e => setForcefield(e.target.value)}>{forcefields.map(f => <option key={f}>{f}</option>)}</select><label>Maximum steps</label><input type="number" min="1" max="100000" value={steps} onChange={e => setSteps(Number(e.target.value))} /><label className="check"><input type="checkbox" checked={steepest} onChange={e => setSteepest(e.target.checked)} /> Use steepest descent</label></>}
          </div>}
        </section>
        <section className="card">
          <h2>Download Output</h2><label>Output filename</label><input value={outputFilename} onChange={e => setOutputName(e.target.value)} />
          <div className="hint">The converted molecule will be downloaded by your browser. No server folder path is needed.</div>
          <button className="convert" disabled={!canRun || busy || !obabelOK} onClick={convert}>{busy ? "⏳ Converting..." : "⚗ Convert & Download"}</button>
        </section>
        <section className="card">
          <h2>Process</h2><div className="status">{status}</div>{busy && <div className="progress"><div /></div>}{savedPath && <div className="success">✓ {savedPath}</div>}<pre>{log || "Conversion messages will appear here."}</pre>
        </section>
      </main>
    </div>
  );
}
