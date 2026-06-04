import { useEffect, useRef } from "react";
import { loadGoogleMaps } from "@/lib/maps/loadGoogleMaps";

export interface MapPoint {
  lat: number;
  lng: number;
  label?: string;
  title?: string;
  color?: string;
}

interface Props {
  points: MapPoint[];
  path?: { lat: number; lng: number }[];
  center?: { lat: number; lng: number };
  zoom?: number;
  height?: number | string;
  onMarkerClick?: (i: number) => void;
}

export function MapView({ points, path, center, zoom = 12, height = 360, onMarkerClick }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const polyRef = useRef<any>(null);

  useEffect(() => {
    let cancelled = false;
    loadGoogleMaps().then((g) => {
      if (cancelled || !ref.current) return;
      const fallback = points[0] ?? { lat: 23.8103, lng: 90.4125 }; // Dhaka
      mapRef.current = new g.maps.Map(ref.current, {
        center: center ?? fallback,
        zoom,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false,
      });
    }).catch((e) => console.error(e));
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const g = window.google;
    if (!g?.maps || !mapRef.current) return;
    markersRef.current.forEach((m) => m.setMap(null));
    markersRef.current = [];
    const bounds = new g.maps.LatLngBounds();
    points.forEach((p, i) => {
      const marker = new g.maps.Marker({
        position: { lat: p.lat, lng: p.lng },
        map: mapRef.current,
        label: p.label ?? String(i + 1),
        title: p.title,
        icon: p.color ? {
          path: g.maps.SymbolPath.CIRCLE,
          scale: 12,
          fillColor: p.color,
          fillOpacity: 1,
          strokeColor: "#fff",
          strokeWeight: 2,
        } : undefined,
      });
      if (onMarkerClick) marker.addListener("click", () => onMarkerClick(i));
      markersRef.current.push(marker);
      bounds.extend({ lat: p.lat, lng: p.lng });
    });
    if (polyRef.current) polyRef.current.setMap(null);
    if (path && path.length > 1) {
      polyRef.current = new g.maps.Polyline({
        path,
        geodesic: true,
        strokeColor: "#3b82f6",
        strokeOpacity: 0.9,
        strokeWeight: 4,
        map: mapRef.current,
      });
      path.forEach((p) => bounds.extend(p));
    }
    if (points.length > 1 || (path && path.length > 1)) {
      mapRef.current.fitBounds(bounds, 64);
    } else if (points.length === 1) {
      mapRef.current.setCenter(points[0]);
      mapRef.current.setZoom(15);
    }
  }, [points, path, onMarkerClick]);

  return <div ref={ref} style={{ width: "100%", height }} className="rounded-lg border bg-muted" />;
}
