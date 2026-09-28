/**
 * ==============================================================================
 * SMART ELECTRICAL POWER MONITORING SYSTEM
 * Application Bootstrap & Event Orchestration
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
 * Configure Firebase listeners and handle data flow
 */
function setupFirebaseConnection() {
  const isConfigured = window.FirebaseClient.isConfigured();

  if (!isConfigured) {
    console.warn("[App] Firebase credentials not configured. Awaiting user input.");
    showConfigNotice(true);
    if (window.Dashboard) {
      window.Dashboard.setFirebaseStatus(false, "API Not Configured");
      window.Dashboard.setEsp32Status(false);
    }
    if (window.AlertManager) {
      window.AlertManager.add({
        title: "FIREBASE NOT CONFIGURED",
        message: "Add your Firebase API Key and Database URL in js/firebase.js or click Settings.",
        severity: "info",
        source: "system"
      });
    }
    return;
  }

  showConfigNotice(false);

  // Initialize client
  const initialized = window.FirebaseClient.init();
  if (!initialized) {
    console.error("[App] Failed to initialize Firebase.");
    return;
  }

  // 1. Primary ESP32 Path: IndustrialMachine
  window.FirebaseClient.subscribe(
    "IndustrialMachine",
    (data) => {
      console.log("Realtime Firebase data (IndustrialMachine):", data);
      if (data && window.Dashboard) {
        window.Dashboard.handleRealtimeData(data);
        if (data.connection === "ONLINE") {
          window.Dashboard.setEsp32Status(true);
        }
      }
    },
    (err) => {
      console.error("[Firebase] Error on IndustrialMachine:", err);
    }
  );

  // 2. Secondary/Alternate Path: powerMonitoring/realtime
  window.FirebaseClient.subscribe(
    "powerMonitoring/realtime",
    (data) => {
      console.log("Realtime Firebase data (powerMonitoring/realtime):", data);
      if (data && window.Dashboard) {
        window.Dashboard.handleRealtimeData(data);
      }
    },
    (err) => {
      console.warn("[Firebase] Path powerMonitoring/realtime not populated yet:", err);
    }
  );

  // 3. Subscribe to System Health: powerMonitoring/system
  window.FirebaseClient.subscribe(
    "powerMonitoring/system",
    (data) => {
      if (data && window.Dashboard) {
        window.Dashboard.handleSystemData(data);
      }
    }
  );

  // 4. Subscribe to Alerts: powerMonitoring/alerts
  window.FirebaseClient.subscribe(
    "powerMonitoring/alerts",
    (data) => {
      if (data && window.Dashboard) {
        window.Dashboard.handleAlertsData(data);
      }
    }
  );

  // 5. Also listen to root to catch any other telemetry structures
  window.FirebaseClient.subscribe(
    "/",
    (rootData) => {
      if (!rootData) return;
      if (rootData.IndustrialMachine && window.Dashboard) {
        window.Dashboard.handleRealtimeData(rootData.IndustrialMachine);
        if (rootData.IndustrialMachine.connection === "ONLINE") {
          window.Dashboard.setEsp32Status(true);
        }
      }
    }
  );
}

/**
 * Inspect alternative Firebase paths if powerMonitoring/realtime returned empty snapshot
 */
function checkAlternativeFirebaseStructure() {
  window.FirebaseClient.subscribe(
    "/",
    (rootData) => {
      if (!rootData) return;
      console.log("[Firebase] Root database snapshot:", rootData);

      // If root contains IndustrialMachine
      if (rootData.IndustrialMachine) {
        console.log("Realtime Firebase data (adapted from IndustrialMachine):", rootData.IndustrialMachine);
        if (window.Dashboard) {
          window.Dashboard.handleRealtimeData(rootData.IndustrialMachine);
          if (rootData.IndustrialMachine.connection) {
            window.Dashboard.setEsp32Status(rootData.IndustrialMachine.connection === "ONLINE");
          }
        }
      } else if (rootData.voltage !== undefined || rootData.current !== undefined) {
        console.log("Realtime Firebase data (adapted from root):", rootData);
        if (window.Dashboard) {
          window.Dashboard.handleRealtimeData(rootData);
        }
      }
    }
  );
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
          message: "Firebase configuration updated and listener reconnected.",
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
          voltage: 11.88,
          current: 4.203,
          realPower: 1.30,
          apparentPower: 49.92,
          powerFactor: 0.026,
          normalPF: 0.035,
          pfLowLimit: 0.000,
          pfHighLimit: 0.185
        };

        if (window.FirebaseClient.isConfigured()) {
          await window.FirebaseClient.pushTestReading(sample);
          alert("Successfully published sample ESP32 telemetry packet to Firebase Realtime Database!");
        } else {
          // If not configured, directly pipe to UI to demonstrate layout
          window.Dashboard.handleRealtimeData({
            ...sample,
            timestamp: Date.now()
          });
          alert("Firebase is not connected yet, but the test reading was routed to the dashboard to test UI widgets!");
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
