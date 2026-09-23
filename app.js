/**
 * Taiwan Weather Forecast Web App
 * Frontend Application Logic (FastAPI + Leaflet + OpenStreetMap)
 */

// ── Configuration & Coordinates ─────────────────────────────────────────────
const COORDINATES = {
  "臺北市": [25.0330, 121.5654],
  "新北市": [25.0120, 121.4657],
  "桃園市": [24.9937, 121.3010],
  "臺中市": [24.1477, 120.6736],
  "臺南市": [22.9999, 120.2269],
  "高雄市": [22.6273, 120.3014],
  "基隆市": [25.1283, 121.7419],
  "新竹市": [24.8138, 120.9675],
  "嘉義市": [23.4800, 120.4491],
  "新竹縣": [24.7036, 121.1542],
  "苗栗縣": [24.5602, 120.8214],
  "彰化縣": [24.0518, 120.5161],
  "南投縣": [23.9609, 120.9718],
  "雲林縣": [23.7092, 120.4313],
  "嘉義縣": [23.4518, 120.2555],
  "屏東縣": [22.5519, 120.5487],
  "宜蘭縣": [24.7021, 121.7377],
  "花蓮縣": [23.9871, 121.6015],
  "臺東縣": [22.7972, 121.0710],
  "澎湖縣": [23.5711, 119.5793],
  "金門縣": [24.4493, 118.3767],
  "連江縣": [26.1605, 119.9497],
};

// ── Application State ───────────────────────────────────────────────────────
const state = {
  allRecords: [],
  locations: [],
  availableTimes: [],
  selectedLocation: "臺北市",
  selectedTime: null,
  map: null,
  markersLayer: null,
};

// ── Weather Utilities ───────────────────────────────────────────────────────
function weatherEmoji(wx) {
  const text = String(wx || "");
  if (text.includes("雷")) return "⛈️";
  if (text.includes("雨")) return "🌧️";
  if (text.includes("雪")) return "🌨️";
  if (text.includes("陰")) return "☁️";
  if (text.includes("多雲") || text.includes("雲")) return "⛅";
  if (text.includes("晴")) return "☀️";
  return "🌤️";
}

function friendlyPeriodLabel(dateStr) {
  if (!dateStr) return "預報時段";
  const date = new Date(dateStr.replace(/-/g, "/"));
  const now = new Date();

  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const targetDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.round((targetDay - today) / (1000 * 60 * 60 * 24));

  let dayLabel;
  if (diffDays === 0) {
    dayLabel = "今天";
  } else if (diffDays === 1) {
    dayLabel = "明天";
  } else if (diffDays === 2) {
    dayLabel = "後天";
  } else {
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    dayLabel = `${m}/${d}`;
  }

  const hour = date.getHours();
  let partLabel;
  if (hour < 12) {
    partLabel = "白天";
  } else if (hour < 18) {
    partLabel = "下午";
  } else {
    partLabel = "晚上";
  }

  return `${dayLabel}${partLabel}`;
}

function formatTime(dateStr) {
  if (!dateStr) return "";
  const date = new Date(dateStr.replace(/-/g, "/"));
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const h = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  return `${m}/${d} ${h}:${min}`;
}

function tempColor(maxT) {
  if (maxT === null || maxT === undefined || isNaN(maxT)) return "#95A5A6";
  if (maxT < 20) return "#2B7CD3"; // Cold: Blue
  if (maxT < 28) return "#27AE60"; // Mild: Green
  if (maxT < 33) return "#F39C12"; // Warm: Orange
  return "#E74C3C";               // Hot: Red
}

function buildTips(record) {
  const tips = [];
  if (!record) {
    return ["🌿 暫無氣象建議。"];
  }

  const minT = record.MinT;
  const maxT = record.MaxT;
  const pop = record.PoP;

  if (pop !== null && pop !== undefined && !isNaN(pop)) {
    if (pop >= 50) {
      tips.push("☂️ 降雨機率偏高，出門記得帶傘。");
    } else if (pop >= 30) {
      tips.push("🌂 有下雨可能，帶把折傘會比較安心。");
    }
  }

  if (minT !== null && maxT !== null && !isNaN(minT) && !isNaN(maxT)) {
    if (maxT - minT >= 8) {
      tips.push("🧥 早晚溫差較大，可以準備一件薄外套。");
    }
    if (maxT >= 30) {
      tips.push("🧴 白天偏熱，注意防曬與補充水分。");
    }
    if (minT < 16) {
      tips.push("🧣 氣溫偏低，建議增加保暖衣物。");
    }
  }

  if (tips.length === 0) {
    tips.push("🌿 天氣條件相對平穩，依個人行程準備即可。");
  }

  return tips;
}

// ── Leaflet Map Setup ───────────────────────────────────────────────────────
function initMap() {
  if (state.map) return;

  state.map = L.map("map", {
    center: [23.8, 121.0],
    zoom: 7,
    minZoom: 6,
    maxZoom: 14,
    scrollWheelZoom: true,
  });

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> contributors',
  }).addTo(state.map);

  state.markersLayer = L.layerGroup().addTo(state.map);
}

function renderMapMarkers() {
  if (!state.map || !state.markersLayer) return;
  state.markersLayer.clearLayers();

  if (!state.selectedTime) return;

  // Filter snapshot records for the current selected time
  const snapshotByLocation = {};
  for (const record of state.allRecords) {
    if (record.startTime === state.selectedTime) {
      snapshotByLocation[record.locationName] = record;
    }
  }

  let count = 0;
  for (const [name, coords] of Object.entries(COORDINATES)) {
    const record = snapshotByLocation[name];
    if (!record) continue;

    count++;
    const maxT = record.MaxT;
    const minT = record.MinT;
    const pop = record.PoP;
    const ci = record.CI || "—";
    const wx = record.Wx || "";
    const color = tempColor(maxT);

    const minTStr = (minT !== null && minT !== undefined && !isNaN(minT)) ? `${Math.round(minT)}°C` : "N/A";
    const maxTStr = (maxT !== null && maxT !== undefined && !isNaN(maxT)) ? `${Math.round(maxT)}°C` : "N/A";
    const popStr = (pop !== null && pop !== undefined && !isNaN(pop)) ? `${Math.round(pop)}%` : "N/A";
    const tempBadgeText = (maxT !== null && maxT !== undefined && !isNaN(maxT)) ? `${Math.round(maxT)}°` : "?";

    // Circle Marker
    const circle = L.circleMarker(coords, {
      radius: 13,
      color: color,
      weight: 2.5,
      fillColor: color,
      fillOpacity: 0.65,
    });

    // Temp Text Marker Overlay
    const textMarker = L.marker(coords, {
      icon: L.divIcon({
        className: "temp-map-marker",
        html: `<span>${tempBadgeText}</span>`,
        iconSize: [30, 20],
        iconAnchor: [15, 10],
      }),
    });

    // Popup Content
    const popupContent = `
      <div style="min-width: 175px;">
        <div class="popup-title">📍 ${name}</div>
        <hr class="popup-divider">
        <div>${weatherEmoji(wx)} <strong>${wx}</strong></div>
        <div style="margin-top: 3px;">🌡️ ${minTStr} – ${maxTStr}</div>
        <div>☔ 降雨機率：${popStr}</div>
        <div>🙂 舒適度：${ci}</div>
        <div style="color:#8DA7BD;font-size:0.75rem;margin-top:4px;">🕒 ${formatTime(record.startTime)}</div>
        <button class="popup-btn-select" onclick="window.selectLocationFromMap('${name}')">切換至此縣市</button>
      </div>
    `;

    circle.bindPopup(popupContent, { maxWidth: 260 });
    circle.bindTooltip(`${name}｜${wx} ${tempBadgeText}`, { direction: "top", offset: [0, -10] });

    // Click handler to select location
    circle.on("click", () => {
      selectLocation(name);
    });

    circle.addTo(state.markersLayer);
    textMarker.addTo(state.markersLayer);
  }

  const markerStatus = document.getElementById("marker-status-text");
  if (markerStatus) {
    markerStatus.textContent = `目前顯示 ${count} 個縣市標記`;
  }
}

// Global hook for popup button click
window.selectLocationFromMap = function(locationName) {
  selectLocation(locationName);
  if (state.map) {
    state.map.closePopup();
  }
};

// ── UI Rendering ────────────────────────────────────────────────────────────
function renderControls() {
  const selectElem = document.getElementById("location-select");
  const tabsElem = document.getElementById("period-tabs");

  // Populate Location Dropdown
  selectElem.innerHTML = "";
  for (const loc of state.locations) {
    const opt = document.createElement("option");
    opt.value = loc;
    opt.textContent = `📍 ${loc}`;
    if (loc === state.selectedLocation) {
      opt.selected = true;
    }
    selectElem.appendChild(opt);
  }

  // Populate Period Tabs
  tabsElem.innerHTML = "";
  for (const timeStr of state.availableTimes) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `period-btn ${timeStr === state.selectedTime ? "active" : ""}`;
    btn.setAttribute("role", "tab");
    btn.setAttribute("aria-selected", timeStr === state.selectedTime ? "true" : "false");

    const label = friendlyPeriodLabel(timeStr);
    const sub = formatTime(timeStr);

    btn.innerHTML = `
      <span>${label}</span>
      <span class="period-time-sub">${sub}</span>
    `;

    btn.addEventListener("click", () => {
      state.selectedTime = timeStr;
      renderControls();
      renderMapMarkers();
      renderRegionDetails();
      renderDetailedTable();
    });

    tabsElem.appendChild(btn);
  }
}

function renderRegionDetails() {
  const locNameElem = document.getElementById("current-location-name");
  const weatherBadge = document.getElementById("current-weather-badge");
  const weatherIcon = document.getElementById("current-weather-icon");
  const weatherText = document.getElementById("current-weather-text");
  const metricTemp = document.getElementById("metric-temp");
  const metricPop = document.getElementById("metric-pop");
  const metricPopPill = document.getElementById("metric-pop-pill");
  const metricCi = document.getElementById("metric-ci");
  const tipsContainer = document.getElementById("tips-container");
  const activePeriodElem = document.getElementById("active-period-label");
  const cardsTitle = document.getElementById("forecast-cards-title");

  locNameElem.textContent = `📍 ${state.selectedLocation}`;
  cardsTitle.textContent = `🗓️ ${state.selectedLocation} 36 小時預報`;

  // Find records for this location
  const locRecords = state.allRecords.filter(r => r.locationName === state.selectedLocation);

  // Find matching period record
  let currentRecord = locRecords.find(r => r.startTime === state.selectedTime);
  if (!currentRecord && locRecords.length > 0) {
    currentRecord = locRecords[0];
  }

  if (currentRecord) {
    const wx = currentRecord.Wx || "晴時多雲";
    const icon = weatherEmoji(wx);
    weatherIcon.textContent = icon;
    weatherText.textContent = wx;

    const minT = currentRecord.MinT !== null ? Math.round(currentRecord.MinT) : "—";
    const maxT = currentRecord.MaxT !== null ? Math.round(currentRecord.MaxT) : "—";
    metricTemp.textContent = `${minT}–${maxT}°C`;

    const pop = currentRecord.PoP !== null && !isNaN(currentRecord.PoP) ? `${Math.round(currentRecord.PoP)}%` : "—";
    metricPop.textContent = pop;
    metricPopPill.textContent = `☔ 降雨機率 ${pop}`;

    const ci = currentRecord.CI && currentRecord.CI.trim() ? currentRecord.CI : "舒適";
    metricCi.textContent = ci;

    // Build tips
    const tips = buildTips(currentRecord);
    tipsContainer.innerHTML = tips.map(t => `<div class="tip-line">${t}</div>`).join("");

    const periodFriendly = friendlyPeriodLabel(currentRecord.startTime);
    const periodTime = formatTime(currentRecord.startTime);
    activePeriodElem.textContent = `${periodFriendly} (${periodTime})`;
  } else {
    metricTemp.textContent = "--°C";
    metricPop.textContent = "--%";
    metricCi.textContent = "--";
    tipsContainer.innerHTML = `<div class="tip-line">查無此縣市預報資料。</div>`;
  }

  // Render the 3 Period Forecast Cards
  renderThreePeriodCards(locRecords);
}

function renderThreePeriodCards(records) {
  const container = document.getElementById("three-period-cards");
  container.innerHTML = "";

  if (!records || records.length === 0) {
    container.innerHTML = "<p>無可用預報時段</p>";
    return;
  }

  // Sort by startTime
  const sorted = [...records].sort((a, b) => a.startTime.localeCompare(b.startTime)).slice(0, 3);

  sorted.forEach(record => {
    const card = document.createElement("div");
    const isActive = record.startTime === state.selectedTime;
    card.className = `forecast-period-card ${isActive ? "is-active" : ""}`;

    const title = friendlyPeriodLabel(record.startTime);
    const timeFormatted = formatTime(record.startTime);
    const icon = weatherEmoji(record.Wx);
    const minT = record.MinT !== null ? Math.round(record.MinT) : "—";
    const maxT = record.MaxT !== null ? Math.round(record.MaxT) : "—";
    const pop = record.PoP !== null && !isNaN(record.PoP) ? `${Math.round(record.PoP)}%` : "—";

    card.innerHTML = `
      <div class="fpc-header">
        <div class="fpc-title">${title}</div>
        <div class="fpc-time">${timeFormatted}</div>
      </div>
      <div class="fpc-body">
        <div class="fpc-temp-wrap">
          <span class="fpc-icon">${icon}</span>
          <span class="fpc-temp">${minT}–${maxT}°C</span>
        </div>
        <span class="pill-rain">☔ ${pop}</span>
      </div>
      <div class="fpc-footer">
        <div class="fpc-desc" title="${record.Wx || ''}">${record.Wx || ''}</div>
        <div style="font-size:0.78rem;color:#66839A;">${record.CI || ''}</div>
      </div>
    `;

    card.style.cursor = "pointer";
    card.addEventListener("click", () => {
      state.selectedTime = record.startTime;
      renderControls();
      renderMapMarkers();
      renderRegionDetails();
      renderDetailedTable();
    });

    container.appendChild(card);
  });
}

function renderDetailedTable() {
  const tbody = document.getElementById("forecast-table-body");
  const locRecords = state.allRecords.filter(r => r.locationName === state.selectedLocation);

  if (locRecords.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="table-loading">查無資料</td></tr>`;
    return;
  }

  const sorted = [...locRecords].sort((a, b) => a.startTime.localeCompare(b.startTime));

  tbody.innerHTML = sorted.map(row => {
    const label = friendlyPeriodLabel(row.startTime);
    const timeFormatted = formatTime(row.startTime);
    const icon = weatherEmoji(row.Wx);
    const minT = row.MinT !== null ? Math.round(row.MinT) : "—";
    const maxT = row.MaxT !== null ? Math.round(row.MaxT) : "—";
    const pop = row.PoP !== null && !isNaN(row.PoP) ? `${Math.round(row.PoP)}%` : "—";
    const ci = row.CI && row.CI.trim() ? row.CI : "—";

    return `
      <tr>
        <td>
          <strong>${label}</strong><br>
          <span style="color:#8DA7BD;font-size:0.8rem;">${timeFormatted}</span>
        </td>
        <td>
          <span class="pill-weather">${icon} ${row.Wx || ''}</span>
        </td>
        <td><strong>${minT}–${maxT}°C</strong></td>
        <td><span class="pill-rain">☔ ${pop}</span></td>
        <td>${ci}</td>
      </tr>
    `;
  }).join("");
}

function selectLocation(locName) {
  if (!state.locations.includes(locName)) return;
  state.selectedLocation = locName;

  const selectElem = document.getElementById("location-select");
  if (selectElem) {
    selectElem.value = locName;
  }

  renderRegionDetails();
  renderDetailedTable();
}

function showStatusBanner(message, type = "info") {
  const banner = document.getElementById("status-banner");
  banner.className = `status-banner ${type}`;
  banner.textContent = message;
  banner.classList.remove("hidden");

  if (type !== "error") {
    setTimeout(() => {
      banner.classList.add("hidden");
    }, 4000);
  }
}

// ── Data Fetching ───────────────────────────────────────────────────────────
async function fetchWeather() {
  const refreshBtn = document.getElementById("refresh-btn");
  const lastUpdated = document.getElementById("last-updated");

  if (refreshBtn) refreshBtn.classList.add("loading");
  showStatusBanner("正在取得最新 CWA 天氣資料...", "info");

  try {
    const res = await fetch("/api/weather");
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.detail || `HTTP ${res.status}: ${res.statusText}`);
    }

    const payload = await res.json();
    const data = payload.data || [];

    if (!Array.isArray(data) || data.length === 0) {
      throw new Error("API 未傳回任何預報紀錄。");
    }

    state.allRecords = data;

    // Unique locations
    const locSet = new Set();
    data.forEach(r => { if (r.locationName) locSet.add(r.locationName); });
    state.locations = Array.from(locSet).sort((a, b) => a.localeCompare(b, "zh-Hant"));

    // Unique time periods
    const timeSet = new Set();
    data.forEach(r => { if (r.startTime) timeSet.add(r.startTime); });
    state.availableTimes = Array.from(timeSet).sort();

    // Default selection
    if (!state.locations.includes(state.selectedLocation) && state.locations.length > 0) {
      state.selectedLocation = state.locations[0];
    }

    if (!state.selectedTime || !state.availableTimes.includes(state.selectedTime)) {
      state.selectedTime = state.availableTimes[0];
    }

    // Update last updated badge
    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}`;
    if (lastUpdated) lastUpdated.textContent = `已更新：${timeStr}`;

    const totalRecords = document.getElementById("total-records-count");
    if (totalRecords) totalRecords.textContent = `目前系統共有 ${data.length} 筆最新預報紀錄`;

    // Render components
    renderControls();
    renderMapMarkers();
    renderRegionDetails();
    renderDetailedTable();

    showStatusBanner(`已同步 ${data.length} 筆最新預報資料。`, "info");
  } catch (err) {
    console.error("Fetch weather failed:", err);
    showStatusBanner(`無法取得氣象資料：${err.message}`, "error");
  } finally {
    if (refreshBtn) refreshBtn.classList.remove("loading");
  }
}

// ── Initialization ──────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  initMap();

  // Location selector change event
  const selectElem = document.getElementById("location-select");
  if (selectElem) {
    selectElem.addEventListener("change", (e) => {
      selectLocation(e.target.value);
    });
  }

  // Refresh button event
  const refreshBtn = document.getElementById("refresh-btn");
  if (refreshBtn) {
    refreshBtn.addEventListener("click", () => {
      fetchWeather();
    });
  }

  // Initial fetch
  fetchWeather();
});
