/**
 * ==============================================================================
 * SMART ELECTRICAL POWER MONITORING SYSTEM
 * Main Dashboard Controller & UI Binding
 * ==============================================================================
 */

(function () {
  // State variables
  let previousRealPower = null;
  let lastDataReceivedTime = null;
  let esp32WatchdogTimer = null;
  const ESP32_TIMEOUT_MS = 12000; // 12 seconds with no data -> mark offline
  const recentReadingsList = [];
  const MAX_TABLE_ROWS = 25;

  /**
   * Safe Number Formatter
   * Never returns NaN, undefined, or null. Returns fallback (default: '--')
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
   * Update all Main KPI Cards
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
    if (!data) return;

    const pf = data.powerFactor !== undefined && data.powerFactor !== null ? Number(data.powerFactor) : null;
    const normalPf = data.normalPF !== undefined && data.normalPF !== null ? Number(data.normalPF) : 0.035;
    const pfLow = data.pfLowLimit !== undefined && data.pfLowLimit !== null ? Number(data.pfLowLimit) : 0.000;
    const pfHigh = data.pfHighLimit !== undefined && data.pfHighLimit !== null ? Number(data.pfHighLimit) : 0.185;

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

    // Update Visual Gauge Needle / Arc
    updatePfGauge(pf, pfLow, pfHigh);

    return status;
  }

  /**
   * Update the SVG / Canvas Power Factor Semi-circle Gauge
   */
  function updatePfGauge(pf, lowLimit = 0.0, highLimit = 0.2) {
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

    // Gauge range: 0.000 to max (say 0.250 or highLimit * 1.35)
    const maxScale = Math.max(0.25, highLimit * 1.35);
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

    const currentP = data.realPower !== undefined && data.realPower !== null ? Number(data.realPower) : null;
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
    const eff = ap > 0 ? (rp / ap) * 100 : 0;
    if (efficiencyEl) efficiencyEl.textContent = `${formatVal(eff, 1)}%`;
  }

  /**
   * Update Recent Readings Table
   */
  function addRecentReadingRow(data, pfStatus) {
    if (!data) return;

    const tbody = document.getElementById("recent-readings-tbody");
    if (!tbody) return;

    const timeStr = formatTime(data.timestamp || Date.now());
    const vStr = formatVal(data.voltage, 2);
    const iStr = formatVal(data.current, 3);
    const rpStr = formatVal(data.realPower, 2);
    const apStr = formatVal(data.apparentPower, 2);
    const pfStr = formatVal(data.powerFactor, 3);

    let badgeClass = "badge-success";
    if (pfStatus === "LOW" || pfStatus === "HIGH") {
      badgeClass = "badge-warning";
    } else if (pfStatus === "--") {
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

    // Set ESP32 online
    setEsp32Status(true);

    esp32WatchdogTimer = setTimeout(() => {
      setEsp32Status(false);
      if (window.AlertManager) {
        window.AlertManager.add({
          title: "DEVICE OFFLINE",
          message: "No heartbeat or telemetry received from ESP32 for over 12 seconds.",
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
    lastDataReceivedTime = timestamp;
    const timeStr = formatTime(timestamp);

    const hdrEl = document.getElementById("last-updated-text");
    const sysEl = document.getElementById("sys-last-data");

    if (hdrEl) hdrEl.textContent = `Last Updated: ${timeStr}`;
    if (sysEl) sysEl.textContent = timeStr;
  }

  /**
   * Normalize incoming telemetry to support standard schema and variations
   */
  function normalizeData(raw) {
    if (!raw || typeof raw !== "object") return null;
    const item = raw.realtime || raw.IndustrialMachine || raw;
    const v = item.voltage !== undefined && item.voltage !== null ? Number(item.voltage) : (item.v !== undefined ? Number(item.v) : null);
    const i = item.current !== undefined && item.current !== null ? Number(item.current) : (item.i !== undefined ? Number(item.i) : null);
    const p = item.realPower !== undefined && item.realPower !== null ? Number(item.realPower) : (item.power !== undefined && item.power !== null ? Number(item.power) : (item.p !== undefined ? Number(item.p) : null));
    let s = item.apparentPower !== undefined && item.apparentPower !== null ? Number(item.apparentPower) : (item.s !== undefined ? Number(item.s) : null);
    if (s === null && v !== null && i !== null) {
      s = v * i;
    }
    let pf = item.powerFactor !== undefined && item.powerFactor !== null ? Number(item.powerFactor) : (item.pf !== undefined ? Number(item.pf) : null);
    if (pf === null && p !== null && s !== null && s > 0) {
      pf = p / s;
    }
    const npf = item.normalPF !== undefined && item.normalPF !== null ? Number(item.normalPF) : 0.035;
    const pfLow = item.pfLowLimit !== undefined && item.pfLowLimit !== null ? Number(item.pfLowLimit) : 0.000;
    const pfHigh = item.pfHighLimit !== undefined && item.pfHighLimit !== null ? Number(item.pfHighLimit) : 0.185;
    const ts = item.timestamp || item.lastUpdated || Date.now();

    return {
      voltage: isNaN(v) ? null : v,
      current: isNaN(i) ? null : i,
      realPower: isNaN(p) ? null : p,
      apparentPower: isNaN(s) ? null : s,
      powerFactor: isNaN(pf) ? null : pf,
      normalPF: isNaN(npf) ? 0.035 : npf,
      pfLowLimit: isNaN(pfLow) ? 0.000 : pfLow,
      pfHighLimit: isNaN(pfHigh) ? 0.185 : pfHigh,
      timestamp: ts,
      connection: item.connection,
      machineStatus: item.machineStatus
    };
  }

  /**
   * Main Real-time telemetry ingress handler
   * Called directly by Firebase Realtime Database listener
   */
  function handleRealtimeData(raw) {
    if (!raw) {
      console.warn("[Dashboard] Received empty data packet from Firebase.");
      return;
    }

    const data = normalizeData(raw);
    if (!data) return;

    // 1. Reset Watchdog & Record Last Received
    resetWatchdogTimer();
    setLastUpdated(data.timestamp || Date.now());

    // 2. Update KPI Cards
    updateKpiCards(data);

    // 3. Update Power Factor Section & Gauge
    const pfStatus = updatePowerFactorSection(data);

    // 4. Update Real Power Section & Trend
    updateRealPowerAnalysis(data);

    // 5. Update Apparent vs Real Power Section
    updateApparentVsReal(data);

    // 6. Update Recent Readings Table
    addRecentReadingRow(data, pfStatus);

    // 7. Push to Live Charts
    if (window.ChartManager) {
      window.ChartManager.addPoint(data);
    }

    // 8. Evaluate parameter limits for Alerts
    if (window.AlertManager) {
      window.AlertManager.evaluate(data);

      if (raw.machineStatus === "FAULT" || data.machineStatus === "FAULT") {
        window.AlertManager.add({
          title: "PF ABNORMAL - MACHINE FAULT",
          message: `Abnormal power factor detected by ESP32 protection system. Relay is ${raw.relayStatus || "OFF"}.`,
          severity: "critical",
          source: "telemetry"
        });
      }
    }

    // 9. Update Connection & Device state if present in packet
    if (raw.connection === "ONLINE" || data.connection === "ONLINE") {
      setEsp32Status(true);
    }
    const devEl = document.getElementById("sys-device-name");
    if (devEl) {
      devEl.textContent = "ESP32 PF Protection";
    }

    const machineStatusEl = document.getElementById("sys-machine-status");
    if (machineStatusEl) {
      const ms = raw.machineStatus || data.machineStatus || "NORMAL";
      if (ms === "FAULT") {
        machineStatusEl.className = "status-badge badge-critical";
        machineStatusEl.innerHTML = `<span class="badge-dot"></span> FAULT`;
      } else {
        machineStatusEl.className = "status-badge badge-success";
        machineStatusEl.innerHTML = `<span class="badge-dot"></span> NORMAL`;
      }
    }

    const relayStatusEl = document.getElementById("sys-relay-status");
    if (relayStatusEl) {
      const rs = raw.relayStatus || data.relayStatus || "ON";
      if (rs === "ON") {
        relayStatusEl.className = "status-badge badge-success";
        relayStatusEl.innerHTML = `<span class="badge-dot"></span> ACTIVE (ON)`;
      } else {
        relayStatusEl.className = "status-badge badge-critical";
        relayStatusEl.innerHTML = `<span class="badge-dot"></span> TRIPPED (OFF)`;
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
    setEsp32Status
  };

  window.onFirebaseStatusChange = function (isConnected, msg) {
    setFirebaseStatus(isConnected, msg);
    if (!isConnected && window.AlertManager) {
      window.AlertManager.add({
        title: "FIREBASE DISCONNECTED",
        message: msg || "Lost connection to Firebase Realtime Database.",
        severity: "critical",
        source: "system"
      });
    }
  };
})();
