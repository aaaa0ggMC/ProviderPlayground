import { useState } from 'react';
import type { TransformResult } from '../parser/variableParser';
import './FinalResponse.css';

interface Props {
  results: TransformResult[];
  onRetry?: (label: string) => void;
}

function extFromMime(mime: string | undefined): string {
  switch (mime) {
    case 'audio/mpeg': return 'mp3';
    case 'audio/wav': return 'wav';
    case 'audio/ogg': return 'ogg';
    case 'audio/flac': return 'flac';
    case 'audio/aac': return 'aac';
    case 'video/mp4': return 'mp4';
    case 'video/webm': return 'webm';
    case 'video/ogg': return 'ogv';
    case 'video/quicktime': return 'mov';
    case 'video/x-msvideo': return 'avi';
    case 'video/x-matroska': return 'mkv';
    case 'application/x-mpegURL': return 'm3u8';
    default: return 'mp4';
  }
}

function ResultItem({ r, depth, onRetry }: { r: TransformResult; depth: number; onRetry?: (label: string) => void }) {
  const hasChildren = r.children && r.children.length > 0;
  const isRawResponse = r.label === 'Raw Response' && !hasChildren;
  const [rawCollapsed, setRawCollapsed] = useState(isRawResponse);

  const downloadRaw = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!r.value) return;
    const blob = new Blob([r.value], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'response.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fr-item">
      <div className="fr-item-header">
        {r.label && (
          <span
            className={`fr-label ${isRawResponse ? 'fr-label-clickable' : ''}`}
            onClick={() => isRawResponse && setRawCollapsed(!rawCollapsed)}
          >
            {isRawResponse && <span className="fr-toggle">{rawCollapsed ? '▶' : '▼'}</span>}
            {hasChildren && <span className="fr-toggle">▼</span>}
            {r.label}
          </span>
        )}
        <div className="fr-header-actions">
          {isRawResponse && (
            <button className="fr-action-btn" onClick={downloadRaw} title="Download response">
              ⬇️
            </button>
          )}
          {hasChildren && onRetry && (
            <button className="fr-retry-btn" onClick={() => onRetry(r.label)} title="Retry task">
              ↻
            </button>
          )}
        </div>
      </div>
      {(!isRawResponse || !rawCollapsed) && (
        <>
          {!hasChildren && r.kind === 'text' && (
            <div className="fr-text">{r.value}</div>
          )}
          {!hasChildren && r.kind === 'img' && r.images && (
            <div className="fr-images">
              {r.images.map((url, j) => (
                <div key={j} className="fr-img-wrap">
                  <img src={url} alt={`${r.label || 'Image'} ${j + 1}`} />
                  <a href={url} download={`image_${j + 1}`} target="_blank" rel="noreferrer" className="btn btn-small">Download</a>
                </div>
              ))}
            </div>
          )}
          {!hasChildren && r.kind === 'video' && r.videoSrc && (
            <div className="fr-video">
              <video controls src={r.videoSrc} style={{ maxWidth: '100%', borderRadius: 6 }} />
              <a href={r.videoSrc} download={`video.${extFromMime(r.videoType)}`} className="btn btn-small">Download</a>
            </div>
          )}
          {!hasChildren && r.kind === 'audio' && r.audioSrc && (
            <div className="fr-audio">
              <audio controls src={r.audioSrc} />
              <a href={r.audioSrc} download={`audio.${extFromMime(r.audioType)}`} className="btn btn-small">Download</a>
            </div>
          )}
          {hasChildren && (
            <div className="fr-children">
              {r.children!.map((child, ci) => (
                <ResultItem key={ci} r={child} depth={depth + 1} onRetry={onRetry} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function FinalResponse({ results, onRetry }: Props) {
  if (results.length === 0) return null;

  return (
    <div className="final-response">
      <h3 className="fr-heading">Final Response</h3>
      {results.map((r, i) => (
        <ResultItem key={i} r={r} depth={0} onRetry={onRetry} />
      ))}
    </div>
  );
}
