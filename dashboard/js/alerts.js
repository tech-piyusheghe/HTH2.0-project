/**
 * ==============================================================================
 * SMART ELECTRICAL POWER MONITORING SYSTEM
 * Alert System & Notification Engine
 * ==============================================================================
 */

(function () {
  const alertsContainer = document.getElementById("alerts-container");
  const alertsBadge = document.getElementById("alerts-count-badge");
  const activeAlertsList = [];
  const MAX_ALERTS = 20;

  /**
   * Alert Severity:
   *  - 'critical': Red, flashing/pulsing border
   *  - 'warning': Amber / Orange
   *  - 'info': Cyan / Blue
   *  - 'success': Green
   */
  function addAlert({ title, message, severity = "info", source = "system", timestamp = Date.now() }) {
    // Avoid spamming duplicate identical alerts within a short window (e.g. 5 seconds)
    const existing = activeAlertsList.find(
      (a) => a.title === title && Math.abs(a.timestamp - timestamp) < 5000
    );
    if (existing) {
      existing.timestamp = timestamp;
      renderAlerts();
      return;
    }

    const alertItem = {
      id: "alert-" + Date.now() + "-" + Math.random().toString(36).substr(2, 4),
      title,
      message,
      severity,
      source,
      timestamp
    };

    activeAlertsList.unshift(alertItem);
    if (activeAlertsList.length > MAX_ALERTS) {
      activeAlertsList.pop();
    }

    renderAlerts();
  }

  function clearAlert(id) {
    const idx = activeAlertsList.findIndex((a) => a.id === id);
    if (idx !== -1) {
      activeAlertsList.splice(idx, 1);
      renderAlerts();
    }
  }

  function clearAllAlerts() {
    activeAlertsList.length = 0;
    renderAlerts();
  }

  function formatTime(timestamp) {
    if (!timestamp) return "--:--:--";
    const date = new Date(timestamp);
    return date.toLocaleTimeString("en-US", { hour12: false });
  }

  function getSeverityConfig(severity) {
    switch (severity) {
      case "critical":
        return {
          icon: "alert-octagon",
          badgeClass: "badge-critical",
          borderClass: "border-critical",
          textClass: "text-critical",
          bgClass: "bg-critical-subtle",
          label: "CRITICAL"
        };
      case "warning":
        return {
          icon: "alert-triangle",
          badgeClass: "badge-warning",
          borderClass: "border-warning",
          textClass: "text-warning",
          bgClass: "bg-warning-subtle",
          label: "WARNING"
        };
      case "success":
        return {
          icon: "check-circle",
          badgeClass: "badge-success",
          borderClass: "border-success",
          textClass: "text-success",
          bgClass: "bg-success-subtle",
          label: "NORMAL"
        };
      case "info":
      default:
        return {
          icon: "info",
          badgeClass: "badge-info",
          borderClass: "border-info",
          textClass: "text-info",
          bgClass: "bg-info-subtle",
          label: "INFO"
        };
    }
  }

  function renderAlerts() {
    const container = document.getElementById("alerts-container");
    const countBadge = document.getElementById("alerts-count-badge");
    const emptyState = document.getElementById("alerts-empty-state");

    if (countBadge) {
      countBadge.textContent = activeAlertsList.length;
      if (activeAlertsList.length > 0) {
        countBadge.classList.remove("hidden");
      } else {
        countBadge.classList.add("hidden");
      }
    }

    if (!container) return;

    if (activeAlertsList.length === 0) {
      container.innerHTML = `
        <div class="empty-alerts-placeholder">
          <i data-lucide="shield-check" class="w-8 h-8 text-emerald-400 opacity-60 mb-2"></i>
          <p class="text-sm font-medium text-slate-400">All electrical parameters operating within safe limits.</p>
          <span class="text-xs text-slate-500">No active warnings or critical events.</span>
        </div>
      `;
      if (window.lucide && window.lucide.createIcons) {
        window.lucide.createIcons();
      }
      return;
    }

    let html = "";
    activeAlertsList.forEach((alert) => {
      const cfg = getSeverityConfig(alert.severity);
      html += `
        <div class="alert-card ${cfg.borderClass} ${cfg.bgClass}" id="${alert.id}">
          <div class="alert-icon-wrapper ${cfg.textClass}">
            <i data-lucide="${cfg.icon}" class="w-5 h-5"></i>
          </div>
          <div class="alert-body">
            <div class="alert-header">
              <span class="alert-title ${cfg.textClass}">${alert.title}</span>
              <span class="alert-time">${formatTime(alert.timestamp)}</span>
            </div>
            <div class="alert-message">${alert.message}</div>
          </div>
          <button class="alert-dismiss-btn" onclick="AlertManager.dismiss('${alert.id}')" title="Dismiss">
            <i data-lucide="x" class="w-3.5 h-3.5"></i>
          </button>
        </div>
      `;
    });

    container.innerHTML = html;
    if (window.lucide && window.lucide.createIcons) {
      window.lucide.createIcons();
    }
  }

  /**
   * Evaluate electrical parameters against limits and push real alerts
   */
  function evaluateData(reading) {
    if (!reading) return;

    const pf = reading.powerFactor !== undefined && reading.powerFactor !== null ? Number(reading.powerFactor) : null;
    const pfLow = reading.pfLowLimit !== undefined && reading.pfLowLimit !== null ? Number(reading.pfLowLimit) : 0.0;
    const pfHigh = reading.pfHighLimit !== undefined && reading.pfHighLimit !== null ? Number(reading.pfHighLimit) : 0.185;
    const normalPf = reading.normalPF !== undefined && reading.normalPF !== null ? Number(reading.normalPF) : 0.035;

    // Power Factor condition
    if (pf !== null && !isNaN(pf)) {
      if (pf < pfLow) {
        addAlert({
          title: "LOW POWER FACTOR",
          message: `Current PF (${pf.toFixed(3)}) is below low threshold (${pfLow.toFixed(3)}). Normal is ${normalPf.toFixed(3)}.`,
          severity: "warning",
          source: "telemetry"
        });
      } else if (pf > pfHigh) {
        addAlert({
          title: "HIGH POWER FACTOR",
          message: `Current PF (${pf.toFixed(3)}) exceeds high limit (${pfHigh.toFixed(3)}). Normal is ${normalPf.toFixed(3)}.`,
          severity: "warning",
          source: "telemetry"
        });
      }
    }

    // Voltage sanity check (if voltage RMS is abnormally high/low)
    const v = reading.voltage !== undefined ? Number(reading.voltage) : null;
    if (v !== null && !isNaN(v)) {
      if (v > 280) {
        addAlert({
          title: "OVERVOLTAGE CRITICAL",
          message: `Detected line voltage of ${v.toFixed(1)}V RMS exceeding safe limits.`,
          severity: "critical",
          source: "telemetry"
        });
      }
    }
  }

  window.AlertManager = {
    add: addAlert,
    dismiss: clearAlert,
    clearAll: clearAllAlerts,
    evaluate: evaluateData
  };
})();
