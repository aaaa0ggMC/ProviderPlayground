import { useEffect, useRef, useState } from 'react';
import type { RespTransform } from '../types';
import { resolveJsonPath, interpolate, applyTransforms, type TransformResult } from '../parser/variableParser';
import './TaskPoller.css';

interface TaskState {
  transformId: string;
  label: string;
  status: 'polling' | 'done' | 'failed';
  statusText: string;
  failReason: string;
  results: TransformResult[];
}

interface Props {
  transforms: RespTransform[];
  initialResponse: string;
  variables: Record<string, string>;
  onComplete: (results: TransformResult[]) => void;
}

export default function TaskPoller({ transforms, initialResponse, variables, onComplete }: Props) {
  const [tasks, setTasks] = useState<TaskState[]>([]);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tasksRef = useRef(tasks);
  tasksRef.current = tasks;

  useEffect(() => {
    let json: unknown;
    try { json = JSON.parse(initialResponse); } catch { return; }

    const initial: TaskState[] = transforms
      .filter((t) => t.type === 'task' && t.taskAddr)
      .map((t) => {
        return {
          transformId: t.id,
          label: t.label || 'Task',
          status: 'polling' as const,
          statusText: 'Starting...',
          failReason: '',
          results: [],
        };
      });

    if (initial.length === 0) return;
    setTasks(initial);
    // Trigger first poll immediately
    poll(transforms, initial, json, variables);
  }, [transforms, initialResponse]);

  const poll = async (tfList: RespTransform[], taskStates: TaskState[], initialJson: unknown, vars: Record<string, string>) => {
    const updated = [...taskStates];
    let allDone = true;

    for (let i = 0; i < updated.length; i++) {
      if (updated[i].status !== 'polling') continue;
      const tf = tfList.find((t) => t.id === updated[i].transformId);
      if (!tf || !tf.taskAddr) continue;

      try {
        const taskAddr = interpolate(tf.taskAddr, vars);
        const taskQuery = interpolate(tf.taskQuery, vars);
        const taskHeaders = interpolate(tf.taskHeaders, vars);

        const taskId = resolveJsonPath(initialJson, tf.entry.trim());
        let queryStr: string;
        if (taskQuery) {
          queryStr = taskQuery
            .replace(/\{\.([^}]+)\}/g, (_, path: string) =>
              String(resolveJsonPath(initialJson, path.trim()) ?? ''),
            )
            .replace(/\{task_id\}/g, String(taskId ?? ''));
          // Strip any existing task_id param, then attach the resolved one
          if (taskId != null) {
            queryStr = queryStr.replace(/&?task_id=[^&]*/, '').replace(/^&/, '');
            queryStr += (queryStr ? '&' : '') + `task_id=${taskId}`;
          }
        } else {
          queryStr = `task_id=${taskId ?? ''}`;
        }

        const sep = taskAddr.includes('?') ? '&' : '?';
        const url = taskAddr + sep + queryStr;

        const headers: Record<string, string> = {};
        if (taskHeaders) {
          for (const line of taskHeaders.split('\n')) {
            const idx = line.indexOf(':');
            if (idx > 0) headers[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
          }
        }
        const resp = await fetch(url, {
          method: tf.taskMethod || 'GET',
          headers: Object.keys(headers).length > 0 ? headers : undefined,
        });
        const text = await resp.text();
        if (resp.status === 400) {
          updated[i] = {
            ...updated[i],
            status: 'failed',
            statusText: text,
            failReason: text,
          };
          continue;
        }
        let respJson: unknown;
        try { respJson = JSON.parse(text); } catch { respJson = {}; }

        const statusVal = String(resolveJsonPath(respJson, tf.taskStatusPath) ?? '');
        const failReason = String(resolveJsonPath(respJson, tf.taskFailReasonPath) ?? '');

        if (tf.taskFailVal && statusVal === tf.taskFailVal) {
          updated[i] = {
            ...updated[i],
            status: 'failed',
            statusText: failReason || statusVal,
            failReason: failReason || statusVal,
          };
        } else if (statusVal === tf.taskStatusVal) {
          const results = await applyTransforms(text, tf.taskTransforms);
          // Prepend raw response
          const rawResult: TransformResult = { kind: 'text', label: 'Raw Response', value: text };
          updated[i] = {
            ...updated[i],
            status: 'done',
            statusText: 'Success',
            results: [rawResult, ...results],
          };
        } else {
          updated[i] = {
            ...updated[i],
            statusText: statusVal || 'Processing...',
          };
          allDone = false;
        }
      } catch (err) {
        updated[i] = {
          ...updated[i],
          status: 'failed',
          statusText: err instanceof Error ? err.message : String(err),
          failReason: err instanceof Error ? err.message : String(err),
        };
      }
    }

    setTasks(updated);

    if (!allDone) {
      timerRef.current = setTimeout(() => poll(tfList, updated, initialJson, vars), tfList[0]?.taskPollMs || 2000);
    } else {
      // Collect all done results, wrapping each task's results as children
      const allResults: TransformResult[] = [];
      for (const t of updated) {
        const children = t.status === 'failed'
          ? [{ kind: 'text' as const, label: 'Error', value: t.failReason }]
          : t.results;
        allResults.push({
          kind: 'text',
          label: t.label,
          value: '',
          children,
        });
      }
      onComplete(allResults);
    }
  };

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  if (tasks.length === 0) return null;

  return (
    <div className="task-poller">
      <h3 className="tp-heading">Task Progress</h3>
      {tasks.map((t) => (
        <div key={t.transformId} className={`tp-item tp-${t.status}`}>
          <span className="tp-label">{t.label}</span>
          <span className="tp-status">
            {t.status === 'polling' && <span className="tp-spinner" />}
            {t.statusText}
          </span>
        </div>
      ))}
    </div>
  );
}
