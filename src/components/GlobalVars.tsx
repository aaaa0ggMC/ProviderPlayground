import { useState } from 'react';
import { useLanguage } from '../i18n/LanguageContext';
import './GlobalVars.css';

export interface GlobalVar {
  key: string;
  value: string;
  secret: boolean;
}

interface Props {
  vars: GlobalVar[];
  onChange: (vars: GlobalVar[]) => void;
}

export default function GlobalVars({ vars, onChange }: Props) {
  const { t } = useLanguage();
  const [collapsed, setCollapsed] = useState(true);

  const add = () => {
    onChange([...vars, { key: '', value: '', secret: false }]);
  };

  const update = (i: number, patch: Partial<GlobalVar>) => {
    onChange(vars.map((v, j) => (j === i ? { ...v, ...patch } : v)));
  };

  const remove = (i: number) => {
    onChange(vars.filter((_, j) => j !== i));
  };

  return (
    <div className="global-vars">
      <div className="gv-header" onClick={() => setCollapsed(!collapsed)}>
        <h3>{t('global.title')}</h3>
        <div className="gv-header-right">
          <span className="gv-count">{vars.length}</span>
          <span className="gv-toggle">{collapsed ? '+' : '-'}</span>
        </div>
      </div>

      {!collapsed && (
        <div className="gv-body">
          <p className="gv-hint">
            {t('global.hint')}
          </p>

          {vars.length === 0 && (
            <div className="gv-empty">{t('global.empty')}</div>
          )}

          <div className="gv-rows">
            {vars.map((v, i) => (
              <div key={i} className="gv-row">
                <input
                  className="gv-key"
                  value={v.key}
                  onChange={(e) => update(i, { key: e.target.value })}
                  placeholder={t('global.name')}
                  spellCheck={false}
                />
                <div className="gv-value-wrap">
                  <input
                    className="gv-value"
                    type={v.secret ? 'password' : 'text'}
                    value={v.value}
                    onChange={(e) => update(i, { value: e.target.value })}
                    placeholder={t('global.value')}
                    spellCheck={false}
                  />
                  <button
                    className={`gv-secret-btn ${v.secret ? 'gv-secret-on' : ''}`}
                    onClick={() => update(i, { secret: !v.secret })}
                    title={v.secret ? t('global.show') : t('global.hide')}
                  >
                    {v.secret ? '~' : '#'}
                  </button>
                </div>
                <button
                  className="btn btn-small gv-remove"
                  onClick={() => remove(i)}
                  title={t('global.remove')}
                >
                  x
                </button>
              </div>
            ))}
          </div>

          <button className="btn btn-primary btn-full" onClick={add}>
            {t('global.add')}
          </button>
        </div>
      )}
    </div>
  );
}
