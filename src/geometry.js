(function () {
  var data = window.GakutetsuData;
  var VIEWBOX = data.VIEWBOX;
  var STATIONS = data.STATIONS;
  var TRACK_POLYLINE = data.TRACK_POLYLINE;
  var routeContext = null;

  function getBounds(items, keyX, keyY) {
    return items.reduce(function (bounds, item) {
      return {
        minX: Math.min(bounds.minX, item[keyX]),
        maxX: Math.max(bounds.maxX, item[keyX]),
        minY: Math.min(bounds.minY, item[keyY]),
        maxY: Math.max(bounds.maxY, item[keyY])
      };
    }, {
      minX: Infinity,
      maxX: -Infinity,
      minY: Infinity,
      maxY: -Infinity
    });
  }

  function distance(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  function lerp(start, end, t) {
    return start + (end - start) * t;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function createProjection() {
    var allPoints = STATIONS.concat(TRACK_POLYLINE);
    var averageLatRadians = (allPoints.reduce(function (sum, point) {
      return sum + point.lat;
    }, 0) / allPoints.length) * Math.PI / 180;

    var projected = allPoints.map(function (point) {
      return {
        geoX: point.lon * Math.cos(averageLatRadians),
        geoY: point.lat
      };
    });

    var bounds = getBounds(projected, "geoX", "geoY");
    var drawableWidth = VIEWBOX.width - VIEWBOX.paddingLeft - VIEWBOX.paddingRight;
    var drawableHeight = VIEWBOX.height - VIEWBOX.paddingTop - VIEWBOX.paddingBottom;
    var xRange = Math.max(bounds.maxX - bounds.minX, 0.00001);
    var yRange = Math.max(bounds.maxY - bounds.minY, 0.00001);
    var scale = Math.min(drawableWidth / xRange, drawableHeight / yRange);
    var offsetX = VIEWBOX.paddingLeft + (drawableWidth - xRange * scale) / 2;
    var offsetY = VIEWBOX.paddingTop + (drawableHeight - yRange * scale) / 2;

    return {
      averageLatRadians: averageLatRadians,
      bounds: bounds,
      scale: scale,
      offsetX: offsetX,
      offsetY: offsetY
    };
  }

  function projectGeoPoint(point, projection) {
    var geoX = point.lon * Math.cos(projection.averageLatRadians);
    var geoY = point.lat;
    return {
      x: projection.offsetX + (geoX - projection.bounds.minX) * projection.scale,
      y: projection.offsetY + (projection.bounds.maxY - geoY) * projection.scale
    };
  }

  function buildPolylinePath(points) {
    if (points.length < 2) {
      return "";
    }

    var path = "M " + points[0].x.toFixed(2) + " " + points[0].y.toFixed(2);
    for (var index = 1; index < points.length; index += 1) {
      path += " L " + points[index].x.toFixed(2) + " " + points[index].y.toFixed(2);
    }
    return path;
  }

  function buildCumulativeLengths(points) {
    var cumulative = [0];
    for (var index = 1; index < points.length; index += 1) {
      cumulative[index] = cumulative[index - 1] + distance(points[index - 1], points[index]);
    }
    return cumulative;
  }

  function projectToSegment(point, start, end) {
    var dx = end.x - start.x;
    var dy = end.y - start.y;
    var lengthSquared = dx * dx + dy * dy;
    var rawT = lengthSquared === 0 ? 0 : ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared;
    var t = clamp(rawT, 0, 1);
    return {
      x: start.x + dx * t,
      y: start.y + dy * t,
      t: t
    };
  }

  function pointAtRouteDistance(routeDistance, trackPoints, cumulativeLengths) {
    var totalLength = cumulativeLengths[cumulativeLengths.length - 1];
    var clampedDistance = clamp(routeDistance, 0, totalLength);

    if (clampedDistance === 0) {
      return {
        x: trackPoints[0].x,
        y: trackPoints[0].y,
        routeDistance: 0,
        segmentIndex: 0,
        t: 0
      };
    }

    if (clampedDistance === totalLength) {
      return {
        x: trackPoints[trackPoints.length - 1].x,
        y: trackPoints[trackPoints.length - 1].y,
        routeDistance: totalLength,
        segmentIndex: trackPoints.length - 2,
        t: 1
      };
    }

    for (var index = 0; index < cumulativeLengths.length - 1; index += 1) {
      var segmentStart = cumulativeLengths[index];
      var segmentEnd = cumulativeLengths[index + 1];
      if (clampedDistance >= segmentStart && clampedDistance <= segmentEnd) {
        var t = segmentEnd === segmentStart ? 0 : (clampedDistance - segmentStart) / (segmentEnd - segmentStart);
        return {
          x: lerp(trackPoints[index].x, trackPoints[index + 1].x, t),
          y: lerp(trackPoints[index].y, trackPoints[index + 1].y, t),
          routeDistance: clampedDistance,
          segmentIndex: index,
          t: t
        };
      }
    }

    return {
      x: trackPoints[trackPoints.length - 1].x,
      y: trackPoints[trackPoints.length - 1].y,
      routeDistance: totalLength,
      segmentIndex: trackPoints.length - 2,
      t: 1
    };
  }

  function findNearestProjectionOnTrack(target, trackPoints, cumulativeLengths) {
    var best = null;

    for (var index = 0; index < trackPoints.length - 1; index += 1) {
      var start = trackPoints[index];
      var end = trackPoints[index + 1];
      var projected = projectToSegment(target, start, end);
      var candidate = { x: projected.x, y: projected.y };
      var candidateDistance = distance(target, candidate);
      var segmentLength = cumulativeLengths[index + 1] - cumulativeLengths[index];
      var routeDistance = cumulativeLengths[index] + segmentLength * projected.t;

      if (!best || candidateDistance < best.distance) {
        best = {
          x: candidate.x,
          y: candidate.y,
          routeDistance: routeDistance,
          distance: candidateDistance,
          segmentIndex: index,
          t: projected.t
        };
      }
    }

    return best;
  }

  function ensureIncreasingRouteDistances(stations, trackPoints, cumulativeLengths) {
    var minimumGap = 0.01;
    var normalized = stations.map(function (station) {
      return Object.assign({}, station);
    }).sort(function (left, right) {
      return left.km - right.km;
    });

    for (var index = 1; index < normalized.length; index += 1) {
      if (normalized[index].routeDistance <= normalized[index - 1].routeDistance) {
        normalized[index].routeDistance = normalized[index - 1].routeDistance + minimumGap;
      }
    }

    return normalized.map(function (station) {
      var point = pointAtRouteDistance(station.routeDistance, trackPoints, cumulativeLengths);
      return Object.assign({}, station, {
        x: point.x,
        y: point.y,
        routeDistance: point.routeDistance
      });
    });
  }

  function buildRouteContext() {
    var projection = createProjection();
    var trackPoints = TRACK_POLYLINE.map(function (point) {
      return Object.assign({}, point, projectGeoPoint(point, projection));
    });
    var cumulativeLengths = buildCumulativeLengths(trackPoints);
    var routeStations = ensureIncreasingRouteDistances(STATIONS.map(function (station) {
      var projectedStation = projectGeoPoint(station, projection);
      var snapped = findNearestProjectionOnTrack(projectedStation, trackPoints, cumulativeLengths);
      return Object.assign({}, station, {
        x: snapped.x,
        y: snapped.y,
        routeDistance: snapped.routeDistance
      });
    }), trackPoints, cumulativeLengths);

    return {
      projection: projection,
      trackPoints: trackPoints,
      cumulativeLengths: cumulativeLengths,
      totalLength: cumulativeLengths[cumulativeLengths.length - 1],
      routeStations: routeStations,
      routePath: buildPolylinePath(trackPoints)
    };
  }

  function getRouteContext() {
    if (!routeContext) {
      routeContext = buildRouteContext();
    }
    return routeContext;
  }

  function getRouteStations() {
    return getRouteContext().routeStations;
  }

  function getRoutePath() {
    return getRouteContext().routePath;
  }

  function getStationIntervalByKm(km, stations) {
    if (km <= stations[0].km) {
      return { start: stations[0], end: stations[1], t: 0 };
    }

    if (km >= stations[stations.length - 1].km) {
      return { start: stations[stations.length - 2], end: stations[stations.length - 1], t: 1 };
    }

    for (var index = 0; index < stations.length - 1; index += 1) {
      var start = stations[index];
      var end = stations[index + 1];
      if (km >= start.km && km <= end.km) {
        return {
          start: start,
          end: end,
          t: (km - start.km) / (end.km - start.km)
        };
      }
    }

    return { start: stations[0], end: stations[1], t: 0 };
  }

  function getStationIntervalByRouteDistance(routeDistance, stations) {
    if (routeDistance <= stations[0].routeDistance) {
      return { start: stations[0], end: stations[1], t: 0 };
    }

    if (routeDistance >= stations[stations.length - 1].routeDistance) {
      return { start: stations[stations.length - 2], end: stations[stations.length - 1], t: 1 };
    }

    for (var index = 0; index < stations.length - 1; index += 1) {
      var start = stations[index];
      var end = stations[index + 1];
      if (routeDistance >= start.routeDistance && routeDistance <= end.routeDistance) {
        return {
          start: start,
          end: end,
          t: (routeDistance - start.routeDistance) / (end.routeDistance - start.routeDistance)
        };
      }
    }

    return { start: stations[0], end: stations[1], t: 0 };
  }

  function kmToRouteDistance(km) {
    var stations = getRouteStations();
    var interval = getStationIntervalByKm(km, stations);
    return lerp(interval.start.routeDistance, interval.end.routeDistance, interval.t);
  }

  function routeDistanceToKm(routeDistance) {
    var stations = getRouteStations();
    var interval = getStationIntervalByRouteDistance(routeDistance, stations);
    return lerp(interval.start.km, interval.end.km, interval.t);
  }

  function kmToPoint(km) {
    var context = getRouteContext();
    return pointAtRouteDistance(kmToRouteDistance(km), context.trackPoints, context.cumulativeLengths);
  }

  function locateGeoPointOnRoute(point) {
    var context = getRouteContext();
    var projected = projectGeoPoint(point, context.projection);
    var snapped = findNearestProjectionOnTrack(projected, context.trackPoints, context.cumulativeLengths);
    return {
      x: snapped.x,
      y: snapped.y,
      km: routeDistanceToKm(snapped.routeDistance),
      routeDistance: snapped.routeDistance,
      distance: snapped.distance
    };
  }

  function resolveRouteReference(reference) {
    if (reference && typeof reference.km === "number") {
      var clampedKm = clamp(reference.km, STATIONS[0].km, STATIONS[STATIONS.length - 1].km);
      var point = kmToPoint(clampedKm);
      return {
        x: point.x,
        y: point.y,
        km: clampedKm,
        routeDistance: point.routeDistance,
        distance: 0
      };
    }

    if (reference && typeof reference.lat === "number" && typeof reference.lon === "number") {
      return locateGeoPointOnRoute(reference);
    }

    throw new Error("Route reference requires either km or lat/lon.");
  }

  function resolveRouteCollection(collection) {
    return collection.map(function (item) {
      var reference = item.position || item;
      var resolved = resolveRouteReference(reference);
      return Object.assign({}, item, {
        km: resolved.km,
        x: resolved.x,
        y: resolved.y,
        routeDistance: resolved.routeDistance
      });
    });
  }

  function getTangentAtKm(km) {
    var context = getRouteContext();
    var routeDistance = kmToRouteDistance(km);
    var sampleOffset = 6;
    var before = pointAtRouteDistance(routeDistance - sampleOffset, context.trackPoints, context.cumulativeLengths);
    var after = pointAtRouteDistance(routeDistance + sampleOffset, context.trackPoints, context.cumulativeLengths);
    var dx = after.x - before.x;
    var dy = after.y - before.y;
    var length = Math.hypot(dx, dy) || 1;
    return { x: dx / length, y: dy / length };
  }

  function findNearestRoutePoint(x, y) {
    var context = getRouteContext();
    var projected = findNearestProjectionOnTrack({ x: x, y: y }, context.trackPoints, context.cumulativeLengths);

    return {
      x: projected.x,
      y: projected.y,
      km: routeDistanceToKm(projected.routeDistance),
      distance: projected.distance
    };
  }

  function findNearestByKm(collection, km) {
    return collection.reduce(function (nearest, current) {
      if (!nearest) {
        return current;
      }
      return Math.abs(current.km - km) < Math.abs(nearest.km - km) ? current : nearest;
    }, null);
  }

  window.GakutetsuGeometry = {
    buildSmoothPath: buildPolylinePath,
    distance: distance,
    lerp: lerp,
    getRoutePath: getRoutePath,
    getRouteStations: getRouteStations,
    kmToPoint: kmToPoint,
    getTangentAtKm: getTangentAtKm,
    projectToSegment: projectToSegment,
    findNearestRoutePoint: findNearestRoutePoint,
    findNearestByKm: findNearestByKm,
    resolveRouteCollection: resolveRouteCollection,
    resolveRouteReference: resolveRouteReference
  };
}());