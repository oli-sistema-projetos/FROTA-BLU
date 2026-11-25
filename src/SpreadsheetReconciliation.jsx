import React, { useEffect, useRef, useState } from "react";
import * as XLSX from "xlsx";

const EMPTY_CONFIG = {
  plateColumn: "",
  sheetName: "",
  colunaRemarcar: "",
  colunaPneu: "",
  file: null,
};

function SheetIcon({ name, size = 18 }) {
  const common = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true };
  const paths = {
    alert: <><path d="M12 3 2.8 20h18.4L12 3Z" /><path d="M12 9v4m0 3h.01" /></>,
    close: <><path d="m18 6-12 12M6 6l12 12" /></>,
    file: <><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" /><polyline points="13 2 13 9 20 9" /></>,
    search: <><circle cx="10.8" cy="10.8" r="6.8" /><path d="m16 16 4 4" /></>,
    refresh: <><path d="M23 12a9 9 0 1 1-9-9 9 9 0 0 1 9 9z" /><path d="M17 12h-5v5" /></>,
    check: <><polyline points="20 6 9 17 4 12" /></>,
    download: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></>,
    truck: <><path d="M3 7h11v10H3zM14 11h4l3 3v3h-7z" /><circle cx="7" cy="18" r="2" /><circle cx="18" cy="18" r="2" /><path d="M6 10h5" /></>,
  };
  return <svg {...common}>{paths[name]}</svg>;
}

export function normalizePlate(value) {
  return String(value ?? "")
    .replace(/^(frotas?|placa|carretas?)\s*[-:.]?\s*/i, "")
    .replace(/[^A-Z0-9]/gi, "")
    .toLocaleUpperCase("pt-BR");
}

export function platesFromCell(value) {
  if (value === undefined || value === null) return [];
  return String(value)
    .split(/[,;/\n\t]+/)
    .map((part) => normalizePlate(part))
    .filter(Boolean);
}

function normalizeHeader(value) {
  return String(value ?? "")
    .trim()
    .toLocaleLowerCase("pt-BR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function detectColumn(headers, keywords) {
  const normalized = headers.map(normalizeHeader);
  for (const key of keywords) {
    const index = normalized.findIndex((header) => header.includes(normalizeHeader(key)));
    if (index !== -1) return headers[index];
  }
  return "";
}

export function detectFilialColumn(headers) {
  return detectColumn(headers, ["filial", "setor", "unidade", "loja", "origem"]);
}

export function detectLaunchDateColumn(headers) {
  return detectColumn(headers, ["data de lancamento", "data lancamento", "lancamento", "data"]);
}

export function detectRemarcarColumn(headers) {
  return detectColumn(headers, ["remarcar", "remarcacao", "remarcagem", "precisa remarcar"]);
}

export function detectPneuColumn(headers) {
  return detectColumn(headers, ["pneu", "pneus", "qual pneu"]);
}

export function detectPlateColumn(headers) {
  return detectColumn(headers, ["placa", "plate", "identificador", "frota", "veiculo"]) || headers[0] || "";
}

function parseCsvText(text) {
  const lines = text.split(/\r\n|\n/).filter((line) => line.trim().length > 0);
  if (lines.length === 0) return [];
  const headerLine = lines[0];
  const headers = headerLine.split(",").map((h) => h.replace(/^"|"$/g, "").trim());
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(",");
    const row = {};
    headers.forEach((header, index) => {
      row[header] = (values[index] ?? "").replace(/^"|"$/g, "").trim();
    });
    rows.push(row);
  }
  return rows;
}

function parseWorkbook(buffer, sheetName) {
  const workbook = XLSX.read(buffer, { type: "array" });
  const name = sheetName || workbook.SheetNames[0];
  const sheet = workbook.Sheets[name];
  return { rows: XLSX.utils.sheet_to_json(sheet, { defval: "", raw: false }), sheetNames: workbook.SheetNames };
}

async function arrayBufferFromFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error("Não foi possível ler o arquivo."));
    reader.readAsArrayBuffer(file);
  });
}

async function textFromFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error("Não foi possível ler o arquivo."));
    reader.readAsText(file);
  });
}

async function listSheetNames(buffer) {
  const workbook = XLSX.read(buffer, { type: "array" });
  return workbook.SheetNames;
}

export async function readSpreadsheet(input) {
  if (input.file) {
    const name = input.file.name.toLowerCase();
    if (name.endsWith(".csv")) {
      const text = await textFromFile(input.file);
      return { rows: parseCsvText(text), sheetNames: [] };
    }
    const buffer = await arrayBufferFromFile(input.file);
    if (input.sheetName) {
      const parsed = parseWorkbook(buffer, input.sheetName);
      return { rows: parsed.rows, sheetNames: parsed.sheetNames };
    }
    const sheetNames = await listSheetNames(buffer);
    return { rows: [], sheetNames };
  }
  throw new Error("Selecione um arquivo Excel/CSV da planilha.");
}

export default function SpreadsheetReconciliationDialog({
  open,
  onClose,
  config,
  result,
  dismissedPlates = new Set(),
  onSaveConfig,
  onRunReconciliation,
  onDismissPlate,
}) {
  const [mode, setMode] = useState(config.file ? "review" : "setup");
  const [plateColumn, setPlateColumn] = useState(config.plateColumn || "");
  const [file, setFile] = useState(config.file || null);
  const [sheetName, setSheetName] = useState(config.sheetName || "");
  const [sheetOptions, setSheetOptions] = useState([]);
  const [suggestedColumn, setSuggestedColumn] = useState("");
  const [suggestedFilial, setSuggestedFilial] = useState("");
  const [suggestedData, setSuggestedData] = useState("");
  const [suggestedRemarcar, setSuggestedRemarcar] = useState("");
  const [suggestedPneu, setSuggestedPneu] = useState("");
  const [columnOptions, setColumnOptions] = useState([]);
  const [colunaRemarcar, setColunaRemarcar] = useState(config.colunaRemarcar || "");
  const [colunaPneu, setColunaPneu] = useState(config.colunaPneu || "");
  const [colunaFilial, setColunaFilial] = useState(config.colunaFilial || "");
  const [colunaDataLancamento, setColunaDataLancamento] = useState(config.colunaDataLancamento || "");
  const autoRan = useRef(false);
  const busy = result.loading;

  useEffect(() => {
    setMode(config.file ? "review" : "setup");
    setPlateColumn(config.plateColumn || "");
    setSheetName(config.sheetName || "");
    setColunaRemarcar(config.colunaRemarcar || "");
    setColunaPneu(config.colunaPneu || "");
    setColunaFilial(config.colunaFilial || "");
    setColunaDataLancamento(config.colunaDataLancamento || "");
    setFile(config.file || null);
  }, [config]);

  useEffect(() => {
    if (!open) {
      autoRan.current = false;
      return;
    }
    if (autoRan.current || result.checkedAt || result.loading) return;
    if (!config.file) return;
    autoRan.current = true;
    onRunReconciliation(config);
  }, [open, config, result.checkedAt, result.loading, onRunReconciliation]);

  async function detectColumns(rows) {
    if (!rows || rows.length === 0) {
      setColumnOptions([]);
      setSuggestedColumn("");
      setSuggestedFilial("");
      setSuggestedData("");
      setSuggestedRemarcar("");
      setSuggestedPneu("");
      return;
    }
    const headers = Object.keys(rows[0]);
    const plate = detectPlateColumn(headers);
    const filial = detectFilialColumn(headers);
    const data = detectLaunchDateColumn(headers);
    const remarcar = detectRemarcarColumn(headers);
    const pneu = detectPneuColumn(headers);
    setColumnOptions(headers);
    setSuggestedColumn(plate);
    setSuggestedFilial(filial);
    setSuggestedData(data);
    setSuggestedRemarcar(remarcar);
    setSuggestedPneu(pneu);
    setPlateColumn(plate);
    setColunaFilial(filial);
    setColunaDataLancamento(data);
    setColunaRemarcar(remarcar);
    setColunaPneu(pneu);
  }

  async function loadSheets(selectedFile = file, selectedSheet = sheetName) {
    if (!selectedFile) return;
    const name = selectedFile.name.toLowerCase();
    if (!name.endsWith(".xlsx") && !name.endsWith(".xls")) return;
    try {
      const buffer = await arrayBufferFromFile(selectedFile);
      const names = await listSheetNames(buffer);
      setSheetOptions(names);
      if (!selectedSheet && names.length) setSheetName(names[0]);
    } catch (error) {
      alert(`Não foi possível ler as abas da planilha: ${error.message}`);
    }
  }

  async function previewFile(selectedFile = file, selectedSheet = sheetName) {
    if (!selectedFile) return;
    try {
      const name = selectedFile.name.toLowerCase();
      if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
        if (!selectedSheet) {
          await loadSheets(selectedFile, selectedSheet);
          return;
        }
        const result = await readSpreadsheet({ file: selectedFile, sheetName: selectedSheet });
        await detectColumns(result.rows);
      } else {
        const result = await readSpreadsheet({ file: selectedFile });
        await detectColumns(result.rows);
      }
    } catch (error) {
      alert(`Não foi possível ler a prévia do arquivo: ${error.message}`);
    }
  }

  async function handleSave() {
    if (!file) {
      alert("Selecione o arquivo Excel/CSV da planilha.");
      return;
    }
    if (!plateColumn) {
      alert("Informe a coluna que contém as placas da planilha.");
      return;
    }
    const payload = {
      ...EMPTY_CONFIG,
      plateColumn: plateColumn.trim(),
      sheetName: sheetName.trim(),
      colunaRemarcar: colunaRemarcar.trim(),
      colunaPneu: colunaPneu.trim(),
      colunaFilial: colunaFilial.trim(),
      colunaDataLancamento: colunaDataLancamento.trim(),
      file,
    };
    autoRan.current = true;
    onSaveConfig(payload);
    setMode("review");
    onRunReconciliation({
      file,
      plateColumn: plateColumn.trim(),
      sheetName: sheetName.trim() || undefined,
      colunaRemarcar: colunaRemarcar.trim() || undefined,
      colunaPneu: colunaPneu.trim() || undefined,
      colunaFilial: colunaFilial.trim() || undefined,
      colunaDataLancamento: colunaDataLancamento.trim() || undefined,
    });
  }

  async function handleRun() {
    if (!file) {
      alert("Selecione o arquivo Excel/CSV da planilha.");
      return;
    }
    if (!plateColumn) {
      alert("Informe a coluna que contém as placas da planilha.");
      return;
    }
    onRunReconciliation({
      file,
      plateColumn: plateColumn.trim(),
      sheetName: sheetName.trim() || undefined,
      colunaRemarcar: colunaRemarcar.trim() || undefined,
      colunaPneu: colunaPneu.trim() || undefined,
      colunaFilial: colunaFilial.trim() || undefined,
      colunaDataLancamento: colunaDataLancamento.trim() || undefined,
    });
  }

  function handleDismissPlate(plate) {
    onDismissPlate(plate);
  }

  if (!open) return null;

  const isSetup = mode === "setup";
  const sheetPlates = new Set(result.planilhaPlacas || []);
  const patioTrailers = result.trailersNoPatio || [];
  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="modal" role="dialog" aria-modal="true" aria-labelledby="sheet-title">
        <header className="modal-header">
          <div>
            <h2 id="sheet-title">{isSetup ? "Configurar planilha" : "Conferência de planilha"}</h2>
            <p>
              {isSetup
                ? "Selecione o arquivo da planilha e a coluna das placas."
                : "Confira quais carretas do pátio estão cadastradas na planilha."}
            </p>
          </div>
          <button className="close-button" type="button" aria-label="Fechar" onClick={onClose}>
            <SheetIcon name="close" />
          </button>
        </header>
        <div className="modal-form">
          {isSetup ? (
            <>
              <div className="field" style={{ border: "1px dashed #b8c4d2", borderRadius: 10, padding: 12, background: "#f8fafc" }}>
                <label htmlFor="sheet-file">Importar arquivo da planilha (Excel/CSV)</label>
                <input
                  id="sheet-file"
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  onChange={(event) => {
                    const selected = event.target.files?.[0] || null;
                    setFile(selected);
                    if (selected) {
                      setColumnOptions([]);
                      setSheetOptions([]);
                      setSheetName("");
                      previewFile(selected, "");
                    }
                  }}
                />
                <span className="subtext" style={{ display: "block", marginTop: 4 }}>
                  Exporte/baixe a planilha como .xlsx, .xls ou .csv e selecione o arquivo. Ele não fica salvo ao fechar.
                </span>
                {file && <span className="subtext" style={{ display: "block", marginTop: 4 }}>Arquivo: {file.name}</span>}
              </div>
              {sheetOptions.length > 0 && (
                <div className="field">
                  <label htmlFor="sheet-aba">Aba da planilha <span>*</span></label>
                  <select id="sheet-aba" value={sheetName} onChange={(event) => { setSheetName(event.target.value); previewFile(file, event.target.value); }}>
                    {sheetOptions.map((aba) => (
                      <option key={aba} value={aba}>
                        {aba}
                      </option>
                    ))}
                  </select>
                  <span className="subtext" style={{ display: "block", marginTop: 4 }}>
                    Ex.: selecione a aba "cadastro" se as placas estiverem nela.
                  </span>
                </div>
              )}
              {columnOptions.length > 0 && (
                <div className="field">
                  <label htmlFor="plate-column">Coluna das frotas/placas <span>*</span></label>
                  <select id="plate-column" value={plateColumn} onChange={(event) => setPlateColumn(event.target.value)}>
                    {columnOptions.map((column) => (
                      <option key={column} value={column}>
                        {column} {column === suggestedColumn ? "(sugerida)" : ""}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {columnOptions.length > 0 && (
                <div className="field">
                  <label htmlFor="coluna-filial">Coluna do setor/filial que lançou (opcional)</label>
                  <select id="coluna-filial" value={colunaFilial} onChange={(event) => setColunaFilial(event.target.value)}>
                    <option value="">Não usar</option>
                    {columnOptions.map((column) => (
                      <option key={column} value={column}>{column} {column === suggestedFilial ? "(sugerida)" : ""}</option>
                    ))}
                  </select>
                </div>
              )}
              {columnOptions.length > 0 && (
                <div className="field">
                  <label htmlFor="coluna-data">Coluna da data de lançamento (opcional)</label>
                  <select id="coluna-data" value={colunaDataLancamento} onChange={(event) => setColunaDataLancamento(event.target.value)}>
                    <option value="">Não usar</option>
                    {columnOptions.map((column) => (
                      <option key={column} value={column}>{column} {column === suggestedData ? "(sugerida)" : ""}</option>
                    ))}
                  </select>
                </div>
              )}
              {columnOptions.length > 0 && (
                <div className="field">
                  <label htmlFor="coluna-remarcar">Coluna que indica remarcação (opcional)</label>
                  <select id="coluna-remarcar" value={colunaRemarcar} onChange={(event) => setColunaRemarcar(event.target.value)}>
                    <option value="">Não usar</option>
                    {columnOptions.map((column) => (
                      <option key={column} value={column}>{column} {column === suggestedRemarcar ? "(sugerida)" : ""}</option>
                    ))}
                  </select>
                </div>
              )}
              {columnOptions.length > 0 && (
                <div className="field">
                  <label htmlFor="coluna-pneu">Coluna que informa qual pneu (opcional)</label>
                  <select id="coluna-pneu" value={colunaPneu} onChange={(event) => setColunaPneu(event.target.value)}>
                    <option value="">Não usar</option>
                    {columnOptions.map((column) => (
                      <option key={column} value={column}>{column} {column === suggestedPneu ? "(sugerida)" : ""}</option>
                    ))}
                  </select>
                </div>
              )}
              <div className="error-banner" role="alert">{result.error}</div>
              <footer className="modal-actions" style={{ justifyContent: "space-between" }}>
                <button className="button button-muted" type="button" onClick={onClose}>
                  Cancelar
                </button>
                <button className="button button-primary" type="button" disabled={busy || !file} onClick={handleSave}>
                  {busy ? "Aguarde..." : "Salvar e conferir agora"}
                </button>
              </footer>
            </>
          ) : (
            <>
              <div className="tools" style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, justifyContent: "space-between" }}>
                <div>
                  <SheetIcon name="truck" size={20} />
                  <strong style={{ fontSize: 14 }}>{result.totalNaoConferidas}</strong>{" "}
                  <span style={{ fontSize: 12, color: "#748397" }}>{result.totalNaoConferidas === 1 ? "carreta falta cadastrar" : "carretas faltam cadastrar"}</span>
                </div>
                {result.checkedAt && (
                  <span style={{ fontSize: 11, color: "#748397" }}>Última conferência: {new Date(result.checkedAt).toLocaleString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>
                )}
                <button className="button button-share" type="button" onClick={handleRun} title="Conferir novamente" aria-label="Conferir novamente">
                  <SheetIcon name="refresh" size={16} />
                </button>
                <button className="button button-share" type="button" onClick={() => { setMode("setup"); }} title="Alterar configuração" aria-label="Alterar configuração">
                  <SheetIcon name="search" size={16} />
                </button>
              </div>
              {result.error && <div className="error-banner" role="alert">{result.error}</div>}
              {!result.error && !busy && patioTrailers.length === 0 && (
                <div className="empty-state sheet-empty">
                  <strong className="sheet-empty-title">Nenhuma carreta no pátio</strong>
                  <span className="sheet-empty-hint">Cadastre uma carreta no pátio para conferir com a planilha.</span>
                </div>
              )}
              {!result.error && result.totalNaoConferidas === 0 && patioTrailers.length > 0 && !busy && (
                <div className="empty-state sheet-empty">
                  <span className="empty-icon sheet-empty-icon">
                    <SheetIcon name="check" size={28} />
                  </span>
                  <strong className="sheet-empty-title">Todas as carretas do pátio estão cadastradas</strong>
                  <span className="sheet-empty-hint">Nenhuma carreta falta cadastrar.</span>
                </div>
              )}
              {patioTrailers.length > 0 && (
                <div className="table-wrap" style={{ maxHeight: 360, overflowY: "auto", border: "1px solid #e5eaf0", borderRadius: 10, marginTop: 8 }}>
                  <table>
                    <thead>
                      <tr>
                        <th scope="col">Placa</th>
                        <th scope="col">Planilha</th>
                      </tr>
                    </thead>
                    <tbody>
                      {patioTrailers.map((trailer) => {
                        const normalized = normalizePlate(trailer.plate);
                        const inSheet = sheetPlates.has(normalized);
                        const isDismissed = dismissedPlates.has(normalized);
                        return (
                          <tr key={trailer.id}>
                            <td><span className="plate">{trailer.plate}</span></td>
                            <td>
                              <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "space-between" }}>
                                <span className={`badge ${inSheet ? "free" : "blocked"}`}>{inSheet ? "Cadastrada" : "Falta cadastrar"}</span>
                                {!inSheet && !isDismissed && (
                                  <button className="icon-button icon-only" type="button" title="Remover deste alerta" aria-label={`Remover alerta de ${trailer.plate}`} onClick={() => handleDismissPlate(trailer.plate)}>
                                    <SheetIcon name="check" size={14} />
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              <footer className="modal-actions" style={{ justifyContent: "space-between", marginTop: 14 }}>
                <button className="button button-muted" type="button" onClick={onClose}>
                  Fechar
                </button>
                <button className="button button-primary" type="button" disabled={busy} onClick={handleRun}>
                  {busy ? "Conferindo..." : "Conferir com o pátio agora"}
                </button>
              </footer>
            </>
          )}
        </div>
      </section>
    </div>
  );
}


