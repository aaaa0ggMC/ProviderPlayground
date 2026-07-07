import { useEffect, useMemo, useRef, useState } from 'react';
import type { ParsedVar, RequestTemplate, RespTransform } from '../types';
import { extractAllVars } from '../parser/variableParser';
import './TemplateEditor.css';

interface Props {
  template: RequestTemplate;
  onChange: (t: RequestTemplate) => void;
  onDelete: () => void;
  globalVarNames: Set<string>;
  templates: RequestTemplate[];
}

const METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'] as const;

/**
 * Script editor with local text state. Typing updates only the local textarea
 * (no parent re-render), so long scripts stay smooth. The "Update" button
 * commits the text to the template and bumps scriptVersion to re-run it.
 */
function ScriptField({
  script,
  onCommit,
}: {
  script: string;
  onCommit: (script: string) => void;
}) {
  const [text, setText] = useState(script);
  const lastSynced = useRef(script);
  // If the template's script changes from elsewhere (e.g. copy-from), sync in.
  useEffect(() => {
    if (script !== lastSynced.current && script !== text) {
      setText(script);
      lastSynced.current = script;
    }
  }, [script, text]);

  const dirty = text !== lastSynced.current;
  return (
    <>
      <textarea
        className="te-input mono"
        rows={8}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={`// object = parsed JSON, global_vars = {key: value}\n// context.transform.add_text(label, text) / add_img / add_audio / add_video\ncontext.transform.add_text('Reply', object.choices[0].message.content)\ncontext.transform.add_img('Image', object.data.url)`}
      />
      <button
        className="btn btn-small"
        onClick={() => {
          lastSynced.current = text;
          onCommit(text);
        }}
        title="Run this script and update its result"
      >
        Update{dirty ? ' *' : ''}
      </button>
    </>
  );
}

export default function TemplateEditor({
  template,
  onChange,
  onDelete,
  globalVarNames,
  templates,
}: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const [collapsedTransforms, setCollapsedTransforms] = useState<Record<string, boolean>>({});
  const [copySrc, setCopySrc] = useState('');

  const otherTemplates = templates.filter((t) => t.id !== template.id);

  const srcTemplate = templates.find((t) => t.id === copySrc);
  const copyFrom = (fields: Partial<RequestTemplate>) => {
    onChange({ ...template, ...fields });
  };

  const { all, global, form } = useMemo(() => {
    const all = extractAllVars([
      template.urlTemplate,
      template.headersTemplate,
      template.bodyTemplate,
    ]);
    const global: ParsedVar[] = [];
    const form: ParsedVar[] = [];
    for (const v of all) {
      if (globalVarNames.has(v.name)) {
        global.push(v);
      } else {
        form.push(v);
      }
    }
    return { all, global, form };
  }, [template.urlTemplate, template.headersTemplate, template.bodyTemplate, globalVarNames]);

  const transforms = template.respTransforms ?? [];
  const update = (patch: Partial<RequestTemplate>) =>
    onChange({ ...template, ...patch });
  const updateTransformField = (i: number, field: keyof RespTransform, value: unknown) => {
    const next = [...transforms];
    next[i] = { ...next[i], [field]: value };
    update({ respTransforms: next });
  };

  const updateNestedTransformField = (
    parentIdx: number,
    subIdx: number,
    field: keyof RespTransform,
    value: unknown,
  ) => {
    const next = [...transforms];
    const sub = [...next[parentIdx].taskTransforms];
    sub[subIdx] = { ...sub[subIdx], [field]: value };
    next[parentIdx] = { ...next[parentIdx], taskTransforms: sub };
    update({ respTransforms: next });
  };

  return (
    <div className="template-editor">
      <div className="te-header" onClick={() => setCollapsed(!collapsed)}>
        <input
          className="te-name"
          value={template.name}
          onChange={(e) => update({ name: e.target.value })}
          placeholder="Template name..."
          onClick={(e) => e.stopPropagation()}
        />
        <span className="te-toggle">{collapsed ? '+' : '-'}</span>
      </div>

      {!collapsed && (
        <div className="te-body">
          <div className="te-row">
            <label>Method</label>
            <select
              value={template.method}
              onChange={(e) =>
                update({
                  method: e.target.value as RequestTemplate['method'],
                })
              }
            >
              {METHODS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>

          {otherTemplates.length > 0 && (
            <div className="te-row">
              <label>Copy From</label>
              <div className="te-copy-row">
                <select
                  value={copySrc}
                  onChange={(e) => setCopySrc(e.target.value)}
                >
                  <option value="">-- select source --</option>
                  {otherTemplates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name || 'Untitled'} ({t.method})
                    </option>
                  ))}
                </select>
                {copySrc && srcTemplate && (
                  <div className="te-copy-actions">
                    <button
                      className="btn btn-small"
                      onClick={() =>
                        copyFrom({
                          urlTemplate: srcTemplate.urlTemplate,
                          headersTemplate: srcTemplate.headersTemplate,
                          bodyTemplate: srcTemplate.bodyTemplate,
                          respTransforms: [...srcTemplate.respTransforms],
                        })
                      }
                    >
                      All
                    </button>
                    <button
                      className="btn btn-small"
                      onClick={() =>
                        copyFrom({ headersTemplate: srcTemplate.headersTemplate })
                      }
                    >
                      Headers
                    </button>
                    <button
                      className="btn btn-small"
                      onClick={() =>
                        copyFrom({ bodyTemplate: srcTemplate.bodyTemplate })
                      }
                    >
                      Body
                    </button>
                    <button
                      className="btn btn-small"
                      onClick={() =>
                        copyFrom({ respTransforms: [...srcTemplate.respTransforms] })
                      }
                    >
                      Transforms
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="te-row">
            <label>URL</label>
            <textarea
              className="te-input mono"
              rows={2}
              value={template.urlTemplate}
              onChange={(e) => update({ urlTemplate: e.target.value })}
              placeholder="https://api.example.com/v1/{model:string}"
            />
          </div>

          <div className="te-row">
            <label>Headers</label>
            <textarea
              className="te-input mono"
              rows={3}
              value={template.headersTemplate}
              onChange={(e) => update({ headersTemplate: e.target.value })}
              placeholder={
                'Authorization: Bearer {api_key:string}\nContent-Type: application/json'
              }
            />
          </div>

          <div className="te-row">
            <label>Body</label>
            <textarea
              className="te-input mono"
              rows={5}
              value={template.bodyTemplate}
              onChange={(e) => update({ bodyTemplate: e.target.value })}
              placeholder={`{
  "model": "{model_name:string}",
  "size": "{size:number:range(256,1024)}",
  "prompt": "{prompt:string}"
}`}
            />
          </div>

          <div className="te-row">
            <label>Response Transforms</label>
            {transforms.length === 0 && (
              <div className="te-empty">No transforms defined.</div>
            )}
            {transforms.map((rt, i) => (
              <div key={rt.id} className="te-transform-item">
                <div
                  className="te-transform-header"
                  onClick={() =>
                    setCollapsedTransforms(prev => ({
                      ...prev,
                      [rt.id]: !prev[rt.id],
                    }))
                  }
                >
                  <span className="te-transform-label">
                    <span className={`te-collapse-arrow ${collapsedTransforms[rt.id] ? '' : 'te-collapse-open'}`}>▶</span>
                    {rt.label || `#${i + 1}`}
                    <em>{rt.type}</em>
                  </span>
                  <div className="te-transform-actions">
                    <button
                      className="btn btn-small te-order-btn"
                      disabled={i === 0}
                      onClick={(e) => {
                        e.stopPropagation();
                        const next = [...transforms];
                        [next[i - 1], next[i]] = [next[i], next[i - 1]];
                        update({ respTransforms: next });
                      }}
                      title="Move up"
                    >
                      ▲
                    </button>
                    <button
                      className="btn btn-small te-order-btn"
                      disabled={i === transforms.length - 1}
                      onClick={(e) => {
                        e.stopPropagation();
                        const next = [...transforms];
                        [next[i], next[i + 1]] = [next[i + 1], next[i]];
                        update({ respTransforms: next });
                      }}
                      title="Move down"
                    >
                      ▼
                    </button>
                    <button
                      className="btn btn-small te-order-btn te-del-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        update({
                          respTransforms: transforms.filter(
                            (_, j) => j !== i,
                          ),
                        });
                      }}
                      title="Delete"
                    >
                      x
                    </button>
                  </div>
                </div>
                {!collapsedTransforms[rt.id] && (
                <div className="te-transform-body">
                  <label className="te-field-label">Name</label>
                  <input
                    type="text"
                    className="te-input"
                    value={rt.label}
                    onChange={(e) => {
                      const next = [...transforms];
                      next[i] = { ...next[i], label: e.target.value };
                      update({ respTransforms: next });
                    }}
                    placeholder="e.g. Extract reply text"
                  />
                  <label className="te-field-label">Type</label>
                  <select
                    value={rt.type}
                    onChange={(e) => {
                      const next = [...transforms];
                      next[i] = {
                        ...next[i],
                        type: e.target.value as RespTransform['type'],
                      };
                      update({ respTransforms: next });
                    }}
                  >
                    <option value="text">Text</option>
                    <option value="img">Image</option>
                    <option value="audio">Audio</option>
                    <option value="audio-url">Audio URL</option>
                    <option value="video-url">Video URL</option>
                    <option value="task">Task</option>
                    <option value="script">Script</option>
                  </select>
                  {rt.type === 'text' && (
                    <div className="te-field-group">
                      <label className="te-field-label">
                        Format <span className="te-field-hint">— JSON paths {'{.path}'}; arrays enumerate as {'0. ... 1. ...'}. Use {'[X]'} to sync multiple paths over the same array (e.g. {'{.data[X].id} {.data[X].abilities}'}). Different array roots combine as a Cartesian product.</span>
                      </label>
                      <textarea
                        className="te-input mono"
                        rows={2}
                        value={rt.format}
                        onChange={(e) => {
                          const next = [...transforms];
                          next[i] = { ...next[i], format: e.target.value };
                          update({ respTransforms: next });
                        }}
                        placeholder={`{.choices[0].message.content}`}
                      />
                    </div>
                  )}
                  {rt.type === 'script' && (
                    <>
                    <div className="te-field-group">
                      <label className="te-field-label">
                        Script <span className="te-field-hint">— JS. `{'object'}` = parsed JSON, `{'global_vars'}` = globals. Use `{'context.transform.add_text(label, text)'}` / `{'add_img'}` / `{'add_audio'}` / `{'add_video'}`. `{'console.log'}` works.</span>
                      </label>
                      <ScriptField
                        script={rt.script}
                        onCommit={(newScript) => {
                          const next = [...transforms];
                          next[i] = { ...next[i], script: newScript, scriptVersion: (next[i].scriptVersion ?? 0) + 1 };
                          update({ respTransforms: next });
                        }}
                      />
                    </div>
                    <div className="te-field-group">
                      <label className="te-field-label">
                        Local Vars <span className="te-field-hint">— available in script as `{'context.local.NAME'}`. Click Update to apply.</span>
                      </label>
                      <div className="te-kv-rows">
                        {(rt.localVars ?? []).map((lv, j) => (
                          <div key={j} className="te-kv-row">
                            <input
                              className="te-input mono te-kv-key"
                              value={lv.key}
                              onChange={(e) => {
                                const next = [...transforms];
                                const vars = [...(next[i].localVars ?? [])];
                                vars[j] = { ...vars[j], key: e.target.value };
                                next[i] = { ...next[i], localVars: vars };
                                update({ respTransforms: next });
                              }}
                              placeholder="name"
                              spellCheck={false}
                            />
                            <input
                              className="te-input mono te-kv-value"
                              value={lv.value}
                              onChange={(e) => {
                                const next = [...transforms];
                                const vars = [...(next[i].localVars ?? [])];
                                vars[j] = { ...vars[j], value: e.target.value };
                                next[i] = { ...next[i], localVars: vars };
                                update({ respTransforms: next });
                              }}
                              placeholder="value"
                              spellCheck={false}
                            />
                            <button
                              className="btn btn-small te-kv-del"
                              onClick={() => {
                                const next = [...transforms];
                                const vars = (next[i].localVars ?? []).filter((_, k) => k !== j);
                                next[i] = { ...next[i], localVars: vars };
                                update({ respTransforms: next });
                              }}
                              title="Remove"
                            >
                              ×
                            </button>
                          </div>
                        ))}
                      </div>
                      <button
                        className="btn btn-small"
                        onClick={() => {
                          const next = [...transforms];
                          next[i] = { ...next[i], localVars: [...(next[i].localVars ?? []), { key: '', value: '' }] };
                          update({ respTransforms: next });
                        }}
                      >
                        + Add Local Var
                      </button>
                    </div>
                    </>
                  )}
                  {rt.type === 'img' && (
                    <div className="te-field-group">
                      <label className="te-field-label">
                        Entry Path <span className="te-field-hint">— JSON path to the image field; arrays enumerate all items</span>
                      </label>
                      <input
                        type="text"
                        className="te-input mono"
                        value={rt.entry}
                        onChange={(e) => {
                          const next = [...transforms];
                          next[i] = { ...next[i], entry: e.target.value };
                          update({ respTransforms: next });
                        }}
                        placeholder=".images[0]"
                      />
                    </div>
                  )}
                  {rt.type === 'audio' && (
                    <>
                      <div className="te-field-group">
                        <label className="te-field-label">
                          Entry Path <span className="te-field-hint">— JSON path to base64 data or data: scheme</span>
                        </label>
                        <input
                          type="text"
                          className="te-input mono"
                          value={rt.entry}
                          onChange={(e) => {
                            const next = [...transforms];
                            next[i] = { ...next[i], entry: e.target.value };
                            update({ respTransforms: next });
                          }}
                          placeholder=".audios[0].audio_url"
                        />
                      </div>
                      <div className="te-field-group">
                          <label className="te-field-label">Encoding</label>
                          <select
                            value={rt.encoding || 'base64'}
                            onChange={(e) => {
                              const next = [...transforms];
                              next[i] = {
                                ...next[i],
                                encoding: e.target.value as RespTransform['encoding'],
                              };
                              update({ respTransforms: next });
                            }}
                          >
                            <option value="base64">Base64</option>
                            <option value="hex8">Hex8</option>
                          </select>
                        </div>
                        <div className="te-field-group">
                          <label className="te-field-label">
                            MIME Type <span className="te-field-hint">— auto-detected if blank</span>
                          </label>
                          <input
                            type="text"
                            className="te-input te-mime-input"
                            value={rt.audioMime || ''}
                            onChange={(e) => {
                              const next = [...transforms];
                              next[i] = { ...next[i], audioMime: e.target.value };
                              update({ respTransforms: next });
                            }}
                            placeholder="audio/wav"
                            spellCheck={false}
                          />
                        </div>
                    </>
                  )}
                  {rt.type === 'audio-url' && (
                    <>
                      <div className="te-field-group">
                        <label className="te-field-label">
                          Entry URL <span className="te-field-hint">— JSON path to audio URL in response</span>
                        </label>
                        <input
                          type="text"
                          className="te-input mono"
                          value={rt.entry}
                          onChange={(e) => {
                            const next = [...transforms];
                            next[i] = { ...next[i], entry: e.target.value };
                            update({ respTransforms: next });
                          }}
                          placeholder=".audios[0].audio_url"
                        />
                      </div>
                      <div className="te-field-group">
                          <label className="te-field-label">
                            Audio MIME <span className="te-field-hint">— optional; auto-detected if empty</span>
                          </label>
                          <input
                            type="text"
                            className="te-input mono"
                            value={rt.audioMime || ''}
                            onChange={(e) => {
                              const next = [...transforms];
                              next[i] = { ...next[i], audioMime: e.target.value };
                              update({ respTransforms: next });
                            }}
                            placeholder="auto"
                          />
                        </div>
                    </>
                  )}
                  {rt.type === 'video-url' && (
                    <>
                      <div className="te-field-group">
                        <label className="te-field-label">
                          Entry URL <span className="te-field-hint">— JSON path to video URL in response</span>
                        </label>
                        <input
                          type="text"
                          className="te-input mono"
                          value={rt.entry}
                          onChange={(e) => {
                            const next = [...transforms];
                            next[i] = { ...next[i], entry: e.target.value };
                            update({ respTransforms: next });
                          }}
                          placeholder=".videos[0].video_url"
                        />
                      </div>
                      <div className="te-field-group">
                          <label className="te-field-label">
                            Video MIME <span className="te-field-hint">— optional; auto-detected if empty</span>
                          </label>
                          <input
                            type="text"
                            className="te-input mono"
                            value={rt.audioMime || ''}
                            onChange={(e) => {
                              const next = [...transforms];
                              next[i] = { ...next[i], audioMime: e.target.value };
                              update({ respTransforms: next });
                            }}
                            placeholder="auto"
                          />
                        </div>
                    </>
                  )}
                  {rt.type === 'task' && (
                    <div className="te-task-fields">
                      <div className="te-field-group">
                        <label className="te-field-label">
                          Task ID Path <span className="te-field-hint">— JSON path extracting the task ID from initial response</span>
                        </label>
                        <input
                          type="text"
                          className="te-input mono"
                          value={rt.entry}
                          onChange={(e) => updateTransformField(i, 'entry', e.target.value)}
                          placeholder=".task_id"
                        />
                      </div>
                      <div className="te-field-group">
                        <label className="te-field-label">
                          Poll URL <span className="te-field-hint">— endpoint to poll for task status</span>
                        </label>
                        <input
                          type="text"
                          className="te-input mono"
                          value={rt.taskAddr}
                          onChange={(e) => updateTransformField(i, 'taskAddr', e.target.value)}
                          placeholder="https://api.example.com/v1/task"
                        />
                      </div>
                      <div className="te-field-group">
                        <label className="te-field-label">
                          Headers <span className="te-field-hint">— one per line, Key: value</span>
                        </label>
                        <textarea
                          className="te-input mono te-template-textarea"
                          rows={2}
                          value={rt.taskHeaders}
                          onChange={(e) => updateTransformField(i, 'taskHeaders', e.target.value)}
                          placeholder={'Authorization: Bearer my-token\nContent-Type: application/json'}
                        />
                      </div>
                      <div className="te-field-group">
                          <label className="te-field-label">
                            Query Params <span className="te-field-hint">— appended to Poll URL</span>
                          </label>
                          <input
                            type="text"
                            className="te-input mono"
                            value={rt.taskQuery}
                            onChange={(e) => updateTransformField(i, 'taskQuery', e.target.value)}
                            placeholder="task_id auto-filled; add extras like &other={.path}"
                          />
                        </div>
                        <div className="te-field-group">
                          <label className="te-field-label">
                            Status Path <span className="te-field-hint">— JSON path to status value in poll response</span>
                          </label>
                          <input
                            type="text"
                            className="te-input mono"
                            value={rt.taskStatusPath}
                            onChange={(e) => updateTransformField(i, 'taskStatusPath', e.target.value)}
                            placeholder=".task.status"
                          />
                        </div>
                      <div className="te-field-group">
                          <label className="te-field-label">
                            Success Value <span className="te-field-hint">— value that indicates task is done</span>
                          </label>
                          <input
                            type="text"
                            className="te-input mono"
                            value={rt.taskStatusVal}
                            onChange={(e) => updateTransformField(i, 'taskStatusVal', e.target.value)}
                            placeholder="SUCCESS"
                          />
                        </div>
                        <div className="te-field-group">
                          <label className="te-field-label">
                            Fail Reason Path <span className="te-field-hint">— JSON path for error message if failed</span>
                          </label>
                          <input
                            type="text"
                            className="te-input mono"
                            value={rt.taskFailReasonPath}
                            onChange={(e) => updateTransformField(i, 'taskFailReasonPath', e.target.value)}
                            placeholder=".task.reason"
                          />
                        </div>
                        <div className="te-field-group">
                          <label className="te-field-label">
                            Fail Value <span className="te-field-hint">— status value indicating failure (e.g. FAILED)</span>
                          </label>
                          <input
                            type="text"
                            className="te-input mono"
                            value={rt.taskFailVal}
                            onChange={(e) => updateTransformField(i, 'taskFailVal', e.target.value)}
                            placeholder="FAILED"
                          />
                        </div>
                        <div className="te-field-group">
                          <label className="te-field-label">Poll Interval (ms)</label>
                          <input
                            type="number"
                            className="te-input"
                            value={rt.taskPollMs || 2000}
                            onChange={(e) => updateTransformField(i, 'taskPollMs', Number(e.target.value))}
                            placeholder="2000"
                            style={{maxWidth:110}}
                          />
                        </div>
                      {/* Nested response transforms for the successful poll response */}
                      <div className="te-nested-transforms">
                        <div className="te-nested-header">
                          <span className="te-nested-label">Response Transforms</span>
                          <button
                            className="btn btn-small"
                            onClick={() => {
                              const next = [...transforms];
                              const sub = [...(next[i].taskTransforms || [])];
                              sub.push({
                                id: crypto.randomUUID(),
                                type: 'text',
                                label: '',
                                format: '',
                                entry: '',
                                encoding: 'base64',
                                audioMime: '',
                                script: '',
                                scriptVersion: 0,
                                localVars: [],
                                taskAddr: '',
                                taskMethod: 'GET',
                                taskHeaders: '',
                                taskQuery: '',
                                taskStatusPath: '',
                                taskStatusVal: '',
                                taskFailVal: '',
                                taskPollMs: 2000,
                                taskFailReasonPath: '',
                                taskTransforms: [],
                              });
                              next[i] = { ...next[i], taskTransforms: sub };
                              update({ respTransforms: next });
                            }}
                          >
                            + Add
                          </button>
                        </div>
                        {(rt.taskTransforms || []).length === 0 && (
                          <div className="te-empty">No response transforms.</div>
                        )}
                        {(rt.taskTransforms || []).map((sub, si) => (
                          <div key={sub.id} className="te-nested-item">
                            <div
                              className="te-nested-item-header"
                              onClick={() =>
                                setCollapsedTransforms(prev => ({
                                  ...prev,
                                  [sub.id]: !prev[sub.id],
                                }))
                              }
                            >
                              <span className="te-nested-item-label">
                                <span className={`te-collapse-arrow ${collapsedTransforms[sub.id] ? '' : 'te-collapse-open'}`}>▶</span>
                                {sub.label || `#${si + 1}`}
                                <em>{sub.type}</em>
                              </span>
                              <div className="te-transform-actions">
                                <button
                                  className="btn btn-small te-order-btn"
                                  disabled={si === 0}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const next = [...transforms];
                                    const sub = [...next[i].taskTransforms];
                                    [sub[si - 1], sub[si]] = [sub[si], sub[si - 1]];
                                    next[i] = { ...next[i], taskTransforms: sub };
                                    update({ respTransforms: next });
                                  }}
                                  title="Move up"
                                >
                                  ▲
                                </button>
                                <button
                                  className="btn btn-small te-order-btn"
                                  disabled={si === (rt.taskTransforms || []).length - 1}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const next = [...transforms];
                                    const sub = [...next[i].taskTransforms];
                                    [sub[si], sub[si + 1]] = [sub[si + 1], sub[si]];
                                    next[i] = { ...next[i], taskTransforms: sub };
                                    update({ respTransforms: next });
                                  }}
                                  title="Move down"
                                >
                                  ▼
                                </button>
                                <button
                                  className="btn btn-small te-order-btn te-del-btn"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const next = [...transforms];
                                    next[i] = {
                                      ...next[i],
                                      taskTransforms: next[i].taskTransforms.filter(
                                        (_, j) => j !== si,
                                      ),
                                    };
                                    update({ respTransforms: next });
                                  }}
                                  title="Delete"
                                >
                                  x
                                </button>
                              </div>
                            </div>
                            {!collapsedTransforms[sub.id] && (
                            <div className="te-nested-body">
                              <label className="te-field-label">Name</label>
                              <input
                                type="text"
                                className="te-input"
                                value={sub.label}
                                onChange={(e) =>
                                  updateNestedTransformField(i, si, 'label', e.target.value)
                                }
                                placeholder="e.g. Extract reply text"
                              />
                              <label className="te-field-label">Type</label>
                              <select
                                value={sub.type}
                                onChange={(e) =>
                                  updateNestedTransformField(
                                    i,
                                    si,
                                    'type',
                                    e.target.value as RespTransform['type'],
                                  )
                                }
                              >
                                <option value="text">Text</option>
                                <option value="img">Image</option>
                                <option value="audio">Audio</option>
                                <option value="audio-url">Audio URL</option>
                                <option value="video-url">Video URL</option>
                              </select>
                              {sub.type === 'text' && (
                                <div className="te-field-group">
                                  <label className="te-field-label">
                                    Format{' '}
                                    <span className="te-field-hint">
                                      — JSON path expressions like {'{.path}'}
                                    </span>
                                  </label>
                                  <textarea
                                    className="te-input mono"
                                    rows={2}
                                    value={sub.format}
                                    onChange={(e) =>
                                      updateNestedTransformField(i, si, 'format', e.target.value)
                                    }
                                    placeholder={`{.choices[0].message.content}`}
                                  />
                                </div>
                              )}
                              {sub.type === 'img' && (
                                <div className="te-field-group">
                                  <label className="te-field-label">
                                    Entry Path{' '}
                                    <span className="te-field-hint">
                                      — JSON path to the image field in response
                                    </span>
                                  </label>
                                  <input
                                    type="text"
                                    className="te-input mono"
                                    value={sub.entry}
                                    onChange={(e) =>
                                      updateNestedTransformField(i, si, 'entry', e.target.value)
                                    }
                                    placeholder=".images[0]"
                                  />
                                </div>
                              )}
                              {sub.type === 'audio-url' && (
                                <>
                                  <div className="te-field-group">
                                    <label className="te-field-label">
                                      Entry URL{' '}
                                      <span className="te-field-hint">
                                        — JSON path to audio URL in response
                                      </span>
                                    </label>
                                    <input
                                      type="text"
                                      className="te-input mono"
                                      value={sub.entry}
                                      onChange={(e) =>
                                        updateNestedTransformField(i, si, 'entry', e.target.value)
                                      }
                                      placeholder=".audios[0].audio_url"
                                    />
                                  </div>
                                  <div className="te-field-group">
                                      <label className="te-field-label">Audio MIME</label>
                                      <input
                                        type="text"
                                        className="te-input mono"
                                        value={sub.audioMime || ''}
                                        onChange={(e) =>
                                          updateNestedTransformField(
                                            i,
                                            si,
                                            'audioMime',
                                            e.target.value,
                                          )
                                        }
                                        placeholder="auto"
                                        spellCheck={false}
                                      />
                                    </div>
                                </>
                              )}
                              {sub.type === 'video-url' && (
                                <>
                                  <div className="te-field-group">
                                    <label className="te-field-label">
                                      Entry URL{' '}
                                      <span className="te-field-hint">
                                        — JSON path to video URL in response
                                      </span>
                                    </label>
                                    <input
                                      type="text"
                                      className="te-input mono"
                                      value={sub.entry}
                                      onChange={(e) =>
                                        updateNestedTransformField(i, si, 'entry', e.target.value)
                                      }
                                      placeholder=".videos[0].video_url"
                                    />
                                  </div>
                                  <div className="te-field-group">
                                      <label className="te-field-label">Video MIME</label>
                                      <input
                                        type="text"
                                        className="te-input mono"
                                        value={sub.audioMime || ''}
                                        onChange={(e) =>
                                          updateNestedTransformField(
                                            i,
                                            si,
                                            'audioMime',
                                            e.target.value,
                                          )
                                        }
                                        placeholder="auto"
                                        spellCheck={false}
                                      />
                                    </div>
                                </>
                              )}
                              {sub.type === 'audio' && (
                                <>
                                  <div className="te-field-group">
                                    <label className="te-field-label">
                                      Entry Path{' '}
                                      <span className="te-field-hint">
                                        — JSON path to the audio data in response
                                      </span>
                                    </label>
                                    <input
                                      type="text"
                                      className="te-input mono"
                                      value={sub.entry}
                                      onChange={(e) =>
                                        updateNestedTransformField(i, si, 'entry', e.target.value)
                                      }
                                      placeholder=".audios[0].audio_url"
                                    />
                                  </div>
                                  <div className="te-field-group">
                                      <label className="te-field-label">Encoding</label>
                                      <select
                                        value={sub.encoding || 'base64'}
                                        onChange={(e) =>
                                          updateNestedTransformField(
                                            i,
                                            si,
                                            'encoding',
                                            e.target.value as RespTransform['encoding'],
                                          )
                                        }
                                      >
                                        <option value="base64">Base64</option>
                                        <option value="hex8">Hex8</option>
                                      </select>
                                    </div>
                                    <div className="te-field-group">
                                      <label className="te-field-label">
                                        MIME Type{' '}
                                        <span className="te-field-hint">
                                          — auto-detected if blank
                                        </span>
                                      </label>
                                      <input
                                        type="text"
                                        className="te-input te-mime-input"
                                        value={sub.audioMime || ''}
                                        onChange={(e) =>
                                          updateNestedTransformField(
                                            i,
                                            si,
                                            'audioMime',
                                            e.target.value,
                                          )
                                        }
                                        placeholder="audio/wav"
                                        spellCheck={false}
                                      />
                                    </div>
                                </>
                              )}
                            </div>
                          )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
            ))}
            <button
              className="btn btn-small"
              onClick={() =>
                update({
                  respTransforms: [
                    ...transforms,
                    {
                      id: crypto.randomUUID(),
                      type: 'text',
                      label: '',
                      format: '',
                      entry: '',
                      encoding: 'base64',
                      audioMime: '',
                      script: '',
                      scriptVersion: 0,
                      localVars: [],
                      taskAddr: '',
                      taskMethod: 'GET',
                      taskHeaders: '',
                      taskQuery: '',
                      taskStatusPath: '',
                      taskStatusVal: '',
                      taskFailVal: '',
                      taskPollMs: 2000,
                      taskFailReasonPath: '',
                      taskTransforms: [],
                    },
                  ],
                })
              }
            >
              + Add Transform
            </button>
          </div>

          <button className="btn btn-danger" onClick={onDelete}>
            Delete Template
          </button>
        </div>
      )}

      {all.length > 0 && !collapsed && (
        <div className="te-vars">
          {global.length > 0 && (
            <>
              <strong>Global (auto-filled):</strong>
              <div className="te-var-list">
                {global.map((v) => (
                  <span key={v.name} className="te-var-badge te-var-global">
                    {v.name}
                    <em>
                      {v.type}
                      {v.constraint ? constraintLabel(v.constraint) : ''}
                      {defaultLabel(v.defaultValue)}
                    </em>
                  </span>
                ))}
              </div>
            </>
          )}

          {form.length > 0 && (
            <>
              <strong>Form fields:</strong>
              <div className="te-var-list">
                {form.map((v) => (
                  <span key={v.name} className="te-var-badge">
                    {v.name}
                    <em>
                      {v.type}
                      {v.constraint ? constraintLabel(v.constraint) : ''}
                      {defaultLabel(v.defaultValue)}
                    </em>
                  </span>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function constraintLabel(
  c: NonNullable<import('../types').ParsedVar['constraint']>,
): string {
  switch (c.kind) {
    case 'range':
      return ` ${c.min}-${c.max}`;
    case 'min':
      return ` >=${c.val}`;
    case 'max':
      return ` <=${c.val}`;
    case 'options':
      return ` [${c.values.join(', ')}]`;
  }
}

function defaultLabel(dv: string | undefined): string {
  return dv !== undefined ? ` = ${dv}` : '';
}
