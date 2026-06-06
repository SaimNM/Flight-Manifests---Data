import { useState, useCallback, useRef } from "react";

const API_KEY = "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"; // Replace with your Anthropic API key

const SYSTEM_PROMPT = `You are a flight manifest parser for Reko Diq Mining Company. Extract all flights and passengers from the PDF. Return ONLY valid JSON, no markdown, no explanation.

Format:
{
  "manifest_date": "DD/MM/YYYY",
  "flights": [
    {
      "flight_number": "SS701",
      "direction": "KHI to REQ",
      "route_label": "Karachi to Reko Diq",
      "departs": "HH:MM",
      "arrives": "HH:MM",
      "passengers": [
        {
          "name": "LASTNAME, Firstname",
          "employer": "Company Name",
          "workgroup": "workgroup string",
          "gender": "M",
          "status": "B"
        }
      ]
    }
  ]
}

Rules:
- Extract date from manifest header (e.g. "9 Mar 2026" -> "09/03/2026")
- KHI to REQ = Karachi to Reko Diq. REQ to KHI = Reko Diq to Karachi.
- Include ALL passengers regardless of status
- Preserve employer names exactly as written
- Clean up parenthetical tags like (C), (B), (A), (D) from names
- Only return JSON, nothing else`;

const COLORS = ["#185FA5","#0F6E56","#993C1D","#534AB7","#854F0B","#A32D2D","#3B6D11"];

function getCompanyColor(name: string, map: Record<string, string>) {
  if (!map[name]) {
    map[name] = COLORS[Object.keys(map).length % COLORS.length];
  }
  return map[name];
}

function getInitials(name: string) {
  const parts = name.replace(/[(),]/g, "").trim().split(/[\s,]+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return parts[0]?.[0]?.toUpperCase() || "?";
}

interface Passenger {
  name: string;
  employer: string;
  workgroup: string;
  gender: string;
  status: string;
}

interface Flight {
  flight_number: string;
  direction: string;
  route_label: string;
  departs: string;
  arrives: string;
  passengers: Passenger[];
}

interface Manifest {
  manifest_date: string;
  flights: Flight[];
}

export default function App() {
  const [manifests, setManifests] = useState<Manifest[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [filterCompany, setFilterCompany] = useState("All");
  const [activeManifest, setActiveManifest] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const colorMap = useRef<Record<string, string>>({});

  const readFileAsBase64 = (file: File): Promise<string> => new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res((r.result as string).split(",")[1]);
    r.onerror = () => rej(new Error("Read failed"));
    r.readAsDataURL(file);
  });

  const handleFile = useCallback(async (file: File | undefined) => {
    if (!file || file.type !== "application/pdf") { setError("Please upload a PDF file."); return; }
    setLoading(true); setError("");
    try {
      const base64 = await readFileAsBase64(file);
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": API_KEY,
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 4000,
          system: SYSTEM_PROMPT,
          messages: [{ role: "user", content: [
            { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } },
            { type: "text", text: "Parse this flight manifest and return JSON only." }
          ]}]
        })
      });
      const data = await res.json();
      const text = data.content?.find((b: { type: string }) => b.type === "text")?.text || "";
      const clean = text.replace(/```json|```/g, "").trim();
      const parsed: Manifest = JSON.parse(clean);
      setManifests(prev => { const u = [parsed, ...prev]; setActiveManifest(0); return u; });
      setFilterCompany("All");
    } catch (e: any) {
      setError("Error: " + (e?.message || JSON.stringify(e)));
    }
    setLoading(false);
  }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false);
    handleFile(e.dataTransfer?.files?.[0]);
  }, [handleFile]);

  const current = activeManifest !== null ? manifests[activeManifest] : null;
  const allCompanies = current ? ["All", ...Array.from(new Set(current.flights.flatMap(f => f.passengers.map(p => p.employer)))).sort()] : [];
  const filteredFlights = current ? current.flights.map(f => ({
    ...f,
    passengers: filterCompany === "All" ? f.passengers : f.passengers.filter(p => p.employer === filterCompany)
  })).filter(f => f.passengers.length > 0) : [];

  const totalIn = current ? current.flights.filter(f => f.direction === "KHI to REQ").reduce((s, f) => s + (filterCompany === "All" ? f.passengers.length : f.passengers.filter(p => p.employer === filterCompany).length), 0) : 0;
  const totalOut = current ? current.flights.filter(f => f.direction === "REQ to KHI").reduce((s, f) => s + (filterCompany === "All" ? f.passengers.length : f.passengers.filter(p => p.employer === filterCompany).length), 0) : 0;

  return (
    <div style={{ fontFamily: "system-ui, sans-serif", padding: "0 0 2rem", maxWidth: 700, margin: "0 auto" }}>
      <div style={{ background: "#f5f5f5", borderBottom: "1px solid #e0e0e0", padding: "1.25rem 1.5rem 1rem", marginBottom: "1.25rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 4 }}>
          <div style={{ width: 36, height: 36, borderRadius: 8, background: "#185FA5", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, color: "white" }}>
            ✈
          </div>
          <div>
            <div style={{ fontSize: 17, fontWeight: 500, color: "#111", lineHeight: 1.2 }}>Reko Diq flight manifest</div>
            <div style={{ fontSize: 12, color: "#666" }}>KHI ↔ REQ passenger tracker</div>
          </div>
        </div>
      </div>

      <div style={{ padding: "0 1.25rem" }}>
        <div
          onDrop={onDrop}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onClick={() => !loading && fileRef.current?.click()}
          style={{
            border: `2px dashed ${dragOver ? "#378ADD" : "#ccc"}`,
            borderRadius: 12,
            padding: "1.75rem 1rem",
            textAlign: "center",
            cursor: loading ? "default" : "pointer",
            background: dragOver ? "#E6F1FB" : "#fafafa",
            marginBottom: "1.25rem",
          }}>
          <input ref={fileRef} type="file" accept="application/pdf" style={{ display: "none" }} onChange={e => handleFile(e.target.files?.[0])} />
          {loading ? (
            <div>
              <div style={{ fontSize: 28, marginBottom: 8 }}>⏳</div>
              <div style={{ fontSize: 13, color: "#666" }}>Parsing manifest with AI...</div>
            </div>
          ) : (
            <div>
              <div style={{ fontSize: 28, marginBottom: 8 }}>📄</div>
              <div style={{ fontSize: 13, fontWeight: 500, color: "#111", marginBottom: 2 }}>Drop manifest PDF here</div>
              <div style={{ fontSize: 12, color: "#666" }}>or <span style={{ color: "#185FA5", textDecoration: "underline" }}>click to browse</span></div>
            </div>
          )}
        </div>

        {error && (
          <div style={{ fontSize: 13, color: "#c00", marginBottom: "1rem", padding: "10px 14px", background: "#fff0f0", borderRadius: 8, border: "1px solid #fcc" }}>
            ⚠ {error}
          </div>
        )}

        {manifests.length > 0 && (
          <div style={{ marginBottom: "1rem" }}>
            <div style={{ fontSize: 11, color: "#999", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em" }}>Loaded manifests</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {manifests.map((m, i) => (
                <button key={i} onClick={() => { setActiveManifest(i); setFilterCompany("All"); }}
                  style={{ fontSize: 12, padding: "5px 12px", borderRadius: 20, border: activeManifest === i ? "1.5px solid #185FA5" : "1px solid #ddd", background: activeManifest === i ? "#E6F1FB" : "white", color: activeManifest === i ? "#0C447C" : "#666", cursor: "pointer", fontWeight: activeManifest === i ? 500 : 400 }}>
                  📅 {m.manifest_date}
                </button>
              ))}
            </div>
          </div>
        )}

        {current && (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: "1.25rem" }}>
              {[
                { label: "Flying in", val: totalIn, color: "#0F6E56", bg: "#E1F5EE" },
                { label: "Flying out", val: totalOut, color: "#185FA5", bg: "#E6F1FB" },
                { label: "Total pax", val: totalIn + totalOut, color: "#534AB7", bg: "#EEEDFE" }
              ].map(s => (
                <div key={s.label} style={{ background: s.bg, borderRadius: 8, padding: "10px 14px" }}>
                  <div style={{ fontSize: 11, color: s.color, fontWeight: 500, marginBottom: 4 }}>{s.label}</div>
                  <div style={{ fontSize: 22, fontWeight: 500, color: s.color, lineHeight: 1 }}>{s.val}</div>
                </div>
              ))}
            </div>

            <div style={{ marginBottom: "1.25rem" }}>
              <label style={{ fontSize: 11, color: "#999", display: "block", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.06em" }}>Filter by company</label>
              <select value={filterCompany} onChange={e => setFilterCompany(e.target.value)}
                style={{ width: "100%", fontSize: 13, padding: "8px 12px", borderRadius: 8, border: "1px solid #ddd", background: "white", color: "#111" }}>
                {allCompanies.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>

            {filteredFlights.length === 0
              ? <div style={{ textAlign: "center", padding: "2.5rem 0", color: "#999", fontSize: 14 }}>No passengers found for this selection.</div>
              : filteredFlights.map((flight, fi) => (
                <div key={fi} style={{ background: "white", border: "1px solid #e0e0e0", borderRadius: 12, marginBottom: "1rem", overflow: "hidden" }}>
                  <div style={{ padding: "12px 16px", background: flight.direction === "KHI to REQ" ? "#E1F5EE" : "#E6F1FB", borderBottom: "1px solid #e0e0e0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 500, color: flight.direction === "KHI to REQ" ? "#085041" : "#0C447C" }}>
                        {flight.direction === "KHI to REQ" ? "✈ " : "✈ "}{flight.route_label}
                      </div>
                      <div style={{ fontSize: 11, color: flight.direction === "KHI to REQ" ? "#0F6E56" : "#185FA5" }}>
                        {flight.flight_number} &nbsp;🕐 {flight.departs} → {flight.arrives}
                      </div>
                    </div>
                    <div style={{ fontSize: 11, padding: "3px 10px", borderRadius: 20, background: flight.direction === "KHI to REQ" ? "#9FE1CB" : "#B5D4F4", color: flight.direction === "KHI to REQ" ? "#085041" : "#0C447C", fontWeight: 500 }}>
                      {flight.passengers.length} pax
                    </div>
                  </div>
                  <div style={{ padding: "8px 0" }}>
                    {flight.passengers.map((p, pi) => {
                      const initials = getInitials(p.name);
                      const col = getCompanyColor(p.employer, colorMap.current);
                      return (
                        <div key={pi} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 16px", borderBottom: pi < flight.passengers.length - 1 ? "1px solid #f0f0f0" : "none" }}>
                          <span style={{ fontSize: 12, color: "#aaa", minWidth: 20, textAlign: "right" }}>{pi + 1}</span>
                          <div style={{ width: 28, height: 28, borderRadius: "50%", background: col + "22", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, border: `1px solid ${col}44` }}>
                            <span style={{ fontSize: 10, fontWeight: 500, color: col }}>{initials}</span>
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 500, color: "#111", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.name}</div>
                            {filterCompany === "All" && <div style={{ fontSize: 11, color: "#888", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.employer}</div>}
                          </div>
                          <span style={{ fontSize: 11, padding: "2px 7px", borderRadius: 10, background: p.gender === "F" ? "#FBEAF0" : "#f5f5f5", color: p.gender === "F" ? "#993556" : "#888", flexShrink: 0 }}>{p.gender}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))
            }
          </>
        )}
      </div>
    </div>
  );
}
