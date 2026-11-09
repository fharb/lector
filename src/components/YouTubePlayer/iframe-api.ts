export interface YouTubeApiPlayer {
  getCurrentTime(): number;
}

interface YouTubeApi {
  Player: new (
    iframe: HTMLIFrameElement,
    options: { events: { onReady: () => void } },
  ) => YouTubeApiPlayer;
}

declare global {
  interface Window {
    YT?: YouTubeApi;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let apiPromise: Promise<YouTubeApi> | null = null;

export function loadYouTubeIframeApi(): Promise<YouTubeApi> {
  apiPromise ??= new Promise<YouTubeApi>((resolve, reject) => {
    const previousReady = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previousReady?.();
      resolve(window.YT as YouTubeApi);
    };
    const script = document.createElement('script');
    script.src = 'https://www.youtube.com/iframe_api';
    script.async = true;
    script.onerror = () => {
      apiPromise = null;
      reject(new Error('Could not load the YouTube iframe API'));
    };
    document.head.appendChild(script);
  });
  return apiPromise;
}
