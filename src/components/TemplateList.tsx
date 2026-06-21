import type { RequestTemplate } from '../types';
import './TemplateList.css';

interface Props {
  templates: RequestTemplate[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
}

export default function TemplateList({
  templates,
  activeId,
  onSelect,
  onNew,
}: Props) {
  return (
    <div className="template-list">
      <div className="tl-header">
        <h2>Provider Playground</h2>
        <button className="btn btn-primary" onClick={onNew}>
          + New
        </button>
      </div>
      <div className="tl-items">
        {templates.length === 0 && (
          <div className="tl-empty">
            No templates yet. Click "+ New" to create one.
          </div>
        )}
        {templates.map((t) => (
          <button
            key={t.id}
            className={`tl-item ${t.id === activeId ? 'tl-active' : ''}`}
            onClick={() => onSelect(t.id)}
          >
            <span className="tl-item-name">{t.name || 'Untitled'}</span>
            <span className="tl-item-method">{t.method}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
