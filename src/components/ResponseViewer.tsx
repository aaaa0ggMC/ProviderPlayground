import { useState, useEffect } from 'react';
import { useLanguage } from '../i18n/LanguageContext';
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
  const { t } = useLanguage();
  const [rawOpen, setRawOpen] = useState(!defaultCollapsed);

  // Re-collapse when defaultCollapsed changes (new response arrives)
  useEffect(() => {
    setRawOpen(!defaultCollapsed);
  }, [defaultCollapsed]);

  if (status === null && !error) return null;

  return (
    <div className="response-viewer">
      <div className="rv-header">
        <h3>{t('rv.response')}</h3>
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
            {t('rv.clear')}
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
            {t('rv.raw')} {rawOpen ? '▲' : '▼'}
            <button
              className="btn btn-small rv-copy-btn"
              onClick={(e) => {
                e.stopPropagation();
                onCopyRaw();
              }}
            >
              {t('rv.copy')}
            </button>
          </button>
          {rawOpen && (
            <div className="rv-body">{formatBody(body, t)}</div>
          )}
        </div>
      )}
    </div>
  );
}

const LONG_STR = 120;

function FoldingJson({ data, t }: { data: unknown; t: (k: string) => string }): React.ReactNode {
  if (data === null) return <span className="rj-null">{t('rv.null')}</span>;
  if (typeof data === 'boolean')
    return <span className="rj-bool">{String(data)}</span>;
  if (typeof data === 'number')
    return <span className="rj-num">{String(data)}</span>;
  if (typeof data === 'string')
    return <FoldableString value={data} t={t} />;
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
              <FoldingJson data={v} t={t} />
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
              <FoldingJson data={v} t={t} />
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

function FoldableString({ value, t }: { value: string; t: (k: string) => string }): React.ReactNode {
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
          <span className="rj-ellipsis">… ({value.length} chars) {t('rv.expand')}</span>
        </span>
      )}
    </span>
  );
}

function formatBody(raw: string, t: (k: string) => string): React.ReactNode {
  try {
    return <FoldingJson data={JSON.parse(raw)} t={t} />;
  } catch {
    return raw;
  }
}