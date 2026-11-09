'use client';

import { useEffect, useRef } from 'react';
import { loadYouTubeIframeApi } from './iframe-api';

const POSITION_POLL_MS = 250;

/** A seek request. `nonce` changes on every click so seeking to the same
 *  timestamp twice still re-fires the effect. */
export interface SeekTarget {
  seconds: number;
  nonce: number;
}

interface YouTubePlayerProps {
  videoId: string;
  seekTarget: SeekTarget | null;
  /** Called with seconds from the video start, only when the position changes. */
  onTimeUpdate?: (seconds: number) => void;
}

/**
 * An embedded YouTube player. Seeking uses the iframe's postMessage command API
 * (`enablejsapi=1`), so it works when YouTube's `iframe_api` script is blocked.
 * That script only supplies the position for `onTimeUpdate`. The video is
 * streamed by YouTube in the iframe; Lector never downloads or hosts it (#334).
 *
 * `data-seek-seconds` mirrors the last seek target so end-to-end tests can
 * assert that a transcript click drove the player without reaching across the
 * cross-origin iframe boundary.
 */
export default function YouTubePlayer({ videoId, seekTarget, onTimeUpdate }: YouTubePlayerProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const onTimeUpdateRef = useRef(onTimeUpdate);

  useEffect(() => {
    onTimeUpdateRef.current = onTimeUpdate;
  }, [onTimeUpdate]);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    let live = true;
    let timer: ReturnType<typeof setInterval> | undefined;

    // The player is never destroyed: YT.Player.destroy removes the iframe React owns.
    loadYouTubeIframeApi()
      .then((api) => {
        if (!live) return;
        const player = new api.Player(iframe, {
          events: {
            onReady: () => {
              if (!live) return;
              let lastSeconds = player.getCurrentTime();
              timer = setInterval(() => {
                const seconds = player.getCurrentTime();
                if (seconds === lastSeconds) return;
                lastSeconds = seconds;
                onTimeUpdateRef.current?.(seconds);
              }, POSITION_POLL_MS);
            },
          },
        });
      })
      .catch((err) => console.warn('YouTube position sync is unavailable:', err));

    return () => {
      live = false;
      clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (!seekTarget || !iframeRef.current?.contentWindow) return;
    const win = iframeRef.current.contentWindow;
    const command = (func: string, args: unknown[]) =>
      win.postMessage(JSON.stringify({ event: 'command', func, args }), '*');
    // Seek, then play — matches YouTube's own "click a chapter" behaviour.
    command('seekTo', [Math.max(0, seekTarget.seconds), true]);
    command('playVideo', []);
  }, [seekTarget]);

  const src = `https://www.youtube.com/embed/${encodeURIComponent(videoId)}?enablejsapi=1&rel=0`;

  return (
    <div
      data-testid="yt-player"
      data-video-id={videoId}
      data-seek-seconds={seekTarget ? Math.max(0, Math.floor(seekTarget.seconds)) : ''}
      className="aspect-video w-full overflow-hidden rounded-xl border border-border bg-black"
    >
      <iframe
        ref={iframeRef}
        className="h-full w-full"
        src={src}
        title="YouTube video player"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
      />
    </div>
  );
}
