import "server-only";

import { getPrismaClient } from "@/lib/db";

const googleMapsApiKey = process.env.GOOGLE_MAPS_API_KEY;

export type GeoPoint = {
  lat: number;
  lng: number;
  formattedAddress?: string;
};

export async function geocodeAddress(address: string, governorate?: string, area?: string) {
  if (!googleMapsApiKey) {
    return { ok: false as const, message: "GOOGLE_MAPS_API_KEY غير موجود." };
  }

  const query = [address, area, governorate, "Egypt"].filter(Boolean).join(", ");
  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  url.searchParams.set("address", query);
  url.searchParams.set("key", googleMapsApiKey);
  url.searchParams.set("region", "eg");

  const response = await fetch(url, { cache: "no-store" });
  const data = (await response.json()) as {
    status: string;
    results?: Array<{ formatted_address: string; geometry: { location: { lat: number; lng: number } } }>;
  };

  if (data.status !== "OK" || !data.results?.[0]) {
    return { ok: false as const, message: `Geocoding failed: ${data.status}` };
  }

  const result = data.results[0];

  return {
    ok: true as const,
    point: {
      lat: result.geometry.location.lat,
      lng: result.geometry.location.lng,
      formattedAddress: result.formatted_address,
    } satisfies GeoPoint,
  };
}

export type RouteStop = {
  assignmentId: number;
  shipmentId: number;
  sequence: number;
  lat: number;
  lng: number;
  label: string;
};

export async function optimizeRoute(stops: RouteStop[], origin?: GeoPoint) {
  if (stops.length === 0) {
    return { ok: true as const, orderedStops: [] as RouteStop[], polyline: "" };
  }

  const geocodedStops: RouteStop[] = [];

  for (const stop of stops) {
    if (stop.lat && stop.lng) {
      geocodedStops.push(stop);
      continue;
    }

    geocodedStops.push(stop);
  }

  if (!googleMapsApiKey || geocodedStops.length < 2) {
    const ordered = [...geocodedStops].sort((a, b) => a.sequence - b.sequence);
    return { ok: true as const, orderedStops: ordered, polyline: "" };
  }

  const start = origin || geocodedStops[0];
  const destination = geocodedStops[geocodedStops.length - 1];
  const waypoints = geocodedStops.slice(1, -1).map((stop) => `${stop.lat},${stop.lng}`).join("|");

  const url = new URL("https://maps.googleapis.com/maps/api/directions/json");
  url.searchParams.set("origin", `${start.lat},${start.lng}`);
  url.searchParams.set("destination", `${destination.lat},${destination.lng}`);
  if (waypoints) {
    url.searchParams.set("waypoints", `optimize:true|${waypoints}`);
  }
  url.searchParams.set("key", googleMapsApiKey);

  const response = await fetch(url, { cache: "no-store" });
  const data = (await response.json()) as {
    status: string;
    routes?: Array<{ overview_polyline?: { points?: string }; waypoint_order?: number[] }>;
  };

  if (data.status !== "OK" || !data.routes?.[0]) {
    const ordered = [...geocodedStops].sort((a, b) => a.sequence - b.sequence);
    return { ok: true as const, orderedStops: ordered, polyline: "" };
  }

  const route = data.routes[0];
  const middleStops = geocodedStops.slice(1, -1);
  const waypointOrder = route.waypoint_order || middleStops.map((_, index) => index);

  const orderedMiddle = waypointOrder.map((index) => middleStops[index]).filter(Boolean);
  const orderedStops = [geocodedStops[0], ...orderedMiddle, destination].map((stop, index) => ({
    ...stop,
    sequence: index + 1,
  }));

  return {
    ok: true as const,
    orderedStops,
    polyline: route.overview_polyline?.points || "",
  };
}

export async function saveRunRoute(runId: number, orderedStops: RouteStop[], polyline: string) {
  const prisma = getPrismaClient();

  if (!prisma) {
    return { ok: false as const, message: "Database unavailable" };
  }

  await prisma.$transaction([
    ...orderedStops.map((stop) =>
      prisma.deliveryAssignment.update({
        where: { id: stop.assignmentId },
        data: { sequence: stop.sequence },
      }),
    ),
    prisma.deliveryRun.update({
      where: { id: runId },
      data: { routePolyline: polyline, status: "assigned" },
    }),
  ]);

  return { ok: true as const };
}
