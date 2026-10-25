import { useEffect, useRef, useState } from 'react';
import { MarkersPlugin } from '@photo-sphere-viewer/markers-plugin';
import { Viewer as SphereViewer } from '@photo-sphere-viewer/core';
import '@photo-sphere-viewer/core/index.css';
import '@photo-sphere-viewer/markers-plugin/index.css';
import { Button, Card, Spinner } from '../components/ui';
import { getPanoramaById, type PanoramaHotspot, type PanoramaRecord } from '../api/panoramas';

type Props = {
  panorama: PanoramaRecord;
  className?: string;
  routePanoramaIds?: string[];
  onHotspotSelect?: (hotspot: PanoramaHotspot) => void;
  onChangePanorama?: (panorama: PanoramaRecord) => void;
};

const degreesToRadians = (value: number) => value * Math.PI / 180;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

async function isConfirmedEquirectangular(url: string): Promise<boolean> {
  const aspectOk = await new Promise<boolean>((resolve) => {
    const image = new Image();
    image.onload = () => {
      resolve(image.width / image.height >= 1.95 && image.width / image.height <= 2.05);
    };
    image.onerror = () => resolve(false);
    image.src = url;
  });
  if (!aspectOk) return false;

  // App-managed uploads live under this dedicated folder only after the editor
  // validated GPano metadata or the organizer explicitly confirmed the format.
  let pathname = '';
  try { pathname = new URL(url, window.location.href).pathname; } catch { /* handled by metadata check */ }
  if (pathname.includes('/map-floor-plans/') && pathname.includes('/panoramas/')) return true;

  try {
    const response = await fetch(url, { headers: { Range: 'bytes=0-4194303' } });
    if (!response.ok) return false;
    const prefix = new TextDecoder().decode(await response.arrayBuffer());
    return /(?:ProjectionType|projectiontype)[\s"=:>]+(?:["']?)(equirectangular)/i.test(prefix);
  } catch {
    return false;
  }
}

function markerHtml(hotspot: PanoramaHotspot): string {
  const symbol = hotspot.kind === 'transition' ? '↗' : hotspot.kind === 'info' ? 'i' : '●';
  return `<span class="ttk-panorama-marker"><span class="ttk-panorama-marker__icon">${symbol}</span><span class="ttk-panorama-marker__label">${escapeHtml(hotspot.label)}</span></span>`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[character] ?? character));
}

export function PanoramaViewer({ panorama: initialPanorama, className = '', routePanoramaIds = [], onHotspotSelect, onChangePanorama }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<SphereViewer | null>(null);
  const [panorama, setPanorama] = useState(initialPanorama);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [fullscreen, setFullscreen] = useState(false);
  const [gyroAvailable, setGyroAvailable] = useState(false);
  const [gyro, setGyro] = useState(false);
  const callbacksRef = useRef({ onHotspotSelect, onChangePanorama });
  callbacksRef.current = { onHotspotSelect, onChangePanorama };

  const routeIndex = routePanoramaIds.indexOf(panorama.id);
  const nextRouteId = routeIndex >= 0 ? routePanoramaIds[routeIndex + 1] : undefined;

  useEffect(() => {
    setPanorama(initialPanorama);
  }, [initialPanorama]);

  useEffect(() => {
    setGyroAvailable(typeof window !== 'undefined' && 'DeviceOrientationEvent' in window);
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let cancelled = false;
    setLoading(true);
    setError('');
    viewerRef.current?.destroy();
    viewerRef.current = null;
    container.replaceChildren();

    if (!panorama.image_url) {
      setLoading(false);
      setError('У этой панорамы нет изображения.');
      return;
    }

    void isConfirmedEquirectangular(panorama.image_url).then((confirmed) => {
      if (cancelled) return;
      if (!confirmed) {
        setLoading(false);
        setError('Не удалось подтвердить формат equirectangular 360°. Требуется полный кадр 2:1 и GPano/XMP-метаданные либо файл, сохранённый через редактор после явного подтверждения формата.');
        return;
      }
      try {
        const viewer = new SphereViewer({
          container,
          panorama: panorama.image_url,
          defaultYaw: degreesToRadians(panorama.initial_yaw),
          defaultPitch: 0,
          defaultZoomLvl: 45,
          minFov: 30,
          maxFov: 100,
          mousewheel: true,
          mousemove: true,
          touchmoveTwoFingers: false,
          navbar: ['zoom', 'fullscreen'],
          plugins: [[MarkersPlugin, { markers: [] }]],
          loadingTxt: 'Загрузка панорамы…',
          canvasBackground: '#20242a',
        });
        viewerRef.current = viewer;
        const markers = viewer.getPlugin<MarkersPlugin>(MarkersPlugin);
        if (!markers) throw new Error('Не удалось подключить слой хотспотов панорамы');
        markers.setMarkers(panorama.hotspots.map((hotspot) => ({
          id: hotspot.id,
          html: markerHtml(hotspot),
          position: { yaw: degreesToRadians(hotspot.yaw), pitch: degreesToRadians(hotspot.pitch) },
          anchor: 'center center',
          tooltip: hotspot.description || hotspot.label,
          className: hotspot.kind === 'transition' ? 'ttk-panorama-marker--transition' : 'ttk-panorama-marker--poi',
          size: { width: hotspot.kind === 'transition' ? 170 : 150, height: 44 },
        })), true);
        markers.addEventListener('select-marker', (event) => {
          const selected = panorama.hotspots.find((hotspot) => hotspot.id === event.marker.id);
          if (!selected) return;
          callbacksRef.current.onHotspotSelect?.(selected);
          if (selected.target_panorama_id) {
            void getPanoramaById(selected.target_panorama_id).then((next) => {
              if (next && !cancelled) {
                setPanorama(next);
                callbacksRef.current.onChangePanorama?.(next);
              }
            });
          }
        });
        viewer.addEventListener('ready', () => {
          if (!cancelled) setLoading(false);
        });
        viewer.addEventListener('panorama-loaded', () => {
          if (!cancelled) setLoading(false);
        });
        viewer.addEventListener('panorama-error', (event) => {
          if (!cancelled) {
            setLoading(false);
            setError(event.error?.message || 'Не удалось загрузить изображение панорамы.');
          }
        });
      } catch (cause) {
        if (!cancelled) {
          setLoading(false);
          setError(cause instanceof Error ? cause.message : 'Не удалось открыть панораму.');
        }
      }
    });

    return () => {
      cancelled = true;
      viewerRef.current?.destroy();
      viewerRef.current = null;
    };
  }, [panorama]);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || !gyro) return;
    const handler = (event: DeviceOrientationEvent) => {
      if (typeof event.alpha !== 'number' || typeof event.beta !== 'number') return;
      viewer.rotate({
        yaw: degreesToRadians(event.alpha),
        pitch: degreesToRadians(clamp(event.beta - 70, -35, 35)),
      });
    };
    window.addEventListener('deviceorientation', handler);
    return () => window.removeEventListener('deviceorientation', handler);
  }, [gyro, panorama]);

  const toggleFullscreen = async () => {
    const element = containerRef.current?.parentElement;
    if (!element) return;
    if (!document.fullscreenElement) {
      await element.requestFullscreen?.();
      setFullscreen(true);
    } else {
      await document.exitFullscreen?.();
      setFullscreen(false);
    }
  };

  const openNextRoutePanorama = async () => {
    if (!nextRouteId) return;
    const next = await getPanoramaById(nextRouteId);
    if (next) {
      setPanorama(next);
      onChangePanorama?.(next);
    }
  };

  return <Card className={`overflow-hidden bg-[#1a1a1a] ${className}`}>
    <div className="relative min-h-[min(78vh,680px)] w-full overflow-hidden bg-[#20242a]">
      <div ref={containerRef} className="absolute inset-0" aria-label={`360° панорама: ${panorama.title}`} />
      {loading && <div className="absolute inset-0 z-20 grid place-items-center bg-[#20242a]/90 text-white"><Spinner className="h-8 w-8 text-brand" /></div>}
      {error && <div className="absolute inset-0 z-20 grid place-items-center bg-[#20242a] p-6 text-center text-sm text-white"><div><p className="text-base font-bold">Панорама недоступна</p><p className="mt-2 max-w-md text-white/70">{error}</p></div></div>}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between gap-3 bg-gradient-to-b from-black/65 to-transparent p-4 text-white">
        <div><p className="text-[10px] font-bold uppercase tracking-[.2em] text-red-200">360° панорама</p><h2 className="mt-1 text-lg font-extrabold">{panorama.title}</h2><p className="text-xs text-white/70">Поверните обзор мышью или пальцем</p></div>
        <div className="pointer-events-auto flex gap-2"><Button variant="ghost" className="min-h-10 bg-white/15 px-3 text-white hover:bg-white/25" onClick={() => void toggleFullscreen()}>{fullscreen ? '↙' : '⛶'}</Button>{gyroAvailable && <Button variant="ghost" className={`min-h-10 px-3 text-white ${gyro ? 'bg-brand' : 'bg-white/15 hover:bg-white/25'}`} onClick={() => setGyro((value) => !value)}>⌁</Button>}</div>
      </div>
      {nextRouteId && <div className="absolute inset-x-4 bottom-4 z-10 flex justify-end"><Button className="min-h-11 shadow-lg" onClick={() => void openNextRoutePanorama()}>Следующий шаг →</Button></div>}
    </div>
    <div className="flex items-center justify-between gap-3 bg-ink px-4 py-3 text-xs text-white/70"><span>Вращение · колесо мыши и жесты изменяют масштаб</span><button className="font-semibold text-white hover:text-red-200" onClick={() => { const viewer = viewerRef.current; if (viewer) { viewer.rotate({ yaw: degreesToRadians(panorama.initial_yaw), pitch: 0 }); viewer.zoom(45); } }}>Сбросить обзор</button></div>
  </Card>;
}

export function PanoramaLoading() { return <div className="grid min-h-64 place-items-center rounded-3xl bg-ink text-white"><Spinner className="h-8 w-8 text-brand" /></div>; }
