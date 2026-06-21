import { useState } from 'react';
import type { TransformResult } from '../parser/variableParser';
import { useLanguage } from '../i18n/LanguageContext';
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

function ResultItem({ r, depth, onRetry, t }: { r: TransformResult; depth: number; onRetry?: (label: string) => void; t: (k: string) => string }) {
  const hasChildren = r.children && r.children.length > 0;
  const isRawResponse = r.label === 'Raw Response' && !hasChildren;
  const [rawCollapsed, setRawCollapsed] = useState(isRawResponse);

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
        {hasChildren && onRetry && (
          <button className="fr-retry-btn" onClick={() => onRetry(r.label)} title={t('fr.retry')}>
            ↻
          </button>
        )}
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
                  <a href={url} download={`image_${j + 1}`} target="_blank" rel="noreferrer" className="btn btn-small">{t('fr.download')}</a>
                </div>
              ))}
            </div>
          )}
          {!hasChildren && r.kind === 'video' && r.videoSrc && (
            <div className="fr-video">
              <video controls src={r.videoSrc} style={{ maxWidth: '100%', borderRadius: 6 }} />
              <a href={r.videoSrc} download={`video.${extFromMime(r.videoType)}`} className="btn btn-small">{t('fr.download')}</a>
            </div>
          )}
          {!hasChildren && r.kind === 'audio' && r.audioSrc && (
            <div className="fr-audio">
              <audio controls src={r.audioSrc} />
              <a href={r.audioSrc} download={`audio.${extFromMime(r.audioType)}`} className="btn btn-small">{t('fr.download')}</a>
            </div>
          )}
          {hasChildren && (
            <div className="fr-children">
              {r.children!.map((child, ci) => (
                <ResultItem key={ci} r={child} depth={depth + 1} onRetry={onRetry} t={t} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function FinalResponse({ results, onRetry }: Props) {
  const { t } = useLanguage();
  if (results.length === 0) return null;

  return (
    <div className="final-response">
      <h3 className="fr-heading">{t('fr.title')}</h3>
      {results.map((r, i) => (
        <ResultItem key={i} r={r} depth={0} onRetry={onRetry} t={t} />
      ))}
    </div>
  );
}
