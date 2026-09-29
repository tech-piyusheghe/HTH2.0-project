/**
 * ==============================================================================
 * SMART ELECTRICAL POWER MONITORING SYSTEM
 * Application Bootstrap & Real-Time Orchestration
 * ==============================================================================
 */

document.addEventListener("DOMContentLoaded", () => {
  console.log("[App] Initializing Smart Electrical Power Monitoring System...");

  // 1. Initialize Lucide icons
  if (window.lucide && window.lucide.createIcons) {
    window.lucide.createIcons();
  }

  // 2. Initialize Charts
  if (window.ChartManager) {
    window.ChartManager.init();
  }

  // 3. Setup Chart Time Range Buttons
  setupTimeRangeButtons();

  // 4. Setup Settings Modal & Configuration Logic
  setupSettingsModal();

  // 5. Connect to Firebase Realtime Database
  setupFirebaseConnection();
});

/**
 * Configure Firebase listeners and handle dual-mode data flow
 * Layer 1: Instant REST fetch on millisecond 0
 * Layer 2: Persistent Firebase WebSocket streaming listeners
 * Layer 3: Heartbeat polling fallback every 2000ms
 */
async function setupFirebaseConnection() {
  const isConfigured = window.FirebaseClient.isConfigured();

  if (!isConfigured) {
    console.warn("[App] Firebase credentials not configured. Awaiting user input.");
    showConfigNotice(true);
    if (window.Dashboard) {
      window.Dashboard.setFirebaseStatus(false, "API Not Configured");
      window.Dashboard.setEsp32Status(false);
    }
    return;
  }

  showConfigNotice(false);

  // STEP 1: Instant REST Fetch (Renders live data within 100ms, no waiting for WebSockets)
  await fetchInstantTelemetry();

  // STEP 2: Initialize Firebase Compat WebSocket client
  const initialized = window.FirebaseClient.init();
  if (!initialized) {
    console.warn("[App] Firebase WebSockets could not initialize, continuing in REST mode.");
  }

  // Primary Path: IndustrialMachine (ESP32 target)
  window.FirebaseClient.subscribe(
    "IndustrialMachine",
    (data) => {
      if (data && window.Dashboard) {
        console.log("[Firebase Realtime] Received IndustrialMachine packet:", data);
        window.Dashboard.handleRealtimeData(data);
        syncToPowerMonitoring(data);
      }
    },
    (err) => {
      console.warn("[Firebase] WebSocket warning on IndustrialMachine:", err);
    }
  );

  // Secondary/Alternate Path: powerMonitoring/realtime
  window.FirebaseClient.subscribe(
    "powerMonitoring/realtime",
    (data) => {
      if (data && window.Dashboard) {
        console.log("[Firebase Realtime] Received powerMonitoring/realtime packet:", data);
        window.Dashboard.handleRealtimeData(data);
      }
    }
  );

  // Subscribe to System Health: powerMonitoring/system
  window.FirebaseClient.subscribe(
    "powerMonitoring/system",
    (data) => {
      if (data && window.Dashboard) {
        window.Dashboard.handleSystemData(data);
      }
    }
  );

  // Subscribe to Alerts: powerMonitoring/alerts
  window.FirebaseClient.subscribe(
    "powerMonitoring/alerts",
    (data) => {
      if (data && window.Dashboard) {
        window.Dashboard.handleAlertsData(data);
      }
    }
  );

  // STEP 3: Continuous 2-second background heartbeat
  // Ensures all cards stay 100% synchronized even if WebSockets reconnect or idle
  if (!window._telemetryHeartbeat) {
    window._telemetryHeartbeat = setInterval(async () => {
      await fetchInstantTelemetry();
    }, 2000);
  }
}

/**
 * Instant REST fetch from Firebase RTDB to load live data immediately
 */
async function fetchInstantTelemetry() {
  try {
    // 1. Try reading IndustrialMachine
    const indData = await window.FirebaseClient.fetchNode("IndustrialMachine");
    if (indData && (indData.voltage !== undefined || indData.power !== undefined || indData.current !== undefined)) {
      if (window.Dashboard) {
        window.Dashboard.handleRealtimeData(indData);
      }
      syncToPowerMonitoring(indData);
      return;
    }

    // 2. Try reading powerMonitoring/realtime
    const pmData = await window.FirebaseClient.fetchNode("powerMonitoring/realtime");
    if (pmData && (pmData.voltage !== undefined || pmData.realPower !== undefined)) {
      if (window.Dashboard) {
        window.Dashboard.handleRealtimeData(pmData);
      }
    }
  } catch (err) {
    console.warn("[Firebase] Heartbeat fetch:", err.message);
  }
}

/**
 * Mirror IndustrialMachine to powerMonitoring/realtime for unified multi-node support
 */
function syncToPowerMonitoring(data) {
  if (!data || !window.FirebaseClient) return;

  const standardPayload = {
    voltage: data.voltage ?? null,
    current: data.current ?? null,
    realPower: data.realPower ?? data.power ?? null,
    apparentPower: data.apparentPower ?? null,
    powerFactor: data.powerFactor ?? null,
    normalPF: data.normalPF ?? 0.133,
    pfLowLimit: data.pfLowLimit ?? 0.000,
    pfHighLimit: data.pfHighLimit ?? 0.283,
    relayStatus: data.relayStatus ?? "ON",
    machineStatus: data.machineStatus ?? "NORMAL",
    timestamp: Date.now()
  };

  // Silently mirror via REST put
  window.FirebaseClient.putNode("powerMonitoring/realtime", standardPayload);
}

/**
 * Setup Time Range filter tabs for charts
 */
function setupTimeRangeButtons() {
  const buttons = document.querySelectorAll(".time-range-btn");
  buttons.forEach((btn) => {
    btn.addEventListener("click", () => {
      buttons.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      const rangeMins = parseInt(btn.getAttribute("data-range"), 10) || 5;
      if (window.ChartManager) {
        window.ChartManager.setTimeRange(rangeMins);
      }
    });
  });
}

/**
 * Show or hide configuration required banner
 */
function showConfigNotice(show) {
  const banner = document.getElementById("config-banner");
  if (banner) {
    if (show) {
      banner.classList.remove("hidden");
    } else {
      banner.classList.add("hidden");
    }
  }
}

/**
 * Setup Settings Modal (Firebase credentials & test trigger)
 */
function setupSettingsModal() {
  const modal = document.getElementById("settings-modal");
  const openBtn = document.getElementById("open-settings-btn");
  const closeBtn = document.getElementById("close-settings-btn");
  const bannerBtn = document.getElementById("banner-settings-btn");
  const form = document.getElementById("firebase-config-form");
  const testBtn = document.getElementById("send-test-data-btn");

  const openModal = () => {
    populateSettingsForm();
    if (modal) modal.classList.remove("hidden");
  };

  const closeModal = () => {
    if (modal) modal.classList.add("hidden");
  };

  if (openBtn) openBtn.addEventListener("click", openModal);
  if (bannerBtn) bannerBtn.addEventListener("click", openModal);
  if (closeBtn) closeBtn.addEventListener("click", closeModal);

  if (modal) {
    modal.addEventListener("click", (e) => {
      if (e.target === modal) closeModal();
    });
  }

  // Handle Form Submission
  if (form) {
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const apiKey = document.getElementById("cfg-api-key").value.trim();
      const authDomain = document.getElementById("cfg-auth-domain").value.trim();
      const databaseURL = document.getElementById("cfg-database-url").value.trim();
      const projectId = document.getElementById("cfg-project-id").value.trim();
      const storageBucket = document.getElementById("cfg-storage-bucket").value.trim();
      const messagingSenderId = document.getElementById("cfg-messaging-id").value.trim();
      const appId = document.getElementById("cfg-app-id").value.trim();

      const newConfig = {
        apiKey,
        authDomain,
        databaseURL,
        projectId,
        storageBucket,
        messagingSenderId,
        appId
      };

      window.FirebaseClient.saveConfig(newConfig);
      closeModal();
      setupFirebaseConnection();

      if (window.AlertManager) {
        window.AlertManager.add({
          title: "SETTINGS SAVED",
          message: "Firebase configuration updated and listeners reconnected.",
          severity: "success",
          source: "system"
        });
      }
    });
  }

  // Handle Test Reading button
  if (testBtn) {
    testBtn.addEventListener("click", async () => {
      try {
        testBtn.disabled = true;
        testBtn.textContent = "Writing Test Data...";

        const sample = {
          voltage: 227.22,
          current: 0.351,
          realPower: 9.43,
          apparentPower: 79.80,
          powerFactor: 0.118,
          normalPF: 0.133,
          pfLowLimit: 0.000,
          pfHighLimit: 0.283
        };

        if (window.FirebaseClient.isConfigured()) {
          await window.FirebaseClient.pushTestReading(sample);
          alert("Successfully published sample ESP32 telemetry packet to Firebase Realtime Database!");
        } else {
          window.Dashboard.handleRealtimeData({
            ...sample,
            timestamp: Date.now()
          });
          alert("Firebase credentials not configured, but telemetry rendered to dashboard widgets for UI verification!");
        }
      } catch (err) {
        alert("Error sending test reading: " + err.message);
      } finally {
        testBtn.disabled = false;
        testBtn.textContent = "Push Sample Reading (Test)";
      }
    });
  }
}

function populateSettingsForm() {
  const cfg = window.FirebaseClient.getConfig();
  const setVal = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.value = val && !val.includes("PASTE_") ? val : "";
  };

  setVal("cfg-api-key", cfg.apiKey);
  setVal("cfg-auth-domain", cfg.authDomain);
  setVal("cfg-database-url", cfg.databaseURL);
  setVal("cfg-project-id", cfg.projectId);
  setVal("cfg-storage-bucket", cfg.storageBucket);
  setVal("cfg-messaging-id", cfg.messagingSenderId);
  setVal("cfg-app-id", cfg.appId);
}
