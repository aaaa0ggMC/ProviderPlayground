import { useState } from 'react';
import type { ParsedVar, SendHistoryEntry, VarConstraint } from '../types';
import './DynamicForm.css';

interface Props {
  vars: ParsedVar[];
  values: Record<string, string>;
  onChange: (name: string, value: string) => void;
  onSend: () => void;
  loading: boolean;
  history: SendHistoryEntry[];
  onFill: (values: Record<string, string>) => void;
  onClearHistory: () => void;
}

export default function DynamicForm({
  vars,
  values,
  onChange,
  onSend,
  loading,
  history,
  onFill,
  onClearHistory,
}: Props) {
  const [showHistory, setShowHistory] = useState(false);

  return (
    <div className="dynamic-form">
      <h3>{vars.length > 0 ? 'Fill Variables' : 'Send Request'}</h3>

      {history.length > 0 && (
        <div className="df-history">
          <button
            className="df-history-toggle"
            onClick={() => setShowHistory(!showHistory)}
          >
            <span>
              History ({history.length}) {showHistory ? '▲' : '▼'}
            </span>
            <button
              className="btn btn-small df-history-clear"
              onClick={(e) => {
                e.stopPropagation();
                onClearHistory();
              }}
            >
              Clear
            </button>
          </button>
          {showHistory && (
            <div className="df-history-list">
              {history.slice(0, 20).map((h) => (
                <button
                  key={h.id}
                  className="df-history-item"
                  onClick={() => onFill(h.values)}
                  title="Click to fill form with these values"
                >
                  <span className="df-history-time">
                    {new Date(h.timestamp).toLocaleString()}
                  </span>
                  <span className="df-history-summary">
                    {h.error
                      ? 'Error'
                      : h.responseStatus !== null
                        ? `${h.responseStatus}`
                        : '?'}
                    {h.duration !== null && ` · ${h.duration}ms`}
                  </span>
                  <span className="df-history-vals">
                    {Object.entries(h.values)
                      .map(([k, v]) => `${k}=${trunc(v, 20)}`)
                      .join(', ')}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {vars.length > 0 && (
        <div className="df-fields">
          {vars.map((v) => (
            <div key={v.name} className="df-field">
              <label>
                {v.name}
                {v.constraint && (
                  <span className="df-hint">
                    {hintText(v.constraint, v.type)}
                  </span>
                )}
              </label>
              {renderInput(v, values[v.name] ?? '', (val) =>
                onChange(v.name, val),
              )}
            </div>
          ))}
        </div>
      )}
      <button
        className="btn btn-primary btn-full"
        onClick={onSend}
        disabled={loading}
      >
        {loading ? 'Sending...' : 'Send Request'}
      </button>
    </div>
  );
}

function trunc(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) + '…' : s;
}

function hintText(c: VarConstraint, type: string): string {
  switch (c.kind) {
    case 'range':
      return `(${c.min} – ${c.max})`;
    case 'min':
      return `(min ${c.val})`;
    case 'max':
      return `(max ${c.val})`;
    case 'options':
      return type === 'select' ? '' : `(${c.values.join(', ')})`;
  }
}

function renderInput(
  v: ParsedVar,
  current: string,
  onChange: (val: string) => void,
) {
  if (v.type === 'bool') {
    return (
      <label className="df-checkbox-label">
        <input
          type="checkbox"
          checked={current === 'true'}
          onChange={(e) => onChange(e.target.checked ? 'true' : 'false')}
          className="df-checkbox"
        />
        <span>{current === 'true' ? 'true' : 'false'}</span>
      </label>
    );
  }

  if (v.type === 'select' || v.constraint?.kind === 'options') {
    const opts = v.constraint?.kind === 'options' ? v.constraint.values : [];
    return (
      <select
        value={current}
        onChange={(e) => onChange(e.target.value)}
        className="df-input"
      >
        <option value="">-- choose --</option>
        {opts.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    );
  }

  if (v.type === 'textarea') {
    return (
      <textarea
        className="df-input"
        rows={3}
        value={current}
        onChange={(e) => onChange(e.target.value)}
        placeholder={`Enter ${v.name}...`}
      />
    );
  }

  if (v.type === 'number' && v.constraint?.kind === 'range') {
    const { min, max } = v.constraint;
    const val = current === '' ? String(min) : current;
    const step = max - min <= 2 ? 0.1 : 1;
    return (
      <div className="df-slider-row">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={val}
          onChange={(e) => onChange(e.target.value)}
          className="df-slider"
        />
        <input
          type="number"
          className="df-input df-number"
          value={val}
          min={min}
          max={max}
          step={step}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
    );
  }

  if (v.type === 'number') {
    let min: number | undefined;
    let max: number | undefined;
    if (v.constraint?.kind === 'min') min = v.constraint.val;
    if (v.constraint?.kind === 'max') max = v.constraint.val;
    return (
      <input
        type="number"
        className="df-input"
        value={current}
        min={min}
        max={max}
        onChange={(e) => onChange(e.target.value)}
        placeholder={`Enter ${v.name}...`}
      />
    );
  }

  return (
    <input
      type="text"
      className="df-input"
      value={current}
      onChange={(e) => onChange(e.target.value)}
      placeholder={`Enter ${v.name}...`}
    />
  );
}
