import { useState, useEffect } from 'react';
import './ResponseViewer.css';

interface Props {
  status: number | null;
  body: string;
  duration: number | null;
  error: string | null;
  onClear: () => void;
  onCopyRaw: () => void;
  defaultCollapsed: boolean;
}

export default function ResponseViewer({
  status,
  body,
  duration,
  error,
  onClear,
  onCopyRaw,
  defaultCollapsed,
}: Props) {
  const [rawOpen, setRawOpen] = useState(!defaultCollapsed);

  // Re-collapse when defaultCollapsed changes (new response arrives)
  useEffect(() => {
    setRawOpen(!defaultCollapsed);
  }, [defaultCollapsed]);

  const downloadBody = () => {
    if (!body) return;
    let extension = 'txt';
    let finalContent = body;
    try {
      const parsed = JSON.parse(body);
      extension = 'json';
      finalContent = JSON.stringify(parsed, null, 2);
    } catch {
      // ignore
    }
    const blob = new Blob([finalContent], { type: extension === 'json' ? 'application/json' : 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `response.${extension}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (status === null && !error) return null;

  return (
    <div className="response-viewer">
      <div className="rv-header">
        <h3>Response</h3>
        <div className="rv-meta">
          {status !== null && (
            <span
              className={`rv-status rv-status-${status < 400 ? 'ok' : 'err'}`}
            >
              {status}
            </span>
          )}
          {duration !== null && (
            <span className="rv-duration">{duration}ms</span>
          )}
          <button className="btn btn-small" onClick={onClear}>
            Clear
          </button>
        </div>
      </div>

      {error && <div className="rv-error">{error}</div>}

      {/* Raw response */}
      {body && !error && (
        <div className="rv-raw">
          <button
            className="rv-raw-toggle"
            onClick={() => setRawOpen(!rawOpen)}
          >
            Raw {rawOpen ? '▲' : '▼'}
            <button
              className="btn btn-small rv-copy-btn"
              onClick={(e) => {
                e.stopPropagation();
                onCopyRaw();
              }}
            >
              Copy
            </button>
            <button
              className="btn btn-small rv-download-btn"
              style={{ marginLeft: '4px' }}
              onClick={(e) => {
                e.stopPropagation();
                downloadBody();
              }}
            >
              Download
            </button>
          </button>
          {rawOpen && (
            <div className="rv-body">{formatBody(body)}</div>
          )}
        </div>
      )}
    </div>
  );
}

const LONG_STR = 120;

function FoldingJson({ data }: { data: unknown }): React.ReactNode {
  if (data === null) return <span className="rj-null">null</span>;
  if (typeof data === 'boolean')
    return <span className="rj-bool">{String(data)}</span>;
  if (typeof data === 'number')
    return <span className="rj-num">{String(data)}</span>;
  if (typeof data === 'string')
    return <FoldableString value={data} />;
  if (Array.isArray(data)) {
    if (data.every((v) => typeof v === 'string' && v.length <= 40)) {
      return <span className="rj-str">[{data.filter((v) => typeof v === 'string').map((v) => JSON.stringify(v)).join(', ')}]</span>;
    }
    return (
      <>
        <span>[</span>
        <ol className="rj-array">
          {data.map((v, i) => (
            <li key={i}>
              <FoldingJson data={v} />
              {i < data.length - 1 && ','}
            </li>
          ))}
        </ol>
        <span>]</span>
      </>
    );
  }
  if (typeof data === 'object') {
    const entries = Object.entries(data as Record<string, unknown>);
    return (
      <>
        <span>{'{'}</span>
        <ul className="rj-obj">
          {entries.map(([k, v], i) => (
            <li key={k}>
              <span className="rj-key">{JSON.stringify(k)}</span>
              <span>: </span>
              <FoldingJson data={v} />
              {i < entries.length - 1 && ','}
            </li>
          ))}
        </ul>
        <span>{'}'}</span>
      </>
    );
  }
  return <span>{String(data)}</span>;
}

function FoldableString({ value }: { value: string }): React.ReactNode {
  const [expanded, setExpanded] = useState(false);
  if (value.length <= LONG_STR) {
    return <span className="rj-str">{JSON.stringify(value)}</span>;
  }
  return (
    <span className="rj-str-fold" onClick={() => setExpanded(!expanded)}>
      {expanded ? (
        <span className="rj-str rj-str-full">{JSON.stringify(value)}</span>
      ) : (
        <span>
          {JSON.stringify(value.slice(0, LONG_STR))}
          <span className="rj-ellipsis">… ({value.length} chars) click to expand</span>
        </span>
      )}
    </span>
  );
}

function formatBody(raw: string): React.ReactNode {
  try {
    return <FoldingJson data={JSON.parse(raw)} />;
  } catch {
    return raw;
  }
}
