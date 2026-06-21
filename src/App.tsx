import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ParsedVar, RequestTemplate, RespTransform, SendHistoryEntry } from './types';
import { extractAllVars, interpolate, applyTransforms, type TransformResult } from './parser/variableParser';
import { useLocalStorage } from './hooks/useLocalStorage';
import TemplateList from './components/TemplateList';
import TemplateEditor from './components/TemplateEditor';
import DynamicForm from './components/DynamicForm';
import FinalResponse from './components/FinalResponse';
import TaskPoller from './components/TaskPoller';
import ResponseViewer from './components/ResponseViewer';
import GlobalVars, { type GlobalVar } from './components/GlobalVars';
import { LanguageProvider, useLanguage } from './i18n/LanguageContext';
import './App.css';

interface ExportData {
  version: number;
  exportedAt: string;
  data: {
    templates: RequestTemplate[];
    globals: GlobalVar[];
    savedValues: Record<string, Record<string, string>>;
    history: SendHistoryEntry[];
  };
}

function makeTemplate(): RequestTemplate {
  return {
    id: crypto.randomUUID(),
    name: 'New Request',
    method: 'POST',
    urlTemplate: '',
    headersTemplate: '',
    bodyTemplate: '',
    respTransforms: [],
    createdAt: Date.now(),
  };
}

const EXAMPLE_ID = crypto.randomUUID();

export default function App() {
  return (
    <LanguageProvider>
      <AppInner />
    </LanguageProvider>
  );
}

function AppInner() {
  const { t, lang, toggleLang } = useLanguage();
  const [templates, setTemplates] = useLocalStorage<RequestTemplate[]>(
    'rp_templates',
    [
      {
        id: EXAMPLE_ID,
        name: 'Example API',
        method: 'POST',
        urlTemplate: 'https://httpbin.org/post',
        headersTemplate:
          'Content-Type: application/json\nAuthorization: Bearer {api_key:string}',
        bodyTemplate:
          '{\n  "model": "{model_name:string}",\n  "size": "{width:number:range(256,1024)}x{height:number:range(256,1024)}",\n  "prompt": "{prompt:textarea}"\n}',
        respTransforms: [],
        createdAt: Date.now(),
      },
    ],
  );

  const [globalVars, setGlobalVars] = useLocalStorage<GlobalVar[]>(
    'rp_globals',
    [],
  );

  // Per-template persisted values: { [templateId]: { [varName]: value } }
  const [savedValues, setSavedValues] = useLocalStorage<
    Record<string, Record<string, string>>
  >('rp_values', {});

  const [history, setHistory] = useLocalStorage<SendHistoryEntry[]>(
    'rp_history',
    [],
  );

  const [activeId, setActiveId] = useState<string | null>(
    templates[0]?.id ?? null,
  );
  const [varValues, setVarValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<{
    status: number | null;
    body: string;
    duration: number | null;
    error: string | null;
  }>({ status: null, body: '', duration: null, error: null });

  const mergedVarsRef = useRef<Record<string, string>>({});
  const [taskResults, setTaskResults] = useState<TransformResult[]>([]);
  const [pollingActive, setPollingActive] = useState(false);
  const [retryingTransforms, setRetryingTransforms] = useState<RespTransform[]>([]);

  // Migrate old templates that lack respTransforms
  useEffect(() => {
    const needsMigration = templates.some(
      (t) => !Array.isArray(t.respTransforms),
    );
    if (needsMigration) {
      setTemplates((prev) =>
        prev.map((t) => ({
          ...t,
          respTransforms: Array.isArray(t.respTransforms)
            ? t.respTransforms
            : [],
        })),
      );
    }
    // Run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Track which templates have had defaults applied (to fire on mount + switch)
  const initedRef = useRef(new Set<string>());

  // Load persisted values + apply defaults when a template is first activated
  useEffect(() => {
    if (activeId && !initedRef.current.has(activeId)) {
      initedRef.current.add(activeId);
      const saved = savedValues[activeId] ?? {};
      const defaults: Record<string, string> = {};
      if (active) {
        const vars = extractAllVars(
          [active.urlTemplate, active.headersTemplate, active.bodyTemplate],
          globalVarNames,
        );
        for (const v of vars) {
          if (v.defaultValue !== undefined) defaults[v.name] = v.defaultValue;
        }
      }
      setVarValues({ ...defaults, ...saved });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]);

  const active = useMemo(
    () => templates.find((t) => t.id === activeId) ?? null,
    [templates, activeId],
  );

  const globalVarNames = useMemo(
    () => new Set(globalVars.map((g) => g.key).filter(Boolean)),
    [globalVars],
  );

  const globalVarMap = useMemo(() => {
    const m: Record<string, string> = {};
    for (const g of globalVars) {
      if (g.key) m[g.key] = g.value;
    }
    return m;
  }, [globalVars]);

  const allVars: ParsedVar[] = useMemo(
    () =>
      active
        ? extractAllVars(
            [
              active.urlTemplate,
              active.headersTemplate,
              active.bodyTemplate,
            ],
            globalVarNames,
          )
        : [],
    [active, globalVarNames],
  );

  // History entries filtered for the active template
  const templateHistory = useMemo(
    () =>
      activeId
        ? history
            .filter((h) => h.templateId === activeId)
            .sort((a, b) => b.timestamp - a.timestamp)
        : [],
    [history, activeId],
  );

  const updateTemplate = useCallback(
    (t: RequestTemplate) => {
      setTemplates((prev) => prev.map((x) => (x.id === t.id ? t : x)));
    },
    [setTemplates],
  );

  const deleteTemplate = useCallback(() => {
    if (!active) return;
    setTemplates((prev) => prev.filter((t) => t.id !== active.id));
    setHistory((prev) => prev.filter((h) => h.templateId !== active.id));
    setActiveId(null);
  }, [active, setTemplates, setHistory]);

  const newTemplate = useCallback(() => {
    const t = makeTemplate();
    setTemplates((prev) => [t, ...prev]);
    setActiveId(t.id);
    setVarValues({});
    setResponse({ status: null, body: '', duration: null, error: null });
  }, [setTemplates]);

  const selectTemplate = useCallback(
    (id: string) => {
      // Save current values before switching
      if (activeId) {
        setSavedValues((prev) => ({ ...prev, [activeId]: varValues }));
      }
      setActiveId(id);
      setResponse({ status: null, body: '', duration: null, error: null });
    },
    [activeId, varValues, setSavedValues],
  );

  const setVar = useCallback((name: string, value: string) => {
    setVarValues((prev) => ({ ...prev, [name]: value }));
  }, []);

  // Bulk set all var values (used for history quick-fill)
  const fillValues = useCallback((vals: Record<string, string>) => {
    setVarValues(vals);
  }, []);

  const sendRequest = useCallback(async () => {
    if (!active) return;

    setLoading(true);
    setResponse({ status: null, body: '', duration: null, error: null });
    setTaskResults([]);
    setPollingActive(active.respTransforms.some((t) => t.type === 'task' && t.taskAddr));

    // Persist values immediately
    if (activeId) {
      setSavedValues((prev) => ({ ...prev, [activeId]: varValues }));
    }

    const t0 = performance.now();
    let respStatus: number | null = null;
    let respBody = '';
    let respError: string | null = null;

    try {
      const merged = { ...globalVarMap, ...varValues };
      mergedVarsRef.current = merged;

      const url = interpolate(active.urlTemplate, merged);
      const headersRaw = interpolate(active.headersTemplate, merged);

      // JSON-escape textarea/string values for body interpolation
      const bodyVars = extractAllVars([active.bodyTemplate]);
      const varTypeMap: Record<string, string> = {};
      for (const v of bodyVars) varTypeMap[v.name] = v.type;
      const bodyValues: Record<string, string> = {};
      for (const [k, v] of Object.entries(merged)) {
        const t = varTypeMap[k];
        bodyValues[k] =
          t === 'textarea' || t === 'string'
            ? v
                .replace(/\\/g, '\\\\')
                .replace(/"/g, '\\"')
                .replace(/\n/g, '\\n')
                .replace(/\r/g, '\\r')
                .replace(/\t/g, '\\t')
            : v;
      }
      const bodyRaw = interpolate(active.bodyTemplate, bodyValues);

      const headers: Record<string, string> = {};
      if (headersRaw.trim()) {
        for (const line of headersRaw.split('\n')) {
          const idx = line.indexOf(':');
          if (idx > 0) {
            headers[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
          }
        }
      }

      const resp = await fetch(url, {
        method: active.method,
        headers: { ...headers },
        body:
          active.method !== 'GET' && bodyRaw.trim() ? bodyRaw : undefined,
      });

      respStatus = resp.status;
      respBody = await resp.text();
    } catch (err) {
      respError = err instanceof Error ? err.message : String(err);
    }

    const duration = Math.round(performance.now() - t0);

    setResponse({
      status: respStatus,
      body: respBody,
      duration,
      error: respError,
    });

    // Save to history — dedup: if same values exist, update timestamp
    const entryValues = JSON.stringify(varValues);
    setHistory((prev) => {
      const dup = prev.find(
        (h) =>
          h.templateId === active.id &&
          JSON.stringify(h.values) === entryValues,
      );
      if (dup) {
        return prev.map((h) =>
          h.id === dup.id ? { ...h, timestamp: Date.now() } : h,
        );
      }
      const entry: SendHistoryEntry = {
        id: crypto.randomUUID(),
        templateId: active.id,
        values: { ...varValues },
        duration,
        error: respError,
        timestamp: Date.now(),
      };
      return [entry, ...prev];
    });

    setLoading(false);
  }, [
    active,
    activeId,
    varValues,
    globalVarMap,
    setSavedValues,
    setHistory,
  ]);

  const clearResponse = useCallback(() => {
    setResponse({ status: null, body: '', duration: null, error: null });
    setTaskResults([]);
    setPollingActive(false);
  }, []);

  const [transformed, setTransformed] = useState<TransformResult[]>([]);
  useEffect(() => {
    if (!active || !response.body || !Array.isArray(active.respTransforms)) {
      setTransformed([]);
      return;
    }
    const nonTask = active.respTransforms.filter((t) => t.type !== 'task');
    applyTransforms(response.body, nonTask).then(setTransformed);
  }, [active, response.body]);

  // Combined: non-task transforms + async task results
  const allResults = useMemo(
    () => [...transformed, ...taskResults],
    [transformed, taskResults],
  );

  const handleCopyRaw = useCallback(() => {
    if (response.body) {
      navigator.clipboard.writeText(response.body).catch(() => {});
    }
  }, [response.body]);

  const handleRetryTask = useCallback((label: string) => {
    if (!active) return;
    const tf = active.respTransforms.find((t) => t.type === 'task' && t.label === label);
    if (!tf) return;
    setRetryingTransforms((prev) => [...prev, tf]);
  }, [active]);

  const handleRetryComplete = useCallback((results: TransformResult[]) => {
    // Replace matching result in taskResults by label
    for (const r of results) {
      if (r.label) {
        setTaskResults((prev) =>
          prev.map((p) => (p.label === r.label ? r : p)),
        );
      }
    }
    setRetryingTransforms((prev) => prev.slice(1));
  }, []);

  const clearHistory = useCallback(() => {
    if (!activeId) return;
    setHistory((prev) => prev.filter((h) => h.templateId !== activeId));
  }, [activeId, setHistory]);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleExport = useCallback(() => {
    const data: ExportData = {
      version: 1,
      exportedAt: new Date().toISOString(),
      data: {
        templates,
        globals: globalVars,
        savedValues,
        history,
      },
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `playground-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [templates, globalVars, savedValues, history]);

  const handleImportFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const parsed: ExportData = JSON.parse(evt.target?.result as string);
        if (!parsed.data || !Array.isArray(parsed.data.templates)) {
          alert('Invalid file: missing templates array');
          return;
        }
        localStorage.setItem('rp_templates', JSON.stringify(parsed.data.templates));
        localStorage.setItem('rp_globals', JSON.stringify(parsed.data.globals ?? []));
        localStorage.setItem('rp_values', JSON.stringify(parsed.data.savedValues ?? {}));
        localStorage.setItem('rp_history', JSON.stringify(parsed.data.history ?? []));
        window.location.reload();
      } catch {
        alert('Failed to parse file');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  }, []);

  const handleImport = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  return (
    <div className="app">
      <main className="app-main">
        <GlobalVars vars={globalVars} onChange={setGlobalVars} />

        <div className="toolbar">
          <button className="btn btn-small lang-btn" onClick={toggleLang}>{lang === 'zh' ? 'EN' : '中'}</button>
          <button className="btn btn-small" onClick={handleExport}>{t('app.export')}</button>
          <button className="btn btn-small" onClick={handleImport}>{t('app.import')}</button>
          <input ref={fileInputRef} type="file" accept=".json" className="hidden-input" onChange={handleImportFile} />
        </div>

        <TemplateList
          templates={templates}
          activeId={activeId}
          onSelect={selectTemplate}
          onNew={newTemplate}
        />

        {active && (
          <>
            <TemplateEditor
              template={active}
              onChange={updateTemplate}
              onDelete={deleteTemplate}
              globalVarNames={globalVarNames}
              templates={templates}
            />

            <DynamicForm
              vars={allVars}
              values={varValues}
              onChange={setVar}
              onSend={sendRequest}
              loading={loading}
              history={templateHistory}
              onFill={fillValues}
              onClearHistory={clearHistory}
            />
          </>
        )}

        <FinalResponse results={allResults} onRetry={handleRetryTask} />

        {active && response.body && !response.error && pollingActive && (
          <TaskPoller
            transforms={active.respTransforms}
            initialResponse={response.body}
            variables={mergedVarsRef.current}
            onComplete={(results) => {
              setTaskResults(results);
              setPollingActive(false);
            }}
          />
        )}

        {active && response.body && retryingTransforms.length > 0 && (
          <TaskPoller
            key={retryingTransforms[0].id}
            transforms={retryingTransforms}
            initialResponse={response.body}
            variables={mergedVarsRef.current}
            onComplete={handleRetryComplete}
          />
        )}

        <ResponseViewer
          status={response.status}
          body={response.body}
          duration={response.duration}
          error={response.error}
          onClear={clearResponse}
          onCopyRaw={handleCopyRaw}
          defaultCollapsed={allResults.length > 0}
        />
      </main>
    </div>
  );
}
