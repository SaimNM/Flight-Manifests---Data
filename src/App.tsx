import { useState, useCallback, useRef } from 'react';

const SYSTEM_PROMPT = `You are a flight manifest parser for Reko Diq Mining Company. Extract all flights and passengers from the PDF. Return ONLY valid JSON, no markdown, no explanation.

Format:
{
  "manifest_date": "DD/MM/YYYY",
  "flights": [
    {
      "flight_number": "SS701" or whatever is in the manifest header,
      "direction": "KHI to REQ" or "REQ to KHI",
      "route_label": "Karachi to Reko Diq" or "Reko Diq to Karachi",
      "departs": "HH:MM",
      "arrives": "HH:MM",
      "passengers": [
        {
          "name": "LASTNAME, Firstname",
          "employer": "Company Name",
          "workgroup": "workgroup string",
          "gender": "M" or "F",
          "status": "B" or "NS" or "W" or "P"
        }
      ]
    }
  ]
}

Rules:
- Extract date from manifest header (e.g. "9 Mar 2026" -> "09/03/2026", "26 Mar 2026" -> "26/03/2026")
- KHI to REQ = Karachi to Reko Diq. REQ to KHI = Reko Diq to Karachi.
- Include ALL passengers regardless of status
- Preserve employer names exactly as written in the manifest
- Clean up parenthetical tags like (C), (B), (A), (D) from names but keep meaningful parts
- Only return JSON, nothing else`;

const COLORS = [
  '#185FA5',
  '#0F6E56',
  '#993C1D',
  '#534AB7',
  '#854F0B',
  '#A32D2D',
  '#3B6D11',
];

function getCompanyColor(name, map) {
  if (!map[name]) {
    map[name] = COLORS[Object.keys(map).length % COLORS.length];
  }
  return map[name];
}

function getInitials(name) {
  const parts = name
    .replace(/[(),]/g, '')
    .trim()
    .split(/[\s,]+/)
    .filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return parts[0]?.[0]?.toUpperCase() || '?';
}

export default function App() {
  const [manifests, setManifests] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [filterCompany, setFilterCompany] = useState('All');
  const [activeManifest, setActiveManifest] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef();
  const colorMap = useRef({});

  const readFileAsBase64 = (file) =>
    new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result.split(',')[1]);
      r.onerror = () => rej(new Error('Read failed'));
      r.readAsDataURL(file);
    });

  const handleFile = useCallback(async (file) => {
    if (!file || file.type !== 'application/pdf') {
      setError('Please upload a PDF file.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const base64 = await readFileAsBase64(file);
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        'x-api-key':
          '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',
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 4000,
          system: SYSTEM_PROMPT,
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'document',
                  source: {
                    type: 'base64',
                    media_type: 'application/pdf',
                    data: base64,
                  },
                },
                {
                  type: 'text',
                  text: 'Parse this flight manifest and return JSON only.',
                },
              ],
            },
          ],
        }),
      });
      const data = await res.json();
      const text = data.content?.find((b) => b.type === 'text')?.text || '';
      const clean = text.replace(/```json|```/g, '').trim();
      const parsed = JSON.parse(clean);
      setManifests((prev) => {
        const u = [parsed, ...prev];
        setActiveManifest(0);
        return u;
      });
      setFilterCompany('All');
    } catch (e) {
      setError('Failed to parse manifest. Please try again.');
    }
    setLoading(false);
  }, []);

  const onDrop = useCallback(
    (e) => {
      e.preventDefault();
      setDragOver(false);
      handleFile(e.dataTransfer?.files?.[0]);
    },
    [handleFile]
  );

  const current = activeManifest !== null ? manifests[activeManifest] : null;
  const allCompanies = current
    ? [
        'All',
        ...Array.from(
          new Set(
            current.flights.flatMap((f) => f.passengers.map((p) => p.employer))
          )
        ).sort(),
      ]
    : [];
  const filteredFlights = current
    ? current.flights
        .map((f) => ({
          ...f,
          passengers:
            filterCompany === 'All'
              ? f.passengers
              : f.passengers.filter((p) => p.employer === filterCompany),
        }))
        .filter((f) => f.passengers.length > 0)
    : [];
  const totalIn = current
    ? current.flights
        .filter((f) => f.direction === 'KHI to REQ')
        .reduce(
          (s, f) =>
            s +
            (filterCompany === 'All'
              ? f.passengers.length
              : f.passengers.filter((p) => p.employer === filterCompany)
                  .length),
          0
        )
    : 0;
  const totalOut = current
    ? current.flights
        .filter((f) => f.direction === 'REQ to KHI')
        .reduce(
          (s, f) =>
            s +
            (filterCompany === 'All'
              ? f.passengers.length
              : f.passengers.filter((p) => p.employer === filterCompany)
                  .length),
          0
        )
    : 0;

  return (
    <div style={{ fontFamily: 'var(--font-sans)', padding: '0 0 2rem' }}>
      <div
        style={{
          background: 'var(--color-background-secondary)',
          borderBottom: '0.5px solid var(--color-border-tertiary)',
          padding: '1.25rem 1.5rem 1rem',
          marginBottom: '1.25rem',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            marginBottom: 4,
          }}
        >
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 8,
              background: '#185FA5',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <i
              className="ti ti-plane"
              style={{ fontSize: 20, color: '#E6F1FB' }}
              aria-hidden="true"
            />
          </div>
          <div>
            <div
              style={{
                fontSize: 17,
                fontWeight: 500,
                color: 'var(--color-text-primary)',
                lineHeight: 1.2,
              }}
            >
              Reko Diq flight manifest
            </div>
            <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
              KHI &harr; REQ passenger tracker
            </div>
          </div>
        </div>
      </div>

      <div style={{ padding: '0 1.25rem' }}>
        <div
          onDrop={onDrop}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onClick={() => !loading && fileRef.current?.click()}
          style={{
            border: `1.5px dashed ${
              dragOver ? '#378ADD' : 'var(--color-border-secondary)'
            }`,
            borderRadius: 'var(--border-radius-lg)',
            padding: '1.75rem 1rem',
            textAlign: 'center',
            cursor: loading ? 'default' : 'pointer',
            background: dragOver
              ? '#E6F1FB'
              : 'var(--color-background-secondary)',
            marginBottom: '1.25rem',
            transition: 'border-color 0.15s, background 0.15s',
          }}
        >
          <input
            ref={fileRef}
            type="file"
            accept="application/pdf"
            style={{ display: 'none' }}
            onChange={(e) => handleFile(e.target.files?.[0])}
          />
          {loading ? (
            <div>
              <i
                className="ti ti-loader"
                style={{
                  fontSize: 28,
                  color: '#378ADD',
                  display: 'block',
                  marginBottom: 8,
                }}
                aria-hidden="true"
              />
              <div
                style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}
              >
                Parsing manifest with AI...
              </div>
            </div>
          ) : (
            <div>
              <i
                className="ti ti-file-upload"
                style={{
                  fontSize: 28,
                  color: 'var(--color-text-secondary)',
                  display: 'block',
                  marginBottom: 8,
                }}
                aria-hidden="true"
              />
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 500,
                  color: 'var(--color-text-primary)',
                  marginBottom: 2,
                }}
              >
                Drop manifest PDF here
              </div>
              <div
                style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}
              >
                or{' '}
                <span style={{ color: '#185FA5', textDecoration: 'underline' }}>
                  click to browse
                </span>
              </div>
            </div>
          )}
        </div>

        {error && (
          <div
            style={{
              fontSize: 13,
              color: 'var(--color-text-danger)',
              marginBottom: '1rem',
              padding: '10px 14px',
              background: 'var(--color-background-danger)',
              borderRadius: 'var(--border-radius-md)',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <i
              className="ti ti-alert-circle"
              style={{ fontSize: 16 }}
              aria-hidden="true"
            />
            {error}
          </div>
        )}

        {manifests.length > 0 && (
          <div style={{ marginBottom: '1rem' }}>
            <div
              style={{
                fontSize: 11,
                color: 'var(--color-text-tertiary)',
                marginBottom: 6,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
              }}
            >
              Loaded manifests
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {manifests.map((m, i) => (
                <button
                  key={i}
                  onClick={() => {
                    setActiveManifest(i);
                    setFilterCompany('All');
                  }}
                  style={{
                    fontSize: 12,
                    padding: '5px 12px',
                    borderRadius: 20,
                    border:
                      activeManifest === i
                        ? '1.5px solid #185FA5'
                        : '0.5px solid var(--color-border-secondary)',
                    background:
                      activeManifest === i
                        ? '#E6F1FB'
                        : 'var(--color-background-primary)',
                    color:
                      activeManifest === i
                        ? '#0C447C'
                        : 'var(--color-text-secondary)',
                    cursor: 'pointer',
                    fontWeight: activeManifest === i ? 500 : 400,
                  }}
                >
                  <i
                    className="ti ti-calendar"
                    style={{ fontSize: 12, marginRight: 5, verticalAlign: -1 }}
                    aria-hidden="true"
                  />
                  {m.manifest_date}
                </button>
              ))}
            </div>
          </div>
        )}

        {current && (
          <>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: 8,
                marginBottom: '1.25rem',
              }}
            >
              {[
                {
                  label: 'Flying in',
                  val: totalIn,
                  icon: 'ti-plane-arrival',
                  color: '#0F6E56',
                  bg: '#E1F5EE',
                  tc: '#085041',
                },
                {
                  label: 'Flying out',
                  val: totalOut,
                  icon: 'ti-plane-departure',
                  color: '#185FA5',
                  bg: '#E6F1FB',
                  tc: '#0C447C',
                },
                {
                  label: 'Total pax',
                  val: totalIn + totalOut,
                  icon: 'ti-users',
                  color: '#534AB7',
                  bg: '#EEEDFE',
                  tc: '#3C3489',
                },
              ].map((s) => (
                <div
                  key={s.label}
                  style={{
                    background: s.bg,
                    borderRadius: 'var(--border-radius-md)',
                    padding: '10px 14px',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      marginBottom: 4,
                    }}
                  >
                    <i
                      className={`ti ${s.icon}`}
                      style={{ fontSize: 14, color: s.color }}
                      aria-hidden="true"
                    />
                    <span
                      style={{ fontSize: 11, color: s.color, fontWeight: 500 }}
                    >
                      {s.label}
                    </span>
                  </div>
                  <div
                    style={{
                      fontSize: 22,
                      fontWeight: 500,
                      color: s.tc,
                      lineHeight: 1,
                    }}
                  >
                    {s.val}
                  </div>
                </div>
              ))}
            </div>

            <div style={{ marginBottom: '1.25rem' }}>
              <label
                style={{
                  fontSize: 11,
                  color: 'var(--color-text-tertiary)',
                  display: 'block',
                  marginBottom: 5,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                }}
              >
                Filter by company
              </label>
              <select
                value={filterCompany}
                onChange={(e) => setFilterCompany(e.target.value)}
                style={{
                  width: '100%',
                  fontSize: 13,
                  padding: '8px 12px',
                  borderRadius: 'var(--border-radius-md)',
                  border: '0.5px solid var(--color-border-secondary)',
                  background: 'var(--color-background-primary)',
                  color: 'var(--color-text-primary)',
                }}
              >
                {allCompanies.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </div>

            {filterCompany !== 'All' && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '10px 14px',
                  background: '#E6F1FB',
                  borderRadius: 'var(--border-radius-md)',
                  marginBottom: '1.25rem',
                }}
              >
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 8,
                    background: getCompanyColor(
                      filterCompany,
                      colorMap.current
                    ),
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <i
                    className="ti ti-building"
                    style={{ fontSize: 16, color: '#fff' }}
                    aria-hidden="true"
                  />
                </div>
                <div>
                  <div
                    style={{ fontSize: 13, fontWeight: 500, color: '#0C447C' }}
                  >
                    {filterCompany}
                  </div>
                  <div style={{ fontSize: 11, color: '#185FA5' }}>
                    {totalIn + totalOut} passenger
                    {totalIn + totalOut !== 1 ? 's' : ''} across{' '}
                    {filteredFlights.length} flight
                    {filteredFlights.length !== 1 ? 's' : ''}
                  </div>
                </div>
              </div>
            )}

            {filteredFlights.length === 0 ? (
              <div
                style={{
                  textAlign: 'center',
                  padding: '2.5rem 0',
                  color: 'var(--color-text-secondary)',
                  fontSize: 14,
                }}
              >
                <i
                  className="ti ti-mood-empty"
                  style={{ fontSize: 32, display: 'block', marginBottom: 8 }}
                  aria-hidden="true"
                />
                No passengers found for this selection.
              </div>
            ) : (
              filteredFlights.map((flight, fi) => (
                <div
                  key={fi}
                  style={{
                    background: 'var(--color-background-primary)',
                    border: '0.5px solid var(--color-border-tertiary)',
                    borderRadius: 'var(--border-radius-lg)',
                    marginBottom: '1rem',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      padding: '12px 16px',
                      background:
                        flight.direction === 'KHI to REQ'
                          ? '#E1F5EE'
                          : '#E6F1FB',
                      borderBottom: '0.5px solid var(--color-border-tertiary)',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <div
                      style={{ display: 'flex', alignItems: 'center', gap: 10 }}
                    >
                      <i
                        className={`ti ${
                          flight.direction === 'KHI to REQ'
                            ? 'ti-plane-arrival'
                            : 'ti-plane-departure'
                        }`}
                        style={{
                          fontSize: 18,
                          color:
                            flight.direction === 'KHI to REQ'
                              ? '#0F6E56'
                              : '#185FA5',
                        }}
                        aria-hidden="true"
                      />
                      <div>
                        <div
                          style={{
                            fontSize: 14,
                            fontWeight: 500,
                            color:
                              flight.direction === 'KHI to REQ'
                                ? '#085041'
                                : '#0C447C',
                          }}
                        >
                          {flight.route_label}
                        </div>
                        <div
                          style={{
                            fontSize: 11,
                            color:
                              flight.direction === 'KHI to REQ'
                                ? '#0F6E56'
                                : '#185FA5',
                          }}
                        >
                          {flight.flight_number && (
                            <span style={{ marginRight: 8 }}>
                              {flight.flight_number}
                            </span>
                          )}
                          <i
                            className="ti ti-clock"
                            style={{
                              fontSize: 12,
                              verticalAlign: -1,
                              marginRight: 3,
                            }}
                            aria-hidden="true"
                          />
                          {flight.departs} &rarr; {flight.arrives}
                        </div>
                      </div>
                    </div>
                    <div
                      style={{
                        fontSize: 11,
                        padding: '3px 10px',
                        borderRadius: 20,
                        background:
                          flight.direction === 'KHI to REQ'
                            ? '#9FE1CB'
                            : '#B5D4F4',
                        color:
                          flight.direction === 'KHI to REQ'
                            ? '#085041'
                            : '#0C447C',
                        fontWeight: 500,
                      }}
                    >
                      {flight.passengers.length} pax
                    </div>
                  </div>
                  <div style={{ padding: '8px 0' }}>
                    {flight.passengers.map((p, pi) => {
                      const initials = getInitials(p.name);
                      const col = getCompanyColor(p.employer, colorMap.current);
                      return (
                        <div
                          key={pi}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 10,
                            padding: '6px 16px',
                            borderBottom:
                              pi < flight.passengers.length - 1
                                ? '0.5px solid var(--color-border-tertiary)'
                                : 'none',
                          }}
                        >
                          <span
                            style={{
                              fontSize: 12,
                              color: 'var(--color-text-tertiary)',
                              minWidth: 20,
                              textAlign: 'right',
                            }}
                          >
                            {pi + 1}
                          </span>
                          <div
                            style={{
                              width: 28,
                              height: 28,
                              borderRadius: '50%',
                              background: col + '22',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              flexShrink: 0,
                              border: `1px solid ${col}44`,
                            }}
                          >
                            <span
                              style={{
                                fontSize: 10,
                                fontWeight: 500,
                                color: col,
                              }}
                            >
                              {initials}
                            </span>
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div
                              style={{
                                fontSize: 13,
                                fontWeight: 500,
                                color: 'var(--color-text-primary)',
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                              }}
                            >
                              {p.name}
                            </div>
                            {filterCompany === 'All' && (
                              <div
                                style={{
                                  fontSize: 11,
                                  color: 'var(--color-text-secondary)',
                                  whiteSpace: 'nowrap',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                }}
                              >
                                {p.employer}
                              </div>
                            )}
                          </div>
                          <span
                            style={{
                              fontSize: 11,
                              padding: '2px 7px',
                              borderRadius: 10,
                              background:
                                p.gender === 'F'
                                  ? '#FBEAF0'
                                  : 'var(--color-background-secondary)',
                              color:
                                p.gender === 'F'
                                  ? '#993556'
                                  : 'var(--color-text-secondary)',
                              flexShrink: 0,
                            }}
                          >
                            {p.gender}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </>
        )}

        {!current && !loading && manifests.length === 0 && (
          <div style={{ textAlign: 'center', padding: '1rem 0 2rem' }}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr 1fr',
                gap: 10,
                marginBottom: '1.5rem',
              }}
            >
              {[
                {
                  icon: 'ti-upload',
                  label: 'Upload PDF',
                  desc: 'Drop any RDMC flight manifest',
                },
                {
                  icon: 'ti-building',
                  label: 'Filter company',
                  desc: 'Narrow down by employer',
                },
                {
                  icon: 'ti-list',
                  label: 'View results',
                  desc: 'Sorted by flight & direction',
                },
              ].map((s) => (
                <div
                  key={s.label}
                  style={{
                    background: 'var(--color-background-secondary)',
                    borderRadius: 'var(--border-radius-lg)',
                    padding: '16px 10px',
                    textAlign: 'center',
                  }}
                >
                  <i
                    className={`ti ${s.icon}`}
                    style={{
                      fontSize: 22,
                      color: '#185FA5',
                      display: 'block',
                      marginBottom: 6,
                    }}
                    aria-hidden="true"
                  />
                  <div
                    style={{
                      fontSize: 12,
                      fontWeight: 500,
                      color: 'var(--color-text-primary)',
                      marginBottom: 2,
                    }}
                  >
                    {s.label}
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      color: 'var(--color-text-secondary)',
                    }}
                  >
                    {s.desc}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
