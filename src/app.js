(function () {
  var data = window.GakutetsuData;
  var geometry = window.GakutetsuGeometry;
  var schedule = window.GakutetsuSchedule;
  var VIEWBOX = data.VIEWBOX;
  var STATIONS = data.STATIONS;
  var ROUTE_STATIONS = geometry.getRouteStations();
  var CROSSINGS = geometry.resolveRouteCollection(data.CROSSINGS);
  var HOLIDAYS_2026 = data.HOLIDAYS_2026;

  var state = {
    autoScheduleType: "weekday",
    selectedScheduleType: "weekday",
    selectedPoint: null,
    dragPreview: null,
    showAllPassages: false,
    showSidePanelAll: false,
    liveTrains: [],
    now: new Date(),
    nowSeconds: 0,
    drawerOpen: false,
    sheetState: "peek"
  };

  var pickerDrag = null;
  var LS_KEY_KM = "gakutetsu.selectedKm";

  var elements = {
    clockValue: document.getElementById("clockValue"),
    dateValue: document.getElementById("dateValue"),
    autoModeLabel: document.getElementById("autoModeLabel"),
    activeModeLabel: document.getElementById("activeModeLabel"),
    runningInboundCount: document.getElementById("runningInboundCount"),
    runningOutboundCount: document.getElementById("runningOutboundCount"),
    mapShell: document.getElementById("mapShell"),
    routeMap: document.getElementById("routeMap"),
    dragPickerDock: document.getElementById("dragPickerDock"),
    dragPicker: document.getElementById("dragPicker"),
    menuToggle: document.getElementById("menuToggle"),
    drawerBackdrop: document.getElementById("drawerBackdrop"),
    appDrawer: document.getElementById("appDrawer"),
    drawerCloseButton: document.getElementById("drawerCloseButton"),
    sidePanel: document.getElementById("sidePanel"),
    selectionKind: document.getElementById("selectionKind"),
    selectionName: document.getElementById("selectionName"),
    selectionKm: document.getElementById("selectionKm"),
    nearInboundList: document.getElementById("nearInboundList"),
    nearOutboundList: document.getElementById("nearOutboundList"),
    sideAllSection: document.getElementById("sideAllSection"),
    sideAllList: document.getElementById("sideAllList"),
    toggleSidePanelAll: document.getElementById("toggleSidePanelAll"),
    resetSelectionButton: document.getElementById("resetSelectionButton"),
    nearestStation: document.getElementById("nearestStation"),
    nearestCrossing: document.getElementById("nearestCrossing"),
    selectionDetailSummary: document.getElementById("selectionDetailSummary"),
    selectionModeSummary: document.getElementById("selectionModeSummary"),
    toggleAllButton: document.getElementById("toggleAllButton"),
    allPassagesSection: document.getElementById("allPassagesSection"),
    allPassagesList: document.getElementById("allPassagesList"),
    stationList: document.getElementById("stationList"),
    crossingList: document.getElementById("crossingList"),
    kmAdjuster: document.getElementById("kmAdjuster"),
    kmInput: document.getElementById("kmInput"),
    kmMinus: document.getElementById("kmMinus"),
    kmPlus: document.getElementById("kmPlus"),
    kmAdjContext: document.getElementById("kmAdjContext"),
    sheetHandleBar: document.getElementById("sheetHandleBar")
  };

  var scheduleInputs = Array.from(document.querySelectorAll("input[name='scheduleType']"));

  function formatDateKey(date) {
    var year = date.getFullYear();
    var month = String(date.getMonth() + 1).padStart(2, "0");
    var day = String(date.getDate()).padStart(2, "0");
    return year + "-" + month + "-" + day;
  }

  function isHoliday(date) {
    return date.getDay() === 0 || date.getDay() === 6 || HOLIDAYS_2026.has(formatDateKey(date));
  }

  function determineScheduleType(date) {
    return isHoliday(date) ? "holiday" : "weekday";
  }

  function formatDisplayDate(date) {
    return new Intl.DateTimeFormat("ja-JP", {
      year: "numeric",
      month: "long",
      day: "numeric",
      weekday: "long"
    }).format(date);
  }

  function formatDisplayTime(date) {
    return date.toLocaleTimeString("ja-JP", { hour12: false });
  }

  function estimateLabelWidth(text, fontSize) {
    return text.length * fontSize * 1.04;
  }

  function clampLabelX(x, anchor, text, fontSize) {
    var padding = 26;
    var width = estimateLabelWidth(text, fontSize);

    if (anchor === "start") {
      return Math.max(padding, Math.min(VIEWBOX.width - padding - width, x));
    }

    if (anchor === "end") {
      return Math.max(padding + width, Math.min(VIEWBOX.width - padding, x));
    }

    return Math.max(padding + width / 2, Math.min(VIEWBOX.width - padding - width / 2, x));
  }

  function buildLeaderPath(startX, startY, endX, endY, midX, midY) {
    if (typeof midX === "number" && typeof midY === "number") {
      return "M " + startX.toFixed(2) + " " + startY.toFixed(2) + " L " + midX.toFixed(2) + " " + midY.toFixed(2) + " L " + endX.toFixed(2) + " " + endY.toFixed(2);
    }

    return "M " + startX.toFixed(2) + " " + startY.toFixed(2) + " L " + endX.toFixed(2) + " " + endY.toFixed(2);
  }

  function isInsideRect(clientX, clientY, rect) {
    return clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
  }

  function isInsideBox(point, x, y, width, height) {
    return point.x >= x && point.x <= x + width && point.y >= y && point.y <= y + height;
  }

  function projectClientToSvg(clientX, clientY) {
    var svgRect = elements.routeMap.getBoundingClientRect();
    var scaleX = VIEWBOX.width / svgRect.width;
    var scaleY = VIEWBOX.height / svgRect.height;
    return {
      x: (clientX - svgRect.left) * scaleX,
      y: (clientY - svgRect.top) * scaleY
    };
  }

  function projectClientToRoute(clientX, clientY) {
    var point = projectClientToSvg(clientX, clientY);
    return geometry.findNearestRoutePoint(point.x, point.y);
  }

  function selectKm(km) {
    var point = geometry.kmToPoint(km);
    applyProjectedSelection({
      x: point.x,
      y: point.y,
      km: km
    });
  }

  function setSheetState(nextState) {
    state.sheetState = nextState;
    elements.sidePanel.dataset.sheet = nextState;
  }

  function applyProjectedSelection(projected) {
    var metadata = resolveSelectionMetadata(projected.km);
    state.selectedPoint = {
      x: projected.x,
      y: projected.y,
      km: projected.km,
      metadata: metadata
    };
    state.dragPreview = null;
    state.showAllPassages = false;
    setSheetState("peek");
    try { localStorage.setItem(LS_KEY_KM, projected.km.toFixed(4)); } catch (e) {}
    renderMap();
    updateSelectionPanel();
  }

  function buildLocationMarkerMarkup(point, mode) {
    var isPreview = mode === "preview";
    var ringRadius = isPreview ? 15 : 20;
    var ringFill = isPreview ? "rgba(255, 196, 71, 0.24)" : "rgba(35, 196, 123, 0.20)";
    var ringStroke = isPreview ? "#ffb631" : "#23c47b";
    var stemStroke = isPreview ? "#ffb631" : "#23c47b";
    var figureFill = isPreview ? "#ffb631" : "#ff9b2f";
    var scale = isPreview ? 1.55 : 2.35;
    var opacity = isPreview ? 0.9 : 1;
    return '' +
      '<g transform="translate(' + point.x.toFixed(2) + ' ' + point.y.toFixed(2) + ')" opacity="' + opacity + '">' +
        '<circle cx="0" cy="0" r="' + ringRadius + '" fill="' + ringFill + '" stroke="' + ringStroke + '" stroke-width="3"></circle>' +
        '<path d="M 0 -6 L 0 -46" fill="none" stroke="' + stemStroke + '" stroke-width="5.5" stroke-linecap="round"></path>' +
        '<g transform="translate(0 -58) scale(' + scale.toFixed(2) + ')">' +
          '<circle cx="0" cy="-10" r="6" fill="' + figureFill + '" stroke="#18324c" stroke-width="1.8"></circle>' +
          '<rect x="-5.5" y="-1" width="11" height="16" rx="5.5" fill="' + figureFill + '" stroke="#18324c" stroke-width="1.8"></rect>' +
          '<path d="M -2 15 L -5 25 M 2 15 L 5 25" fill="none" stroke="#18324c" stroke-width="2" stroke-linecap="round"></path>' +
        '</g>' +
      '</g>';
  }

  function readDemoKmFromQuery() {
    try {
      var params = new URLSearchParams(window.location.search);
      var raw = params.get("demoKm");

      if (raw === null || raw === "") {
        return null;
      }

      var value = Number(raw);
      if (!Number.isFinite(value)) {
        return null;
      }

      return clamp(value, STATIONS[0].km, STATIONS[STATIONS.length - 1].km);
    } catch (error) {
      return null;
    }
  }

  function resolveSelectionMetadata(km) {
    var nearestStation = geometry.findNearestByKm(ROUTE_STATIONS, km);
    var nearestCrossing = geometry.findNearestByKm(CROSSINGS, km);
    var stationGap = nearestStation ? Math.abs(nearestStation.km - km) : Infinity;
    var crossingGap = nearestCrossing ? Math.abs(nearestCrossing.km - km) : Infinity;

    if (stationGap <= 0.05) {
      return {
        kind: "駅",
        name: nearestStation.name,
        note: nearestStation.note,
        station: nearestStation,
        crossing: nearestCrossing
      };
    }

    if (crossingGap <= 0.1) {
      return {
        kind: "踏切",
        name: nearestCrossing.name,
        note: nearestCrossing.note,
        station: nearestStation,
        crossing: nearestCrossing
      };
    }

    var stationBefore = ROUTE_STATIONS.reduce(function (best, s) {
      return s.km <= km && (!best || s.km > best.km) ? s : best;
    }, null);
    var stationAfter = ROUTE_STATIONS.reduce(function (best, s) {
      return s.km >= km && (!best || s.km < best.km) ? s : best;
    }, null);
    var betweenName = (stationBefore && stationAfter && stationBefore !== stationAfter)
      ? stationBefore.name + " と " + stationAfter.name + " のあいだ"
      : "駅と駅のあいだ";

    return {
      kind: "線路",
      name: betweenName,
      note: (nearestStation ? nearestStation.name : "-") + " の近くの線路上ポイントです。",
      station: nearestStation,
      crossing: nearestCrossing
    };
  }

  function buildKmContext(km) {
    var before = ROUTE_STATIONS.reduce(function (best, s) {
      return s.km <= km && (!best || s.km > best.km) ? s : best;
    }, null);
    var after = ROUTE_STATIONS.reduce(function (best, s) {
      return s.km >= km && (!best || s.km < best.km) ? s : best;
    }, null);

    if (!before || !after || before === after) {
      return before ? before.name : (after ? after.name : "");
    }

    return before.name + " から " + (km - before.km).toFixed(2) + " km\n" + after.name + " まで " + (after.km - km).toFixed(2) + " km";
  }

  function offsetPointForDirection(point, km, direction) {
    var tangent = geometry.getTangentAtKm(km);
    var normal = { x: -tangent.y, y: tangent.x };
    var offset = direction === "inbound" ? -24 : 24;
    return {
      x: point.x + normal.x * offset,
      y: point.y + normal.y * offset,
      tangent: tangent
    };
  }

  function getCrossingMarkerPoint(crossing) {
    var tangent = geometry.getTangentAtKm(crossing.km);
    var normal = { x: -tangent.y, y: tangent.x };
    var iconOffset = typeof crossing.iconOffset === "number" ? crossing.iconOffset : 0;
    return {
      x: crossing.x + normal.x * iconOffset,
      y: crossing.y + normal.y * iconOffset
    };
  }

  function getStationVisual(station, index, stations) {
    var isTerminal = index === 0 || index === stations.length - 1;
    var nameFontSize = 24;
    var kmFontSize = 15;
    var namePadding = 16;
    var nameHeight = 40;
    var labelOffset = station.labelSide === "above" ? -54 : 58;
    var kmY = station.labelSide === "above" ? station.y - 24 : station.y + 82;
    var defaultAnchor = index === 0 ? "start" : (index === stations.length - 1 ? "end" : "middle");
    var labelAnchor = station.labelAnchor || defaultAnchor;
    var baseLabelX = index === 0 ? station.x + 6 : (index === stations.length - 1 ? station.x - 6 : station.x);
    var rawLabelX = typeof station.textX === "number" ? station.textX : baseLabelX + (station.labelDx || 0);
    var nameY = typeof station.textY === "number" ? station.textY : station.y + labelOffset + (station.labelDy || 0);
    var stationKmY = typeof station.kmTextY === "number" ? station.kmTextY : kmY + (station.kmDy || station.labelDy || 0);
    var labelX = clampLabelX(rawLabelX, labelAnchor, station.name, nameFontSize);
    var nameWidth = estimateLabelWidth(station.name, nameFontSize) + namePadding * 2;
    var nameBoxX = labelAnchor === "start" ? labelX - namePadding : (labelAnchor === "end" ? labelX - nameWidth + namePadding : labelX - nameWidth / 2);
    var nameBoxY = nameY - 30;
    var textX = nameBoxX + namePadding;
    var kmX = typeof station.kmTextX === "number" ? station.kmTextX : textX;
    var leaderEndX = labelAnchor === "start" ? nameBoxX : (labelAnchor === "end" ? nameBoxX + nameWidth : labelX);
    var leaderEndY = nameBoxY + nameHeight / 2;

    if (station.leaderAttach === "right") {
      leaderEndX = nameBoxX + nameWidth;
    } else if (station.leaderAttach === "bottom") {
      leaderEndX = nameBoxX + nameWidth / 2;
      leaderEndY = nameBoxY + nameHeight;
    }

    return {
      fill: isTerminal ? "#ffe57a" : "#ffffff",
      leaderPath: buildLeaderPath(station.x, station.y, leaderEndX, leaderEndY, station.leaderMidX, station.leaderMidY),
      nameFontSize: nameFontSize,
      kmFontSize: kmFontSize,
      nameHeight: nameHeight,
      nameBoxX: nameBoxX,
      nameBoxY: nameBoxY,
      nameWidth: nameWidth,
      textX: textX,
      nameY: nameY,
      kmX: kmX,
      stationKmY: stationKmY
    };
  }

  function findStationHit(clientX, clientY) {
    var point = projectClientToSvg(clientX, clientY);

    return ROUTE_STATIONS.reduce(function (nearest, station, index, stations) {
      var visual = getStationVisual(station, index, stations);
      var labelBottom = Math.max(visual.nameBoxY + visual.nameHeight, visual.stationKmY + 10);
      var boxHit = isInsideBox(point, visual.nameBoxX - 10, visual.nameBoxY - 8, visual.nameWidth + 20, labelBottom - visual.nameBoxY + 16);
      var circleDistance = geometry.distance(point, station);

      if (!boxHit && circleDistance > 18) {
        return nearest;
      }

      if (!nearest || circleDistance < nearest.distance) {
        return {
          station: station,
          distance: circleDistance
        };
      }

      return nearest;
    }, null);
  }

  function findCrossingHit(clientX, clientY) {
    var point = projectClientToSvg(clientX, clientY);
    var threshold = 24;

    return CROSSINGS.reduce(function (nearest, crossing) {
      var marker = getCrossingMarkerPoint(crossing);
      var distance = geometry.distance(point, marker);

      if (distance > threshold) {
        return nearest;
      }

      if (!nearest || distance < nearest.distance) {
        return {
          crossing: crossing,
          distance: distance,
          marker: marker
        };
      }

      return nearest;
    }, null);
  }

  function setDrawerOpen(nextOpen) {
    state.drawerOpen = nextOpen;

    if (nextOpen) {
      elements.appDrawer.hidden = false;
      elements.drawerBackdrop.hidden = false;
    }

    elements.appDrawer.classList.toggle("is-open", nextOpen);
    elements.drawerBackdrop.classList.toggle("is-open", nextOpen);
    elements.menuToggle.setAttribute("aria-expanded", nextOpen ? "true" : "false");
    elements.appDrawer.setAttribute("aria-hidden", nextOpen ? "false" : "true");
    document.body.classList.toggle("drawer-open", nextOpen);

    if (!nextOpen) {
      elements.appDrawer.hidden = true;
      elements.drawerBackdrop.hidden = true;
    }
  }

  function syncLocationButtons() {
    var activeStationId = state.selectedPoint && state.selectedPoint.metadata.kind === "駅" && state.selectedPoint.metadata.station
      ? state.selectedPoint.metadata.station.id
      : "";
    var activeCrossingId = state.selectedPoint && state.selectedPoint.metadata.kind === "踏切" && state.selectedPoint.metadata.crossing
      ? state.selectedPoint.metadata.crossing.id
      : "";

    Array.from(elements.stationList.querySelectorAll("[data-location-id]")).forEach(function (button) {
      button.classList.toggle("is-active", button.getAttribute("data-location-id") === activeStationId);
    });

    Array.from(elements.crossingList.querySelectorAll("[data-location-id]")).forEach(function (button) {
      button.classList.toggle("is-active", button.getAttribute("data-location-id") === activeCrossingId);
    });
  }

  function renderLocationLists() {
    elements.stationList.innerHTML = ROUTE_STATIONS.map(function (station) {
      return '' +
        '<button class="location-button" type="button" data-location-id="' + station.id + '" data-location-km="' + station.km.toFixed(4) + '">' +
          '<span class="location-name">' + station.name + '</span>' +
          '<span class="location-meta">' + station.km.toFixed(1) + ' km</span>' +
        '</button>';
    }).join('');

    elements.crossingList.innerHTML = CROSSINGS.map(function (crossing) {
      return '' +
        '<button class="location-button" type="button" data-location-id="' + crossing.id + '" data-location-km="' + crossing.km.toFixed(4) + '">' +
          '<span class="location-name">' + crossing.name + '</span>' +
          '<span class="location-meta">' + crossing.km.toFixed(1) + ' km</span>' +
        '</button>';
    }).join('');

    syncLocationButtons();
  }

  function renderScheduleItems(items, emptyMessage) {
    if (!items || items.length === 0) {
      return '<li class="empty-item">' + emptyMessage + '</li>';
    }

    return items.map(function (item) {
      var passed = item.seconds < state.nowSeconds;
      var timeText = schedule.secondsToTimeText(item.seconds, item.approximate);
      var relativeText = schedule.formatRelativeFromNow(state.nowSeconds, item.seconds);
      return '' +
        '<li class="schedule-item ' + (passed ? 'passed' : '') + '">' +
          '<div class="schedule-main">' +
            '<span class="schedule-time">' + timeText + '</span>' +
            '<span class="schedule-badge ' + item.direction + '">' + (item.direction === 'inbound' ? '上り' : '下り') + '</span>' +
          '</div>' +
          '<div class="schedule-sub">' + item.where + '</div>' +
          '<div class="schedule-relative">' + relativeText + '</div>' +
        '</li>';
    }).join('');
  }

  function renderTimetableItems(items) {
    if (!items || items.length === 0) {
      return '<li class="tt-empty">本日の通過はありません</li>';
    }

    return items.map(function (item) {
      var passed = item.seconds < state.nowSeconds;
      var timeText = schedule.secondsToTimeText(item.seconds, item.approximate);
      var relText = schedule.formatRelativeFromNow(state.nowSeconds, item.seconds);
      var dirLabel = item.direction === "inbound" ? "上り" : "下り";
      var dirClass = item.direction;
      return '' +
        '<li class="tt-item' + (passed ? ' passed' : '') + '">' +
          '<span class="tt-time">' + timeText + '</span>' +
          '<span class="tt-badge ' + dirClass + '">' + dirLabel + '</span>' +
          '<span class="tt-rel">' + relText + '</span>' +
        '</li>';
    }).join('');
  }

  function updateSelectionPanel() {
    if (!state.selectedPoint) {
      elements.sidePanel.dataset.empty = "true";
      elements.sidePanel.dataset.sheet = "peek";
      elements.nearestStation.textContent = "-";
      elements.nearestCrossing.textContent = "-";
      elements.selectionDetailSummary.textContent = "えらんだ場所の説明がここに出ます。";
      elements.selectionModeSummary.textContent = "近い列車だけ表示";
      elements.nearInboundList.innerHTML = renderScheduleItems([], "場所を選ぶと表示されます");
      elements.nearOutboundList.innerHTML = renderScheduleItems([], "場所を選ぶと表示されます");
      elements.sideAllSection.hidden = true;
      elements.sideAllList.innerHTML = "";
      elements.toggleSidePanelAll.textContent = "全時刻を見る";
      elements.allPassagesSection.hidden = true;
      elements.allPassagesList.innerHTML = "";
      elements.toggleAllButton.disabled = true;
      elements.toggleAllButton.textContent = "今日のぜんぶを見る";
      elements.kmAdjuster.hidden = true;
      syncLocationButtons();
      return;
    }

    var metadata = state.selectedPoint.metadata;
    var events = schedule.getPassageEvents(state.selectedScheduleType, state.selectedPoint.km);

    var futureEvents = events.filter(function (event) {
      return event.seconds >= state.nowSeconds;
    });

    var futureInbound = futureEvents.filter(function (e) {
      return e.direction === "inbound";
    }).sort(function (a, b) { return a.seconds - b.seconds; });

    var futureOutbound = futureEvents.filter(function (e) {
      return e.direction === "outbound";
    }).sort(function (a, b) { return a.seconds - b.seconds; });

    var allFuture = futureEvents.slice().sort(function (a, b) { return a.seconds - b.seconds; });
    var allEvents = events.slice().sort(function (a, b) { return a.seconds - b.seconds; });

    elements.sidePanel.dataset.empty = "false";
    elements.selectionKind.textContent = metadata.kind;
    elements.selectionName.textContent = metadata.name;
    elements.selectionKm.textContent = state.selectedPoint.km.toFixed(2) + " km";
    elements.nearestStation.textContent = metadata.station ? metadata.station.name : "-";
    elements.nearestCrossing.textContent = metadata.crossing ? metadata.crossing.name : "-";
    elements.selectionDetailSummary.textContent = metadata.note;
    elements.selectionModeSummary.textContent = state.showSidePanelAll ? "全時刻表示中" : "近い列車だけ表示";

    elements.nearInboundList.innerHTML = renderScheduleItems(futureInbound.slice(0, 1), "本日の上りはありません");
    elements.nearOutboundList.innerHTML = renderScheduleItems(futureOutbound.slice(0, 1), "本日の下りはありません");

    elements.toggleSidePanelAll.textContent = state.showSidePanelAll ? "次の1本に戻す" : "全時刻を見る";

    if (state.showSidePanelAll) {
      elements.sideAllSection.hidden = false;
      elements.sideAllList.innerHTML = renderTimetableItems(allEvents);
    } else {
      elements.sideAllSection.hidden = true;
      elements.sideAllList.innerHTML = "";
    }

    elements.toggleAllButton.disabled = false;
    elements.toggleAllButton.textContent = state.showAllPassages ? "近い列車だけに戻す" : "今日のぜんぶを見る";

    if (state.showAllPassages) {
      elements.allPassagesSection.hidden = false;
      elements.allPassagesList.innerHTML = renderTimetableItems(allEvents);
    } else {
      elements.allPassagesSection.hidden = true;
      elements.allPassagesList.innerHTML = "";
    }

    elements.kmAdjuster.hidden = false;
    elements.kmInput.value = state.selectedPoint.km.toFixed(2);
    elements.kmAdjContext.textContent = buildKmContext(state.selectedPoint.km);
    syncLocationButtons();
  }

  function selectionMarkerMarkup() {
    if (!state.selectedPoint) {
      return "";
    }

    return buildLocationMarkerMarkup(state.selectedPoint, "selected");
  }

  function previewMarkerMarkup() {
    if (!state.dragPreview) {
      return "";
    }

    return buildLocationMarkerMarkup(state.dragPreview, "preview");
  }

  function trainMarkersMarkup() {
    return state.liveTrains.map(function (train) {
      var color = train.direction === "inbound" ? "#2d80ea" : "#ff8034";
      var baseAngle = Math.atan2(train.tangent.y, train.tangent.x) * 180 / Math.PI;
      var markerRotation = baseAngle + (train.direction === "inbound" ? 180 : 0);
      var title = train.atStation ? train.stationName + "に停車中" : train.section + "を走行中";
      return '' +
        '<g transform="translate(' + train.x.toFixed(2) + ' ' + train.y.toFixed(2) + ') rotate(' + markerRotation.toFixed(2) + ')" aria-label="' + title + '">' +
          '<title>' + title + '</title>' +
          '<circle r="34" fill="rgba(255,255,255,0.28)"></circle>' +
          '<path d="M -31 -19 L 6 -19 L 29 0 L 6 19 L -31 19 Z" fill="' + color + '" stroke="#ffffff" stroke-width="6" stroke-linejoin="round"></path>' +
          '<circle cx="-13" cy="0" r="5.2" fill="#ffffff"></circle>' +
          '<path d="M -1 -8 L 16 0 L -1 8 Z" fill="#ffffff"></path>' +
        '</g>';
    }).join('');
  }

  function stationMarkup() {
    return ROUTE_STATIONS.map(function (station, index, stations) {
      var visual = getStationVisual(station, index, stations);
      return '' +
        '<g>' +
          '<path d="' + visual.leaderPath + '" fill="none" stroke="#5a7ea0" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"></path>' +
          '<circle cx="' + station.x.toFixed(2) + '" cy="' + station.y.toFixed(2) + '" r="12" fill="' + visual.fill + '" stroke="#18324c" stroke-width="3"></circle>' +
          '<rect x="' + visual.nameBoxX.toFixed(2) + '" y="' + visual.nameBoxY.toFixed(2) + '" width="' + visual.nameWidth.toFixed(2) + '" height="' + visual.nameHeight.toFixed(2) + '" rx="18" fill="#ffffff" stroke="#18324c" stroke-width="2.8"></rect>' +
          '<text x="' + visual.textX.toFixed(2) + '" y="' + visual.nameY.toFixed(2) + '" text-anchor="start" fill="#18324c" font-size="' + visual.nameFontSize + '" font-weight="900">' + station.name + '</text>' +
          '<text x="' + visual.kmX.toFixed(2) + '" y="' + visual.stationKmY.toFixed(2) + '" text-anchor="start" fill="#5a718a" font-size="' + visual.kmFontSize + '" font-weight="800" stroke="#ffffff" stroke-width="6" paint-order="stroke fill" stroke-linejoin="round">' + station.km.toFixed(1) + ' km</text>' +
        '</g>';
    }).join('');
  }

  function crossingMarkup() {
    return CROSSINGS.map(function (crossing) {
      var marker = getCrossingMarkerPoint(crossing);
      return '' +
        '<g aria-label="' + crossing.name + '">' +
          '<title>' + crossing.name + '</title>' +
          '<g transform="translate(' + marker.x.toFixed(2) + ' ' + marker.y.toFixed(2) + ')">' +
            '<circle r="16" fill="rgba(255,255,255,0.74)"></circle>' +
            '<circle r="12" fill="#ffe57a" stroke="#18324c" stroke-width="2.6"></circle>' +
            '<path d="M -5 -5 L 5 5 M 5 -5 L -5 5" stroke="#18324c" stroke-width="2.6" stroke-linecap="round"></path>' +
            '<circle cx="-7.2" cy="6" r="3" fill="#ff6558" stroke="#18324c" stroke-width="1.5"></circle>' +
            '<circle cx="7.2" cy="6" r="3" fill="#ff6558" stroke="#18324c" stroke-width="1.5"></circle>' +
            '<rect x="-2.1" y="9" width="4.2" height="10.2" rx="1.8" fill="#18324c"></rect>' +
          '</g>' +
        '</g>';
    }).join('');
  }

  function renderMap() {
    var path = geometry.getRoutePath();

    elements.routeMap.innerHTML = '' +
      '<defs>' +
        '<filter id="routeGlow">' +
          '<feGaussianBlur stdDeviation="6" result="blur"></feGaussianBlur>' +
          '<feMerge>' +
            '<feMergeNode in="blur"></feMergeNode>' +
            '<feMergeNode in="SourceGraphic"></feMergeNode>' +
          '</feMerge>' +
        '</filter>' +
      '</defs>' +
      '<rect x="0" y="0" width="' + VIEWBOX.width + '" height="' + VIEWBOX.height + '" fill="transparent"></rect>' +
      '<path d="' + path + '" fill="none" stroke="#d8efff" stroke-width="36" stroke-linecap="round" stroke-linejoin="round"></path>' +
      '<path d="' + path + '" fill="none" stroke="#2369b3" stroke-width="14" stroke-linecap="round" stroke-linejoin="round" filter="url(#routeGlow)"></path>' +
      crossingMarkup() +
      stationMarkup() +
      previewMarkerMarkup() +
      selectionMarkerMarkup() +
      trainMarkersMarkup() +
      '<rect id="clickLayer" x="0" y="0" width="' + VIEWBOX.width + '" height="' + VIEWBOX.height + '" fill="transparent" style="cursor: pointer"></rect>';

    document.getElementById("clickLayer").addEventListener("click", handleMapClick);
  }

  function updateClock() {
    state.now = new Date();
    state.nowSeconds = state.now.getHours() * 3600 + state.now.getMinutes() * 60 + state.now.getSeconds();
    state.autoScheduleType = determineScheduleType(state.now);

    elements.clockValue.textContent = formatDisplayTime(state.now);
    elements.dateValue.textContent = formatDisplayDate(state.now);
    elements.autoModeLabel.textContent = schedule.getScheduleLabel(state.autoScheduleType);
    elements.activeModeLabel.textContent = schedule.getScheduleLabel(state.selectedScheduleType);
  }

  function updateLiveTrains() {
    state.liveTrains = schedule.getRunningTrains(state.selectedScheduleType, state.nowSeconds).map(function (train) {
      var point = geometry.kmToPoint(train.km);
      var shifted = offsetPointForDirection(point, train.km, train.direction);
      return Object.assign({}, train, {
        x: shifted.x,
        y: shifted.y,
        tangent: shifted.tangent
      });
    });

    elements.runningInboundCount.textContent = String(state.liveTrains.filter(function (train) {
      return train.direction === "inbound";
    }).length);
    elements.runningOutboundCount.textContent = String(state.liveTrains.filter(function (train) {
      return train.direction === "outbound";
    }).length);
    renderMap();
    updateSelectionPanel();
  }

  function handleMapClick(event) {
    var stationHit = findStationHit(event.clientX, event.clientY);
    var crossingHit = findCrossingHit(event.clientX, event.clientY);

    if (stationHit) {
      selectKm(stationHit.station.km);
      return;
    }

    if (crossingHit) {
      selectKm(crossingHit.crossing.km);
      return;
    }

    applyProjectedSelection(projectClientToRoute(event.clientX, event.clientY));
  }

  function applySelectedScheduleType(nextType) {
    state.selectedScheduleType = nextType;
    scheduleInputs.forEach(function (input) {
      input.checked = input.value === nextType;
    });
    updateClock();
    updateLiveTrains();
  }

  function initializeScheduleSelection() {
    applySelectedScheduleType(determineScheduleType(new Date()));
    scheduleInputs.forEach(function (input) {
      input.addEventListener("change", function () {
        applySelectedScheduleType(input.value);
      });
    });
  }

  function initializeButtons() {
    elements.resetSelectionButton.addEventListener("click", function () {
      state.selectedPoint = null;
      state.dragPreview = null;
      state.showAllPassages = false;
      state.showSidePanelAll = false;
      try { localStorage.removeItem(LS_KEY_KM); } catch (e) {}
      renderMap();
      updateSelectionPanel();
    });

    elements.toggleSidePanelAll.addEventListener("click", function () {
      if (!state.selectedPoint) {
        return;
      }
      state.showSidePanelAll = !state.showSidePanelAll;
      updateSelectionPanel();
    });

    elements.toggleAllButton.addEventListener("click", function () {
      if (!state.selectedPoint) {
        return;
      }
      state.showAllPassages = !state.showAllPassages;
      updateSelectionPanel();
    });
  }

  function initializeDrawer() {
    elements.menuToggle.addEventListener("click", function () {
      setDrawerOpen(!state.drawerOpen);
    });

    elements.drawerCloseButton.addEventListener("click", function () {
      setDrawerOpen(false);
    });

    elements.drawerBackdrop.addEventListener("click", function () {
      setDrawerOpen(false);
    });

    window.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && state.drawerOpen) {
        setDrawerOpen(false);
      }
    });
  }

  function initializeBottomSheetDrag() {
    var handle = elements.sheetHandleBar;
    if (!handle) { return; }

    var touchStartY = null;
    var pendingTouch = false;

    handle.addEventListener("touchstart", function (e) {
      touchStartY = e.touches[0].clientY;
      pendingTouch = true;
    }, { passive: true });

    handle.addEventListener("touchend", function (e) {
      if (touchStartY === null) { return; }
      var dy = e.changedTouches[0].clientY - touchStartY;
      touchStartY = null;
      if (dy > 25) { setSheetState("peek"); }
      else if (dy < -25) { setSheetState("full"); }
      else { setSheetState(state.sheetState === "full" ? "peek" : "full"); }
    }, { passive: true });

    handle.addEventListener("touchcancel", function () {
      touchStartY = null;
      pendingTouch = false;
    }, { passive: true });

    handle.addEventListener("click", function () {
      if (pendingTouch) {
        pendingTouch = false;
        return;
      }
      setSheetState(state.sheetState === "full" ? "peek" : "full");
    });

    handle.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        setSheetState(state.sheetState === "full" ? "peek" : "full");
      }
    });
  }

  function initializeLocationLists() {
    function handleLocationButton(event) {
      var button = event.target.closest("[data-location-km]");
      if (!button) {
        return;
      }

      selectKm(Number(button.getAttribute("data-location-km")));
      setDrawerOpen(false);
    }

    renderLocationLists();
    elements.stationList.addEventListener("click", handleLocationButton);
    elements.crossingList.addEventListener("click", handleLocationButton);
  }

  function updateDragPickerPosition(clientX, clientY) {
    elements.dragPicker.style.left = clientX + "px";
    elements.dragPicker.style.top = clientY + "px";
  }

  function updateDragPreview(clientX, clientY) {
    var mapRect = elements.routeMap.getBoundingClientRect();

    if (!isInsideRect(clientX, clientY, mapRect)) {
      if (state.dragPreview) {
        state.dragPreview = null;
        renderMap();
      }
      return;
    }

    var projected = projectClientToRoute(clientX, clientY);
    if (!state.dragPreview || Math.abs(state.dragPreview.km - projected.km) > 0.01) {
      state.dragPreview = {
        x: projected.x,
        y: projected.y,
        km: projected.km
      };
      renderMap();
    }
  }

  function stopPickerDrag(commitSelection) {
    if (!pickerDrag) {
      return;
    }

    var preview = state.dragPreview;
    window.removeEventListener("pointermove", handlePickerPointerMove);
    window.removeEventListener("pointerup", handlePickerPointerEnd);
    window.removeEventListener("pointercancel", handlePickerPointerEnd);
    elements.mapShell.classList.remove("is-targeting");
    elements.dragPickerDock.classList.remove("is-dragging");
    elements.dragPicker.classList.remove("is-dragging");
    elements.dragPicker.style.left = "";
    elements.dragPicker.style.top = "";
    pickerDrag = null;
    state.dragPreview = null;

    if (commitSelection && preview) {
      applyProjectedSelection(preview);
      return;
    }

    renderMap();
  }

  function handlePickerPointerMove(event) {
    if (!pickerDrag || event.pointerId !== pickerDrag.pointerId) {
      return;
    }

    event.preventDefault();
    updateDragPickerPosition(event.clientX, event.clientY);
    updateDragPreview(event.clientX, event.clientY);
  }

  function handlePickerPointerEnd(event) {
    if (!pickerDrag || event.pointerId !== pickerDrag.pointerId) {
      return;
    }

    event.preventDefault();
    stopPickerDrag(true);
  }

  function initializeDragPicker() {
    elements.dragPicker.addEventListener("pointerdown", function (event) {
      event.preventDefault();
      event.stopPropagation();
      pickerDrag = { pointerId: event.pointerId };
      elements.mapShell.classList.add("is-targeting");
      elements.dragPickerDock.classList.add("is-dragging");
      elements.dragPicker.classList.add("is-dragging");
      updateDragPickerPosition(event.clientX, event.clientY);
      updateDragPreview(event.clientX, event.clientY);
      window.addEventListener("pointermove", handlePickerPointerMove);
      window.addEventListener("pointerup", handlePickerPointerEnd);
      window.addEventListener("pointercancel", handlePickerPointerEnd);
    });
  }

  function initializeDemoSelection() {
    var demoKm = readDemoKmFromQuery();

    if (demoKm === null) {
      return;
    }

    var point = geometry.kmToPoint(demoKm);
    applyProjectedSelection({
      x: point.x,
      y: point.y,
      km: demoKm
    });
  }

  function initializeKmAdjuster() {
    var MIN_KM = ROUTE_STATIONS[0].km;
    var MAX_KM = ROUTE_STATIONS[ROUTE_STATIONS.length - 1].km;
    var STEP = 0.05;

    function adjustKm(delta) {
      if (!state.selectedPoint) { return; }
      var raw = Math.round((state.selectedPoint.km + delta) * 1000) / 1000;
      selectKm(Math.max(MIN_KM, Math.min(MAX_KM, raw)));
    }

    elements.kmMinus.addEventListener("click", function () { adjustKm(-STEP); });
    elements.kmPlus.addEventListener("click", function () { adjustKm(STEP); });

    elements.kmInput.addEventListener("change", function () {
      var value = parseFloat(elements.kmInput.value);
      if (!Number.isFinite(value)) { return; }
      selectKm(Math.max(MIN_KM, Math.min(MAX_KM, value)));
    });
  }

  function restoreFromLocalStorage() {
    try {
      var savedKm = localStorage.getItem(LS_KEY_KM);
      if (savedKm === null) { return; }
      var km = Number(savedKm);
      var minKm = ROUTE_STATIONS[0].km;
      var maxKm = ROUTE_STATIONS[ROUTE_STATIONS.length - 1].km;
      if (Number.isFinite(km) && km >= minKm && km <= maxKm) {
        selectKm(km);
      }
    } catch (e) {}
  }

  function initialize() {
    initializeScheduleSelection();
    initializeButtons();
    initializeDrawer();
    initializeBottomSheetDrag();
    initializeLocationLists();
    initializeDragPicker();
    initializeKmAdjuster();
    restoreFromLocalStorage();
    initializeDemoSelection();
    updateSelectionPanel();
    window.setInterval(updateClock, 1000);
    window.setInterval(updateLiveTrains, 3000);
  }

  initialize();
}());