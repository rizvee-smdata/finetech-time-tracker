import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { priorityMarkerColor } from "@/lib/routePlanner/utils";
import type { StopPriority } from "@/lib/routePlanner/types";

export interface RouteMapStop {
  id: string;
  sequence: number;
  lat: number;
  lng: number;
  label: string;
  priority: StopPriority;
  color?: string; // override for team view
}

interface Props {
  stops: RouteMapStop[];
  start?: { lat: number; lng: number; label?: string } | null;
  height?: number;
  animateReveal?: boolean;
  polylineColor?: string;
}

export function RouteMap({ stops, start, height = 360, animateReveal = false, polylineColor }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    if (!mapRef.current) {
      mapRef.current = L.map(containerRef.current, {
        center: [23.78, 90.41],
        zoom: 12,
        scrollWheelZoom: false,
      });
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap contributors",
        maxZoom: 19,
      }).addTo(mapRef.current);
      layerRef.current = L.layerGroup().addTo(mapRef.current);
    }

    const map = mapRef.current!;
    const layer = layerRef.current!;
    layer.clearLayers();

    const points: [number, number][] = [];

    if (start) {
      const startIcon = L.divIcon({
        className: "",
        html: `<div style="background:#0ea5e9;color:white;border-radius:9999px;width:28px;height:28px;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:12px;border:2px solid white;box-shadow:0 2px 8px rgba(0,0,0,.25)">S</div>`,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      });
      L.marker([start.lat, start.lng], { icon: startIcon })
        .bindPopup(start.label || "Start")
        .addTo(layer);
      points.push([start.lat, start.lng]);
    }

    const validStops = stops.filter((s) => s.lat != null && s.lng != null);

    const addMarker = (s: RouteMapStop) => {
      const color = s.color || priorityMarkerColor(s.priority);
      const icon = L.divIcon({
        className: "",
        html: `<div style="background:${color};color:white;border-radius:9999px;width:30px;height:30px;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px;border:2px solid white;box-shadow:0 2px 8px rgba(0,0,0,.3)">${s.sequence}</div>`,
        iconSize: [30, 30],
        iconAnchor: [15, 15],
      });
      L.marker([s.lat, s.lng], { icon }).bindPopup(`<b>#${s.sequence} ${s.label}</b>`).addTo(layer);
      points.push([s.lat, s.lng]);
    };

    if (animateReveal) {
      validStops.forEach((s, i) => {
        setTimeout(() => {
          addMarker(s);
          const all = (start ? [[start.lat, start.lng] as [number, number]] : []).concat(
            validStops.slice(0, i + 1).map((x) => [x.lat, x.lng] as [number, number]),
          );
          if (all.length >= 2) {
            L.polyline(all, { color: polylineColor || "#6366f1", weight: 4, opacity: 0.7, dashArray: "6 6" }).addTo(layer);
          }
          if (i === validStops.length - 1 && all.length > 0) {
            map.fitBounds(L.latLngBounds(all), { padding: [40, 40] });
          }
        }, i * 350);
      });
    } else {
      validStops.forEach(addMarker);
      if (points.length >= 2) {
        L.polyline(points, { color: polylineColor || "#6366f1", weight: 4, opacity: 0.8 }).addTo(layer);
      }
      if (points.length > 0) {
        map.fitBounds(L.latLngBounds(points), { padding: [40, 40] });
      }
    }

    return () => {
      // keep map mounted; just clear layers next render
    };
  }, [stops, start, animateReveal, polylineColor]);

  useEffect(() => {
    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  return <div ref={containerRef} style={{ height, width: "100%", borderRadius: 12, overflow: "hidden" }} />;
}
