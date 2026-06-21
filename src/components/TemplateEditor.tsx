import { useMemo, useState } from 'react';
import type { ParsedVar, RequestTemplate, RespTransform } from '../types';
import { extractAllVars } from '../parser/variableParser';
import { useLanguage } from '../i18n/LanguageContext';
import './TemplateEditor.css';

interface Props {
  template: RequestTemplate;
  onChange: (t: RequestTemplate) => void;
  onDelete: () => void;
  globalVarNames: Set<string>;
  templates: RequestTemplate[];
}

const METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'] as const;

export default function TemplateEditor({
  template,
  onChange,
  onDelete,
  globalVarNames,
  templates,
}: Props) {
  const { t: tr } = useLanguage();
  const [collapsed, setCollapsed] = useState(false);
  const [collapsedTransforms, setCollapsedTransforms] = useState<Record<string, boolean>>({});
  const [copySrc, setCopySrc] = useState('');

  const otherTemplates = templates.filter((t) => t.id !== template.id);

  const srcTemplate = templates.find((t) => t.id === copySrc);
  const copyFrom = (fields: Partial<RequestTemplate>) => {
    onChange({ ...template, ...fields });
  };

  const { global, form } = useMemo(() => {
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
          placeholder={tr('te.name')}
          onClick={(e) => e.stopPropagation()}
        />
        <span className="te-toggle">{collapsed ? '+' : '-'}</span>
      </div>

      {!collapsed && (
        <div className="te-body">
          <div className="te-row">
            <label>{tr('te.method')}</label>
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
              <label>{tr('te.copyFrom')}</label>
              <div className="te-copy-row">
                <select
                  value={copySrc}
                  onChange={(e) => setCopySrc(e.target.value)}
                >
                  <option value="">{tr('te.selectSource')}</option>
                  {otherTemplates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name || tr('tl.untitled')} ({t.method})
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
                      {tr('te.tabAll')}
                    </button>
                    <button
                      className="btn btn-small"
                      onClick={() =>
                        copyFrom({ headersTemplate: srcTemplate.headersTemplate })
                      }
                    >
                      {tr('te.tabHeaders')}
                    </button>
                    <button
                      className="btn btn-small"
                      onClick={() =>
                        copyFrom({ bodyTemplate: srcTemplate.bodyTemplate })
                      }
                    >
                      {tr('te.tabBody')}
                    </button>
                    <button
                      className="btn btn-small"
                      onClick={() =>
                        copyFrom({ respTransforms: [...srcTemplate.respTransforms] })
                      }
                    >
                      {tr('te.tabTransforms')}
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="te-row">
            <label>{tr('te.url')}</label>
            <textarea
              className="te-input mono"
              rows={2}
              value={template.urlTemplate}
              onChange={(e) => update({ urlTemplate: e.target.value })}
              placeholder="https://api.example.com/v1/{model:string}"
            />
          </div>

          <div className="te-row">
            <label>{tr('te.headers')}</label>
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
            <label>{tr('te.body')}</label>
            <textarea
              className="te-input mono"
              rows={5}
              value={template.bodyTemplate}
              onChange={(e) => update({ bodyTemplate: e.target.value })}
              placeholder={`{\n  "model": "{model_name:string}",\n  "size": "{size:number:range(256,1024)}",\n  "prompt": "{prompt:string}"\n}`}
            />
          </div>

          <div className="te-row">
            <label>{tr('te.responseTransforms')}</label>
            {transforms.length === 0 && (
              <div className="te-empty">{tr('te.noTransforms')}</div>
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
                  <span>{rt.label || tr('te.nameLabel')}</span>
                  <span className="te-transform-type">{rt.type}</span>
                  <span className="te-toggle">{collapsedTransforms[rt.id] ? '+' : '-'}</span>
                </div>

                {!collapsedTransforms[rt.id] && (
                  <div className="te-transform-body">
                    {global.length > 0 && (
                      <div className="te-global-vars">
                        <span className="te-global-label">{tr('te.global')}</span>
                        {global.map(v => (
                          <span key={v.name} className="te-global-var">{v.name}{(v.constraint || v.defaultValue !== undefined) && <span className="te-var-detail">{v.constraint ? ` (${v.type})` : ''}{v.defaultValue !== undefined ? ` = ${v.defaultValue}` : ''}</span>}</span>
                        ))}
                      </div>
                    )}
                    <div className="te-row">
                      <label>{tr('te.type')}</label>
                      <select
                        value={rt.type}
                        onChange={(e) =>
                          updateTransformField(i, 'type', e.target.value)
                        }
                      >
                        <option value="text">{tr('te.type')}: text</option>
                        <option value="img">img</option>
                        <option value="audio">audio</option>
                        <option value="audio-url">audio-url</option>
                        <option value="video-url">video-url</option>
                        <option value="task">task</option>
                      </select>
                    </div>

                    <div className="te-row">
                      <label>{tr('te.format')}</label>
                      <select
                        value={rt.format}
                        onChange={(e) =>
                          updateTransformField(i, 'format', e.target.value)
                        }
                      >
                        <option value="clean">{tr('te.format')}: clean</option>
                        <option value="raw">raw</option>
                      </select>
                    </div>

                    <div className="te-row">
                      <label>{tr('te.entryPath')}</label>
                      <input
                        className="te-input"
                        value={rt.entry}
                        onChange={(e) =>
                          updateTransformField(i, 'entry', e.target.value)
                        }
                        placeholder="$.data.images"
                      />
                    </div>

                    {rt.type === 'audio' && (
                      <div className="te-row">
                        <label>{tr('te.audioMime')}</label>
                        <input
                          className="te-input"
                          value={rt.audioMime}
                          onChange={(e) =>
                            updateTransformField(i, 'audioMime', e.target.value)
                          }
                          placeholder="audio/mpeg"
                        />
                      </div>
                    )}

                    {rt.type === 'video-url' && (
                      <>
                        <div className="te-row">
                          <label>{tr('te.audioMime')}</label>
                          <input
                            className="te-input"
                            value={rt.audioMime}
                            onChange={(e) =>
                              updateTransformField(i, 'audioMime', e.target.value)
                            }
                            placeholder="audio/mpeg"
                          />
                        </div>
                        <div className="te-row">
                          <label>{tr('te.mimeType')}</label>
                          <input
                            className="te-input"
                            value={rt.audioMime}
                            onChange={(e) =>
                              updateTransformField(i, 'audioMime', e.target.value)
                            }
                            placeholder="video/mp4"
                          />
                        </div>
                      </>
                    )}

                    {(rt.type === 'audio' || rt.type === 'video-url') && (
                      <div className="te-row">
                        <label>{tr('te.encoding')}</label>
                        <select
                          value={rt.encoding}
                          onChange={(e) =>
                            updateTransformField(i, 'encoding', e.target.value)
                          }
                        >
                          <option value="base64">base64</option>
                          <option value="hex8">hex8</option>
                        </select>
                      </div>
                    )}

                    {rt.type === 'task' && (
                      <>
                        <div className="te-task-section">
                          <h4>{tr('te.responseTransforms')}</h4>
                          <div className="te-row">
                            <label>{tr('te.taskIdPath')}</label>
                            <input
                              className="te-input"
                              value={rt.taskAddr}
                              onChange={(e) =>
                                updateTransformField(i, 'taskAddr', e.target.value)
                              }
                              placeholder="https://api.example.com/tasks/{task_id}"
                            />
                          </div>
                          <div className="te-row">
                            <label>{tr('te.pollUrl')}</label>
                            <input
                              className="te-input"
                              value={rt.taskMethod}
                              onChange={(e) =>
                                updateTransformField(i, 'taskMethod', e.target.value)
                              }
                              placeholder="GET"
                            />
                          </div>
                          <div className="te-row">
                            <label>{tr('te.queryParams')}</label>
                            <textarea
                              className="te-input mono"
                              rows={2}
                              value={rt.taskQuery}
                              onChange={(e) =>
                                updateTransformField(i, 'taskQuery', e.target.value)
                              }
                              placeholder={`key={value}\n{$.id}`}
                            />
                          </div>
                          <div className="te-row">
                            <label>{tr('te.headers')}</label>
                            <textarea
                              className="te-input mono"
                              rows={2}
                              value={rt.taskHeaders}
                              onChange={(e) =>
                                updateTransformField(i, 'taskHeaders', e.target.value)
                              }
                              placeholder="Authorization: Bearer {api_key}"
                            />
                          </div>
                          <div className="te-row">
                            <label>{tr('te.statusPath')}</label>
                            <input
                              className="te-input"
                              value={rt.taskStatusPath}
                              onChange={(e) =>
                                updateTransformField(i, 'taskStatusPath', e.target.value)
                              }
                              placeholder="$.status"
                            />
                          </div>
                          <div className="te-row">
                            <label>{tr('te.successValue')}</label>
                            <input
                              className="te-input"
                              value={rt.taskStatusVal}
                              onChange={(e) =>
                                updateTransformField(i, 'taskStatusVal', e.target.value)
                              }
                              placeholder="completed"
                            />
                          </div>
                          <div className="te-row">
                            <label>{tr('te.failValue')}</label>
                            <input
                              className="te-input"
                              value={rt.taskFailVal}
                              onChange={(e) =>
                                updateTransformField(i, 'taskFailVal', e.target.value)
                              }
                              placeholder="failed"
                            />
                          </div>
                          <div className="te-row">
                            <label>{tr('te.failReasonPath')}</label>
                            <input
                              className="te-input"
                              value={rt.taskFailReasonPath}
                              onChange={(e) =>
                                updateTransformField(i, 'taskFailReasonPath', e.target.value)
                              }
                              placeholder="$.error"
                            />
                          </div>
                          <div className="te-row">
                            <label>{tr('te.pollInterval')}</label>
                            <input
                              type="number"
                              className="te-input"
                              value={rt.taskPollMs}
                              onChange={(e) =>
                                updateTransformField(i, 'taskPollMs', Number(e.target.value))
                              }
                              placeholder="2000"
                            />
                          </div>
                        </div>

                        {rt.taskTransforms?.length > 0 && (
                          <div className="te-nested-transforms">
                            <h4>{tr('te.responseTransforms')}</h4>
                            {rt.taskTransforms.map((sub, si) => (
                              <div key={sub.id} className="te-transform-item te-nested">
                                <div className="te-row">
                                  <label>{tr('te.nameLabel')}</label>
                                  <input
                                    className="te-input"
                                    value={sub.label}
                                    onChange={(e) =>
                                      updateNestedTransformField(i, si, 'label', e.target.value)
                                    }
                                  />
                                </div>
                                <div className="te-row">
                                  <label>{tr('te.type')}</label>
                                  <select
                                    value={sub.type}
                                    onChange={(e) =>
                                      updateNestedTransformField(i, si, 'type', e.target.value)
                                    }
                                  >
                                    <option value="text">text</option>
                                    <option value="img">img</option>
                                    <option value="audio">audio</option>
                                    <option value="audio-url">audio-url</option>
                                    <option value="video-url">video-url</option>
                                  </select>
                                </div>
                                <div className="te-row">
                                  <label>{tr('te.entryPath')}</label>
                                  <input
                                    className="te-input"
                                    value={sub.entry}
                                    onChange={(e) =>
                                      updateNestedTransformField(i, si, 'entry', e.target.value)
                                    }
                                    placeholder="$.data"
                                  />
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          {form.length > 0 && (
            <div className="te-form-vars">
              <span className="te-global-label">{tr('te.formFields')}</span>
              {form.map(v => (
                <span key={v.name} className="te-global-var">{v.name}{(v.constraint || v.defaultValue !== undefined) && <span className="te-var-detail">{v.constraint ? ` (${v.type})` : ''}{v.defaultValue !== undefined ? ` = ${v.defaultValue}` : ''}</span>}</span>
              ))}
            </div>
          )}

          <div className="te-footer">
            <button className="btn btn-danger" onClick={onDelete}>
              {tr('te.delete')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}