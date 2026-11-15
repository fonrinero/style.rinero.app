'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

let mapsLibraryPromise;

function loadMapsLibrary(apiKey) {
  if (!mapsLibraryPromise) {
    mapsLibraryPromise = import('@googlemaps/js-api-loader').then(async ({ setOptions, importLibrary }) => {
      setOptions({ key: apiKey });
      const [maps, core] = await Promise.all([importLibrary('maps'), importLibrary('core')]);
      return { ...maps, ...core };
    });
  }
  return mapsLibraryPromise;
}

function coordinatesFor(shop) {
  if (shop.latitude == null || shop.longitude == null || shop.latitude === '' || shop.longitude === '') return null;
  const lat = Number(shop.latitude);
  const lng = Number(shop.longitude);
  return Number.isFinite(lat) && lat >= -90 && lat <= 90 && Number.isFinite(lng) && lng >= -180 && lng <= 180
    ? { lat, lng }
    : null;
}

export default function ShopMap({ shops }) {
  const mapElement = useRef(null);
  const [error, setError] = useState('');
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const locations = useMemo(() => shops.map((shop) => ({ shop, position: coordinatesFor(shop) })).filter((item) => item.position), [shops]);

  useEffect(() => {
    if (!apiKey || !mapElement.current) return undefined;
    let cancelled = false;
    let infoWindow;
    const markers = [];

    async function renderMap() {
      const { Map, Marker, InfoWindow, LatLngBounds } = await loadMapsLibrary(apiKey);
      if (cancelled || !mapElement.current) return;
      const fallbackCenter = { lat: 53.3498, lng: -6.2603 };
      const map = new Map(mapElement.current, {
        center: locations[0]?.position || fallbackCenter,
        zoom: locations.length === 1 ? 14 : 11,
        mapTypeId: 'satellite',
        mapTypeControl: true,
        mapTypeControlOptions: { mapTypeIds: ['satellite', 'hybrid', 'roadmap'] },
        fullscreenControl: true,
        streetViewControl: false,
        clickableIcons: false,
      });
      infoWindow = new InfoWindow();

      for (const { shop, position } of locations) {
        const marker = new Marker({ map, position, title: shop.name });
        marker.addListener('click', () => {
          const content = document.createElement('div');
          content.className = 'shop-map-popup';
          const title = document.createElement('strong');
          title.textContent = shop.name || 'Local shop';
          const address = document.createElement('p');
          address.textContent = [shop.location_name, shop.city, shop.address].filter(Boolean).join(' · ');
          const link = document.createElement('a');
          link.href = `/shops/${encodeURIComponent(String(shop.business_id))}`;
          link.textContent = 'See services and availability ↗';
          content.append(title, address, link);
          infoWindow.setContent(content);
          infoWindow.open({ map, anchor: marker });
        });
        markers.push(marker);
      }

      if (locations.length > 1) {
        const bounds = new LatLngBounds();
        locations.forEach(({ position }) => bounds.extend(position));
        map.fitBounds(bounds, 48);
      }
      setError('');
    }

    renderMap().catch(() => {
      if (!cancelled) setError('The map could not load. Check the Google Maps API key, billing, and website restrictions.');
    });

    return () => {
      cancelled = true;
      infoWindow?.close();
      markers.forEach((marker) => marker.setMap(null));
    };
  }, [apiKey, locations]);

  return <section className="shop-map-section" aria-label="Shop locations map">
    <div className="shop-map-heading"><div><span className="eyebrow">EXPLORE THE AREA</span><h2>Shops on the map</h2></div><span>Satellite view</span></div>
    {!apiKey ? <div className="shop-map-state"><b>Map setup needed</b><p>Add <code>NEXT_PUBLIC_GOOGLE_MAPS_API_KEY</code> to the customer website environment, then rebuild the site.</p></div>
      : <><div className="shop-map" ref={mapElement} role="application" aria-label="Satellite map showing local shops" />
        {error ? <div className="shop-map-state" role="status">{error}</div>
          : locations.length === 0 ? <div className="shop-map-state">No shop map pins yet. Locations need latitude and longitude to appear here.</div> : null}</>}
  </section>;
}
