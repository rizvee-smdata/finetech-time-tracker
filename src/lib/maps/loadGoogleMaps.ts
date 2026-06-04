// Loads Google Maps JS API once, asynchronously.
let promise: Promise<any> | null = null;

declare global {
  interface Window {
    __initGmaps?: () => void;
    google: any;
  }
}

export function loadGoogleMaps(): Promise<any> {
  if (typeof window === "undefined") return Promise.reject(new Error("SSR"));
  if (window.google?.maps) return Promise.resolve(window.google);
  if (promise) return promise;

  promise = new Promise((resolve, reject) => {
    const key = import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY;
    const channel = import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_TRACKING_ID;
    if (!key) return reject(new Error("Google Maps key missing"));

    window.__initGmaps = () => resolve(window.google);
    const s = document.createElement("script");
    s.async = true;
    s.defer = true;
    s.src = `https://maps.googleapis.com/maps/api/js?key=${key}&loading=async&callback=__initGmaps&channel=${channel ?? ""}`;
    s.onerror = () => reject(new Error("Failed to load Google Maps"));
    document.head.appendChild(s);
  });
  return promise;
}
