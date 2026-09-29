/**
 * ==============================================================================
 * SMART ELECTRICAL POWER MONITORING SYSTEM
 * Main Dashboard Controller & Real-Time Telemetry Pipeline
 * ==============================================================================
 */

(function () {
  // Master consolidated state: retains all fields so partial updates never blank out other cards
  const currentTelemetry = {
    voltage: null,
    current: null,
    realPower: null,
    apparentPower: null,
    powerFactor: null,
    normalPF: 0.133,
    pfLowLimit: 0.000,
    pfHighLimit: 0.283,
    timestamp: Date.now(),
    relayStatus: "ON",
    machineStatus: "NORMAL",
    connection: "ONLINE",
    deviceName: "ESP32 PF Protection",
    wifiRSSI: -58
  };

  let previousRealPower = null;
  let esp32WatchdogTimer = null;
  const ESP32_TIMEOUT_MS = 15000; // 15 seconds without data marks ESP32 offline
  const recentReadingsList = [];
  const MAX_TABLE_ROWS = 25;
  let lastTableRowTimestamp = 0;

  /**
   * Safe Number Formatter
   * Never returns NaN or undefined. Returns fallback (default: '--')
   */
  function formatVal(val, decimals = 2, fallback = "--") {
    if (val === null || val === undefined || val === "") return fallback;
    const num = Number(val);
    if (isNaN(num)) return fallback;
    return num.toFixed(decimals);
  }

  function formatTime(timestamp) {
    if (!timestamp) return "--:--:--";
    const date = new Date(timestamp);
    return date.toLocaleTimeString("en-US", { hour12: false });
  }

  /**
   * Update all 6 Main KPI Cards in unison
   */
  function updateKpiCards(data) {
    if (!data) return;

    // 1. Voltage RMS
    const vEl = document.getElementById("kpi-voltage");
    if (vEl) vEl.textContent = formatVal(data.voltage, 2);

    // 2. Current RMS
    const iEl = document.getElementById("kpi-current");
    if (iEl) iEl.textContent = formatVal(data.current, 3);

    // 3. Real Power
    const pEl = document.getElementById("kpi-real-power");
    if (pEl) pEl.textContent = formatVal(data.realPower, 2);

    // 4. Apparent Power
    const sEl = document.getElementById("kpi-apparent-power");
    if (sEl) sEl.textContent = formatVal(data.apparentPower, 2);

    // 5. Power Factor
    const pfEl = document.getElementById("kpi-power-factor");
    if (pfEl) pfEl.textContent = formatVal(data.powerFactor, 3);

    // 6. Normal PF
    const npfEl = document.getElementById("kpi-normal-pf");
    if (npfEl) npfEl.textContent = formatVal(data.normalPF, 3);
  }

  /**
   * Update Power Factor Analysis Section & Radial Gauge
   */
  function updatePowerFactorSection(data) {
    if (!data) return "WAITING";

    const pf = data.powerFactor !== null && !isNaN(Number(data.powerFactor)) ? Number(data.powerFactor) : null;
    const normalPf = data.normalPF !== null && !isNaN(Number(data.normalPF)) ? Number(data.normalPF) : 0.133;
    const pfLow = data.pfLowLimit !== null && !isNaN(Number(data.pfLowLimit)) ? Number(data.pfLowLimit) : 0.000;
    const pfHigh = data.pfHighLimit !== null && !isNaN(Number(data.pfHighLimit)) ? Number(data.pfHighLimit) : 0.283;

    // Display values
    const pfValEl = document.getElementById("pf-current-val");
    const pfNormEl = document.getElementById("pf-normal-val");
    const pfRangeEl = document.getElementById("pf-range-val");
    const pfStatusBadge = document.getElementById("pf-status-badge");

    if (pfValEl) pfValEl.textContent = formatVal(pf, 3);
    if (pfNormEl) pfNormEl.textContent = formatVal(normalPf, 3);
    if (pfRangeEl) pfRangeEl.textContent = `${formatVal(pfLow, 3)} — ${formatVal(pfHigh, 3)}`;

    // Status Evaluation
    let status = "NORMAL";
    let statusClass = "badge-success";
    let statusText = "NORMAL";

    if (pf === null || isNaN(pf)) {
      status = "--";
      statusClass = "badge-neutral";
      statusText = "WAITING";
    } else if (pf < pfLow) {
      status = "LOW";
      statusClass = "badge-warning";
      statusText = "LOW PF";
    } else if (pf > pfHigh) {
      status = "HIGH";
      statusClass = "badge-warning";
      statusText = "HIGH PF";
    } else {
      status = "NORMAL";
      statusClass = "badge-success";
      statusText = "NORMAL";
    }

    if (pfStatusBadge) {
      pfStatusBadge.className = `status-badge ${statusClass}`;
      pfStatusBadge.innerHTML = `<span class="badge-dot"></span> ${statusText}`;
    }

    // Update Visual Gauge Needle & Arc
    updatePfGauge(pf, pfLow, pfHigh);

    return status;
  }

  /**
   * Update the SVG Power Factor Semi-circle Gauge
   */
  function updatePfGauge(pf, lowLimit = 0.0, highLimit = 0.283) {
    const needle = document.getElementById("pf-gauge-needle");
    const progressArc = document.getElementById("pf-gauge-progress");
    const gaugeValueLabel = document.getElementById("pf-gauge-label");

    if (!needle && !progressArc) return;

    if (pf === null || isNaN(pf)) {
      if (needle) needle.style.transform = "rotate(-90deg)";
      if (progressArc) progressArc.style.strokeDashoffset = "283";
      if (gaugeValueLabel) gaugeValueLabel.textContent = "--";
      return;
    }

    // Gauge range: 0.000 to max (say 0.350 or highLimit * 1.25)
    const maxScale = Math.max(0.35, (highLimit || 0.283) * 1.25);
    const clampedPf = Math.max(0, Math.min(maxScale, pf));
    const ratio = clampedPf / maxScale; // 0 to 1

    // Angle: -90deg (left) to +90deg (right) = 180deg total sweep
    const angle = -90 + ratio * 180;

    if (needle) {
      needle.style.transform = `rotate(${angle}deg)`;
    }

    // Stroke circumference for radius 90 semi-circle = PI * 90 ≈ 283
    if (progressArc) {
      const circumference = 283;
      const offset = circumference - ratio * circumference;
      progressArc.style.strokeDashoffset = offset;

      // Color code arc based on status
      if (pf < lowLimit || pf > highLimit) {
        progressArc.style.stroke = "var(--color-warning)";
      } else {
        progressArc.style.stroke = "var(--color-success)";
      }
    }

    if (gaugeValueLabel) {
      gaugeValueLabel.textContent = pf.toFixed(3);
    }
  }

  /**
   * Update Real Power Analysis & Trend Indicator
   */
  function updateRealPowerAnalysis(data) {
    if (!data) return;

    const currentP = data.realPower !== null && !isNaN(Number(data.realPower)) ? Number(data.realPower) : null;
    const pEl = document.getElementById("analysis-real-power");
    const vEl = document.getElementById("analysis-voltage");
    const iEl = document.getElementById("analysis-current");
    const pfEl = document.getElementById("analysis-power-factor");
    const trendEl = document.getElementById("analysis-power-trend");

    if (pEl) pEl.textContent = formatVal(currentP, 2);
    if (vEl) vEl.textContent = formatVal(data.voltage, 2) + " V";
    if (iEl) iEl.textContent = formatVal(data.current, 3) + " A";
    if (pfEl) pfEl.textContent = formatVal(data.powerFactor, 3);

    // Trend calculation
    if (trendEl && currentP !== null) {
      if (previousRealPower === null) {
        trendEl.innerHTML = `<span class="text-slate-400">Baseline established</span>`;
      } else {
        const diff = currentP - previousRealPower;
        const pct = previousRealPower > 0 ? (diff / previousRealPower) * 100 : 0;

        if (Math.abs(diff) < 0.02) {
          trendEl.innerHTML = `<span class="trend-steady"><i data-lucide="minus"></i> Steady (${currentP.toFixed(2)} W)</span>`;
        } else if (diff > 0) {
          trendEl.innerHTML = `<span class="trend-up"><i data-lucide="trending-up"></i> +${pct.toFixed(1)}% (+${diff.toFixed(2)} W)</span>`;
        } else {
          trendEl.innerHTML = `<span class="trend-down"><i data-lucide="trending-down"></i> ${pct.toFixed(1)}% (${diff.toFixed(2)} W)</span>`;
        }
        if (window.lucide && window.lucide.createIcons) {
          window.lucide.createIcons();
        }
      }
      previousRealPower = currentP;
    }
  }

  /**
   * Update Apparent vs Real Power metrics
   */
  function updateApparentVsReal(data) {
    if (!data) return;

    const rp = Number(data.realPower) || 0;
    const ap = Number(data.apparentPower) || 0;

    const rpEl = document.getElementById("compare-real-power-val");
    const apEl = document.getElementById("compare-apparent-power-val");
    const reactiveEl = document.getElementById("compare-reactive-power-val");
    const efficiencyEl = document.getElementById("compare-efficiency-val");

    if (rpEl) rpEl.textContent = `${formatVal(rp, 2)} W`;
    if (apEl) apEl.textContent = `${formatVal(ap, 2)} VA`;

    // Reactive Power: Q = sqrt(S^2 - P^2)
    const varValue = ap >= rp ? Math.sqrt(Math.max(0, ap * ap - rp * rp)) : 0;
    if (reactiveEl) reactiveEl.textContent = `${formatVal(varValue, 2)} VAR`;

    // Efficiency: Real / Apparent * 100%
    const eff = ap > 0 ? Math.min(100, (rp / ap) * 100) : 0;
    if (efficiencyEl) efficiencyEl.textContent = `${formatVal(eff, 1)}%`;
  }

  /**
   * Update Recent Readings Table with timestamp throttling
   */
  function addRecentReadingRow(data, pfStatus) {
    if (!data) return;

    const tbody = document.getElementById("recent-readings-tbody");
    if (!tbody) return;

    const rowTime = data.timestamp || Date.now();
    // Throttle duplicate rows within 800ms
    if (Math.abs(rowTime - lastTableRowTimestamp) < 800) {
      return;
    }
    lastTableRowTimestamp = rowTime;

    const timeStr = formatTime(rowTime);
    const vStr = formatVal(data.voltage, 2);
    const iStr = formatVal(data.current, 3);
    const rpStr = formatVal(data.realPower, 2);
    const apStr = formatVal(data.apparentPower, 2);
    const pfStr = formatVal(data.powerFactor, 3);

    let badgeClass = "badge-success";
    if (pfStatus === "LOW" || pfStatus === "HIGH") {
      badgeClass = "badge-warning";
    } else if (pfStatus === "--" || pfStatus === "WAITING") {
      badgeClass = "badge-neutral";
    }

    const row = {
      timeStr,
      vStr,
      iStr,
      rpStr,
      apStr,
      pfStr,
      pfStatus: pfStatus || "NORMAL",
      badgeClass
    };

    recentReadingsList.unshift(row);
    if (recentReadingsList.length > MAX_TABLE_ROWS) {
      recentReadingsList.pop();
    }

    // Render table rows
    let html = "";
    recentReadingsList.forEach((r) => {
      html += `
        <tr>
          <td class="font-mono text-slate-300 font-medium">${r.timeStr}</td>
          <td>${r.vStr} <span class="text-xs text-slate-500">V</span></td>
          <td>${r.iStr} <span class="text-xs text-slate-500">A</span></td>
          <td>${r.rpStr} <span class="text-xs text-slate-500">W</span></td>
          <td>${r.apStr} <span class="text-xs text-slate-500">VA</span></td>
          <td class="font-mono">${r.pfStr}</td>
          <td><span class="status-badge ${r.badgeClass}"><span class="badge-dot"></span>${r.pfStatus}</span></td>
        </tr>
      `;
    });

    tbody.innerHTML = html;
  }

  /**
   * Watchdog to detect ESP32 Offline status
   */
  function resetWatchdogTimer() {
    clearTimeout(esp32WatchdogTimer);
    setEsp32Status(true);

    esp32WatchdogTimer = setTimeout(() => {
      setEsp32Status(false);
      if (window.AlertManager) {
        window.AlertManager.add({
          title: "DEVICE OFFLINE",
          message: "No heartbeat or telemetry received from ESP32 for over 15 seconds.",
          severity: "warning",
          source: "system"
        });
      }
    }, ESP32_TIMEOUT_MS);
  }

  function setEsp32Status(isOnline) {
    const badge = document.getElementById("esp32-status-badge");
    const text = document.getElementById("esp32-status-text");
    const sysEsp32 = document.getElementById("sys-esp32-status");

    if (badge && text) {
      if (isOnline) {
        badge.className = "header-status-badge status-online";
        text.textContent = "ESP32 ONLINE";
      } else {
        badge.className = "header-status-badge status-offline";
        text.textContent = "ESP32 OFFLINE";
      }
    }

    if (sysEsp32) {
      sysEsp32.className = `status-badge ${isOnline ? "badge-success" : "badge-critical"}`;
      sysEsp32.innerHTML = `<span class="badge-dot"></span> ${isOnline ? "ONLINE" : "OFFLINE"}`;
    }
  }

  function setFirebaseStatus(isConnected, message = "") {
    const badge = document.getElementById("firebase-status-badge");
    const text = document.getElementById("firebase-status-text");
    const sysFb = document.getElementById("sys-firebase-status");

    if (badge && text) {
      if (isConnected) {
        badge.className = "header-status-badge status-connected";
        text.textContent = "Firebase Connected";
      } else {
        badge.className = "header-status-badge status-disconnected";
        text.textContent = message || "Firebase Disconnected";
      }
    }

    if (sysFb) {
      sysFb.className = `status-badge ${isConnected ? "badge-success" : "badge-critical"}`;
      sysFb.innerHTML = `<span class="badge-dot"></span> ${isConnected ? "CONNECTED" : "DISCONNECTED"}`;
    }
  }

  function setLastUpdated(timestamp = Date.now()) {
    const timeStr = formatTime(timestamp);
    const hdrEl = document.getElementById("last-updated-text");
    const sysEl = document.getElementById("sys-last-data");

    if (hdrEl) hdrEl.textContent = `Last Updated: ${timeStr}`;
    if (sysEl) sysEl.textContent = timeStr;
  }

  /**
   * Consolidated Telemetry Normalizer:
   * Merges incoming packet into currentTelemetry master state so all parameters stay in sync
   */
  function normalizeData(raw) {
    if (!raw || typeof raw !== "object") return currentTelemetry;

    const item = raw.realtime || raw.IndustrialMachine || raw;

    // Voltage
    if (item.voltage !== undefined && item.voltage !== null && !isNaN(Number(item.voltage))) {
      currentTelemetry.voltage = Number(item.voltage);
    } else if (item.v !== undefined && item.v !== null && !isNaN(Number(item.v))) {
      currentTelemetry.voltage = Number(item.v);
    }

    // Current
    if (item.current !== undefined && item.current !== null && !isNaN(Number(item.current))) {
      currentTelemetry.current = Number(item.current);
    } else if (item.i !== undefined && item.i !== null && !isNaN(Number(item.i))) {
      currentTelemetry.current = Number(item.i);
    }

    // Real Power (ESP32 writes 'power', standard schema uses 'realPower')
    if (item.realPower !== undefined && item.realPower !== null && !isNaN(Number(item.realPower))) {
      currentTelemetry.realPower = Number(item.realPower);
    } else if (item.power !== undefined && item.power !== null && !isNaN(Number(item.power))) {
      currentTelemetry.realPower = Number(item.power);
    } else if (item.p !== undefined && item.p !== null && !isNaN(Number(item.p))) {
      currentTelemetry.realPower = Number(item.p);
    }

    // Apparent Power (auto-derive V*I if missing)
    if (item.apparentPower !== undefined && item.apparentPower !== null && !isNaN(Number(item.apparentPower))) {
      currentTelemetry.apparentPower = Number(item.apparentPower);
    } else if (item.s !== undefined && item.s !== null && !isNaN(Number(item.s))) {
      currentTelemetry.apparentPower = Number(item.s);
    } else if (currentTelemetry.voltage !== null && currentTelemetry.current !== null) {
      currentTelemetry.apparentPower = currentTelemetry.voltage * currentTelemetry.current;
    }

    // Power Factor (auto-derive P/S if missing)
    if (item.powerFactor !== undefined && item.powerFactor !== null && !isNaN(Number(item.powerFactor))) {
      currentTelemetry.powerFactor = Number(item.powerFactor);
    } else if (item.pf !== undefined && item.pf !== null && !isNaN(Number(item.pf))) {
      currentTelemetry.powerFactor = Number(item.pf);
    } else if (currentTelemetry.realPower !== null && currentTelemetry.apparentPower && currentTelemetry.apparentPower > 0) {
      currentTelemetry.powerFactor = Math.min(1.0, currentTelemetry.realPower / currentTelemetry.apparentPower);
    }

    // Normal PF and Threshold Limits
    if (item.normalPF !== undefined && item.normalPF !== null && !isNaN(Number(item.normalPF))) {
      currentTelemetry.normalPF = Number(item.normalPF);
    }
    if (item.pfLowLimit !== undefined && item.pfLowLimit !== null && !isNaN(Number(item.pfLowLimit))) {
      currentTelemetry.pfLowLimit = Number(item.pfLowLimit);
    }
    if (item.pfHighLimit !== undefined && item.pfHighLimit !== null && !isNaN(Number(item.pfHighLimit))) {
      currentTelemetry.pfHighLimit = Number(item.pfHighLimit);
    }

    // Relay Status
    if (item.relayStatus !== undefined && item.relayStatus !== null) {
      currentTelemetry.relayStatus = String(item.relayStatus).toUpperCase();
    }

    // Machine Operation Status
    if (item.machineStatus !== undefined && item.machineStatus !== null) {
      currentTelemetry.machineStatus = String(item.machineStatus).toUpperCase();
    }

    // Connection Status
    if (item.connection !== undefined && item.connection !== null) {
      currentTelemetry.connection = String(item.connection).toUpperCase();
    }

    // Device Metadata
    if (item.deviceName) {
      currentTelemetry.deviceName = item.deviceName;
    }
    if (item.wifiRSSI !== undefined && item.wifiRSSI !== null) {
      currentTelemetry.wifiRSSI = item.wifiRSSI;
    }

    // Timestamp: Always keep fresh local epoch
    let ts = item.timestamp || item.lastUpdated;
    if (typeof ts === "string") {
      const parsed = Date.parse(ts);
      ts = isNaN(parsed) ? Date.now() : parsed;
    } else if (typeof ts !== "number" || ts < 1700000000000) {
      // Handles ESP32 millis() like 93470
      ts = Date.now();
    }
    currentTelemetry.timestamp = ts;

    return { ...currentTelemetry };
  }

  /**
   * Main Real-time telemetry ingress handler
   * Called by Firebase WebSocket listener and direct REST fetch
   */
  function handleRealtimeData(raw) {
    if (!raw) return;

    const data = normalizeData(raw);

    // 1. Reset Watchdog & Record Last Received
    resetWatchdogTimer();
    setLastUpdated(data.timestamp);

    // 2. Mark Firebase & ESP32 as active
    setFirebaseStatus(true, "Firebase Connected");
    if (data.connection === "ONLINE") {
      setEsp32Status(true);
    }

    // 3. Update All 6 KPI Cards simultaneously
    updateKpiCards(data);

    // 4. Update Power Factor Section & Gauge
    const pfStatus = updatePowerFactorSection(data);

    // 5. Update Real Power Section & Trend
    updateRealPowerAnalysis(data);

    // 6. Update Apparent vs Real Power Section
    updateApparentVsReal(data);

    // 7. Update Recent Readings Table
    addRecentReadingRow(data, pfStatus);

    // 8. Push to Live Streaming Charts
    if (window.ChartManager) {
      window.ChartManager.addPoint(data);
    }

    // 9. Update Hardware & System Status Grid
    const devEl = document.getElementById("sys-device-name");
    if (devEl) {
      devEl.textContent = data.deviceName || "ESP32 Industrial Power Monitor";
    }

    const wifiEl = document.getElementById("sys-wifi-status");
    if (wifiEl) {
      const rssi = data.wifiRSSI;
      if (rssi !== undefined && rssi !== null) {
        wifiEl.innerHTML = `<span class="badge-dot"></span> CONNECTED (${rssi} dBm)`;
        wifiEl.className = "status-badge badge-success";
      } else {
        wifiEl.innerHTML = `<span class="badge-dot"></span> CONNECTED`;
        wifiEl.className = "status-badge badge-success";
      }
    }

    const machineStatusEl = document.getElementById("sys-machine-status");
    if (machineStatusEl) {
      if (data.machineStatus === "FAULT") {
        machineStatusEl.className = "status-badge badge-critical";
        machineStatusEl.innerHTML = `<span class="badge-dot"></span> FAULT`;
      } else {
        machineStatusEl.className = "status-badge badge-success";
        machineStatusEl.innerHTML = `<span class="badge-dot"></span> NORMAL`;
      }
    }

    const relayStatusEl = document.getElementById("sys-relay-status");
    if (relayStatusEl) {
      if (data.relayStatus === "OFF" || data.relayStatus === "TRIPPED") {
        relayStatusEl.className = "status-badge badge-critical";
        relayStatusEl.innerHTML = `<span class="badge-dot"></span> TRIPPED (OFF)`;
      } else {
        relayStatusEl.className = "status-badge badge-success";
        relayStatusEl.innerHTML = `<span class="badge-dot"></span> ACTIVE (ON)`;
      }
    }

    // 10. Evaluate parameter limits for Alerts
    if (window.AlertManager) {
      window.AlertManager.evaluate(data);

      if (data.machineStatus === "FAULT") {
        window.AlertManager.add({
          title: "PF ABNORMAL - MACHINE FAULT",
          message: `Abnormal power factor detected by ESP32 protection system. Relay is ${data.relayStatus || "OFF"}.`,
          severity: "critical",
          source: "telemetry"
        });
      }
    }
  }

  /**
   * System node listener handler (powerMonitoring/system/)
   */
  function handleSystemData(systemData) {
    if (!systemData) return;

    if (systemData.online !== undefined) {
      setEsp32Status(systemData.online);
    }

    const wifiEl = document.getElementById("sys-wifi-status");
    if (wifiEl) {
      const rssi = systemData.wifiRSSI;
      if (rssi !== undefined && rssi !== null) {
        wifiEl.innerHTML = `<span class="badge-dot"></span> CONNECTED (${rssi} dBm)`;
        wifiEl.className = "status-badge badge-success";
      } else {
        wifiEl.innerHTML = `<span class="badge-dot"></span> CONNECTED`;
        wifiEl.className = "status-badge badge-success";
      }
    }

    const devEl = document.getElementById("sys-device-name");
    if (devEl && systemData.deviceName) {
      devEl.textContent = systemData.deviceName;
    }
  }

  /**
   * Alerts node listener handler (powerMonitoring/alerts/)
   */
  function handleAlertsData(alertsData) {
    if (!alertsData) return;
    if (window.AlertManager && alertsData.message) {
      window.AlertManager.add({
        title: alertsData.status || "ALERT",
        message: alertsData.message,
        severity: alertsData.severity || "warning",
        source: "remote",
        timestamp: alertsData.timestamp || Date.now()
      });
    }
  }

  // Register handlers
  window.Dashboard = {
    handleRealtimeData,
    handleSystemData,
    handleAlertsData,
    setFirebaseStatus,
    setEsp32Status,
    getCurrentData: () => ({ ...currentTelemetry })
  };

  window.onFirebaseStatusChange = function (isConnected, msg) {
    setFirebaseStatus(isConnected, msg);
  };
})();
