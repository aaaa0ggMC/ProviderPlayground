import type { RequestTemplate } from '../types';
import { useLanguage } from '../i18n/LanguageContext';
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
  const { t: tr } = useLanguage();
  return (
    <div className="template-list">
      <div className="tl-header">
        <h2>{tr('tl.title')}</h2>
        <button className="btn btn-primary" onClick={onNew}>
          {tr('tl.new')}
        </button>
      </div>
      <div className="tl-items">
        {templates.length === 0 && (
          <div className="tl-empty">
            {tr('tl.empty')}
          </div>
        )}
        {templates.map((t) => (
          <button
            key={t.id}
            className={`tl-item ${t.id === activeId ? 'tl-active' : ''}`}
            onClick={() => onSelect(t.id)}
          >
            <span className="tl-item-name">{t.name || tr('tl.untitled')}</span>
            <span className="tl-item-method">{t.method}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
