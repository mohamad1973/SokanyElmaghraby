export function normalizeZoneName(name: string) {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

export function zoneNamesMatch(shipmentArea: string, zoneName: string) {
  const areaKey = normalizeZoneName(shipmentArea);
  const zoneKey = normalizeZoneName(zoneName);

  if (!areaKey || !zoneKey) {
    return false;
  }

  return areaKey.includes(zoneKey) || zoneKey.includes(areaKey);
}

export type DriverZoneRecord = {
  zone: {
    id: number;
    name: string;
    governorate: string;
    parentId: number | null;
    children?: Array<{ id: number; name: string }>;
  };
};

export function driverZoneMatchesShipment(
  driverZones: DriverZoneRecord[],
  shipment: { governorate: string; area: string },
) {
  if (driverZones.length === 0) {
    return true;
  }

  return driverZones.some(({ zone }) => {
    if (zone.governorate !== shipment.governorate) {
      return false;
    }

    if (zone.parentId === null) {
      if (zoneNamesMatch(shipment.area, zone.name)) {
        return true;
      }

      return (zone.children || []).some((child) => zoneNamesMatch(shipment.area, child.name));
    }

    return zoneNamesMatch(shipment.area, zone.name);
  });
}
