(function () {
  var data = window.GakutetsuData;
  var STATIONS = data.STATIONS;
  var RAW_TIMETABLES = data.RAW_TIMETABLES;
  var OUTBOUND_ORDER = STATIONS.map(function (station) {
    return station.id;
  });
  var INBOUND_ORDER = OUTBOUND_ORDER.slice().reverse();
  var STATION_BY_ID = STATIONS.reduce(function (map, station) {
    map[station.id] = station;
    return map;
  }, {});

  function timeTextToSeconds(timeText) {
    var pieces = timeText.split(":");
    return Number(pieces[0]) * 3600 + Number(pieces[1]) * 60;
  }

  function secondsToTimeText(seconds, approximate) {
    var rounded = Math.round(seconds / 60) * 60;
    var hours = Math.floor(rounded / 3600);
    var minutes = Math.floor((rounded % 3600) / 60);
    return hours + ":" + String(minutes).padStart(2, "0") + (approximate ? "ごろ" : "");
  }

  function formatRelativeFromNow(nowSeconds, targetSeconds) {
    var delta = targetSeconds - nowSeconds;
    var totalMinutes = Math.round(Math.abs(delta) / 60);
    if (totalMinutes === 0) {
      return "いまごろ";
    }
    var hours = Math.floor(totalMinutes / 60);
    var mins = totalMinutes % 60;
    var label = hours > 0
      ? (mins > 0 ? hours + "時間" + mins + "分" : hours + "時間")
      : mins + "分";
    return delta >= 0 ? "あと " + label : label + "前";
  }

  function buildTrain(scheduleType, direction, row, index, stationOrder) {
    var stops = stationOrder.map(function (stationId, stopIndex) {
      return {
        stationId: stationId,
        station: STATION_BY_ID[stationId],
        text: row[stopIndex],
        seconds: timeTextToSeconds(row[stopIndex])
      };
    });

    return {
      id: scheduleType + "-" + direction + "-" + String(index + 1).padStart(2, "0"),
      scheduleType: scheduleType,
      direction: direction,
      label: (direction === "inbound" ? "上り" : "下り") + " " + (index + 1) + "本目",
      stops: stops
    };
  }

  function buildTimetableCache() {
    var cache = {};
    Object.keys(RAW_TIMETABLES).forEach(function (scheduleType) {
      var scheduleData = RAW_TIMETABLES[scheduleType];
      var inbound = scheduleData.inbound.map(function (row, index) {
        return buildTrain(scheduleType, "inbound", row, index, INBOUND_ORDER);
      });
      var outbound = scheduleData.outbound.map(function (row, index) {
        return buildTrain(scheduleType, "outbound", row, index, OUTBOUND_ORDER);
      });

      cache[scheduleType] = {
        inbound: inbound,
        outbound: outbound,
        all: inbound.concat(outbound)
      };
    });
    return cache;
  }

  var TIMETABLES = buildTimetableCache();

  function getScheduleLabel(type) {
    return type === "holiday" ? "土休日" : "平日";
  }

  function computeLiveTrainState(train, nowSeconds) {
    var firstStop = train.stops[0];
    var lastStop = train.stops[train.stops.length - 1];

    if (nowSeconds < firstStop.seconds || nowSeconds > lastStop.seconds) {
      return null;
    }

    for (var index = 0; index < train.stops.length; index += 1) {
      var stop = train.stops[index];
      if (nowSeconds === stop.seconds) {
        return {
          id: train.id,
          direction: train.direction,
          scheduleType: train.scheduleType,
          km: stop.station.km,
          atStation: true,
          stationName: stop.station.name,
          seconds: nowSeconds
        };
      }

      var nextStop = train.stops[index + 1];
      if (!nextStop) {
        continue;
      }

      if (nowSeconds > stop.seconds && nowSeconds < nextStop.seconds) {
        var ratio = (nowSeconds - stop.seconds) / (nextStop.seconds - stop.seconds);
        return {
          id: train.id,
          direction: train.direction,
          scheduleType: train.scheduleType,
          km: stop.station.km + (nextStop.station.km - stop.station.km) * ratio,
          atStation: false,
          section: stop.station.name + "〜" + nextStop.station.name,
          seconds: nowSeconds
        };
      }
    }

    if (nowSeconds === lastStop.seconds) {
      return {
        id: train.id,
        direction: train.direction,
        scheduleType: train.scheduleType,
        km: lastStop.station.km,
        atStation: true,
        stationName: lastStop.station.name,
        seconds: nowSeconds
      };
    }

    return null;
  }

  function getRunningTrains(scheduleType, nowSeconds) {
    return TIMETABLES[scheduleType].all.map(function (train) {
      return computeLiveTrainState(train, nowSeconds);
    }).filter(Boolean);
  }

  function computePassageForTrain(train, km) {
    var nearestStation = STATIONS.reduce(function (nearest, station) {
      if (!nearest) {
        return station;
      }
      return Math.abs(station.km - km) < Math.abs(nearest.km - km) ? station : nearest;
    }, null);

    if (nearestStation && Math.abs(nearestStation.km - km) <= 0.03) {
      var stop = train.stops.find(function (candidate) {
        return candidate.stationId === nearestStation.id;
      });
      return {
        trainId: train.id,
        direction: train.direction,
        seconds: stop.seconds,
        approximate: false,
        where: nearestStation.name + "駅"
      };
    }

    for (var index = 0; index < train.stops.length - 1; index += 1) {
      var start = train.stops[index];
      var end = train.stops[index + 1];
      var minKm = Math.min(start.station.km, end.station.km);
      var maxKm = Math.max(start.station.km, end.station.km);

      if (km > minKm && km < maxKm) {
        var ratio = (km - start.station.km) / (end.station.km - start.station.km);
        return {
          trainId: train.id,
          direction: train.direction,
          seconds: start.seconds + (end.seconds - start.seconds) * ratio,
          approximate: true,
          where: start.station.name + "〜" + end.station.name
        };
      }
    }

    return null;
  }

  function getPassageEvents(scheduleType, km) {
    return TIMETABLES[scheduleType].all.map(function (train) {
      var passage = computePassageForTrain(train, km);
      return passage ? Object.assign({ train: train }, passage) : null;
    }).filter(Boolean);
  }

  window.GakutetsuSchedule = {
    getScheduleLabel: getScheduleLabel,
    getTimetables: function () {
      return TIMETABLES;
    },
    getRunningTrains: getRunningTrains,
    getPassageEvents: getPassageEvents,
    secondsToTimeText: secondsToTimeText,
    formatRelativeFromNow: formatRelativeFromNow,
    timeTextToSeconds: timeTextToSeconds
  };
}());