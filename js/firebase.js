/**
 * ==============================================================================
 * SMART ELECTRICAL POWER MONITORING SYSTEM
 * Firebase Configuration & Realtime Database Client
 * ==============================================================================
 */

// Your web app's Firebase configuration
const defaultFirebaseConfig = {
  apiKey: "AIzaSyA6Ie1NnFx9hCSLSJ5dxuMIWFpiu4b2rjk",
  authDomain: "smart-energy-controller-4c6ed.firebaseapp.com",
  databaseURL: "https://smart-energy-controller-4c6ed-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "smart-energy-controller-4c6ed",
  storageBucket: "smart-energy-controller-4c6ed.firebasestorage.app",
  messagingSenderId: "909095479582",
  appId: "1:909095479582:web:a108fd0c7474d2a5b2410f"
};

// Check if credentials exist in localStorage, else use default
function getActiveFirebaseConfig() {
  const storedConfig = localStorage.getItem("hth_firebase_config");
  if (storedConfig) {
    try {
      const parsed = JSON.parse(storedConfig);
      if (parsed.apiKey && !parsed.apiKey.includes("PASTE_") && parsed.databaseURL && parsed.databaseURL.includes("4c6ed")) {
        return parsed;
      }
    } catch (e) {
      console.error("Error parsing stored Firebase config:", e);
    }
  }
  // Clear any outdated cache
  localStorage.removeItem("hth_firebase_config");
  return defaultFirebaseConfig;
}

const firebaseConfig = getActiveFirebaseConfig();

// Global Firebase state and handles
let firebaseApp = null;
let firebaseDb = null;
let isFirebaseInitialized = false;
let isFirebaseConnected = false;
let activeListeners = [];

/**
 * Checks if the configuration has real credentials instead of placeholders
 */
function isConfigured(config = firebaseConfig) {
  return (
    Boolean(config) &&
    Boolean(config.apiKey) &&
    !config.apiKey.includes("PASTE_") &&
    Boolean(config.databaseURL) &&
    !config.databaseURL.includes("PASTE_")
  );
}

/**
 * Direct REST fetch helper for instant, zero-delay data reading
 */
async function fetchNode(path = "IndustrialMachine") {
  try {
    const config = getActiveFirebaseConfig();
    const baseUrl = config.databaseURL.replace(/\/+$/, "");
    const cleanPath = path.startsWith("/") ? path : "/" + path;
    const url = `${baseUrl}${cleanPath}.json`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    return await res.json();
  } catch (err) {
    console.warn(`[Firebase REST] Failed to fetch node '${path}':`, err);
    return null;
  }
}

/**
 * Direct REST write helper to update a node
 */
async function putNode(path, data) {
  try {
    const config = getActiveFirebaseConfig();
    const baseUrl = config.databaseURL.replace(/\/+$/, "");
    const cleanPath = path.startsWith("/") ? path : "/" + path;
    const url = `${baseUrl}${cleanPath}.json`;
    const res = await fetch(url, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    });
    return res.ok;
  } catch (err) {
    console.warn(`[Firebase REST] Failed to put node '${path}':`, err);
    return false;
  }
}

/**
 * Initialize Firebase Application & Database Service
 */
function initFirebase(customConfig = null) {
  const configToUse = customConfig || getActiveFirebaseConfig();

  // Clean up any existing listeners before re-initializing
  detachAllListeners();

  if (!isConfigured(configToUse)) {
    console.warn("[Firebase] Credentials not configured yet.");
    isFirebaseInitialized = false;
    isFirebaseConnected = false;
    if (window.onFirebaseStatusChange) {
      window.onFirebaseStatusChange(false, "API Not Configured");
    }
    return false;
  }

  try {
    // If an app already exists, delete/re-initialize
    if (window.firebase && window.firebase.apps && window.firebase.apps.length > 0) {
      firebaseApp = window.firebase.app();
    } else if (window.firebase) {
      firebaseApp = window.firebase.initializeApp(configToUse);
    }

    if (window.firebase) {
      firebaseDb = window.firebase.database();
      isFirebaseInitialized = true;
      console.log("[Firebase] Initialized with database URL:", configToUse.databaseURL);

      // Monitor Firebase connection state (.info/connected)
      const connectedRef = firebaseDb.ref(".info/connected");
      connectedRef.on("value", (snap) => {
        isFirebaseConnected = snap.val() === true;
        console.log("[Firebase] Realtime connection state:", isFirebaseConnected ? "CONNECTED" : "CONNECTING...");
        if (window.onFirebaseStatusChange) {
          window.onFirebaseStatusChange(isFirebaseConnected, isFirebaseConnected ? "Connected" : "Reconnecting...");
        }
      });
    }

    return true;
  } catch (error) {
    console.error("[Firebase] Initialization error:", error);
    isFirebaseInitialized = false;
    isFirebaseConnected = false;
    if (window.onFirebaseStatusChange) {
      window.onFirebaseStatusChange(false, "Connection Error: " + error.message);
    }
    return false;
  }
}

/**
 * Detach all registered listeners to prevent memory leaks
 */
function detachAllListeners() {
  activeListeners.forEach(({ ref, eventType, callback }) => {
    try {
      ref.off(eventType, callback);
    } catch (e) {
      console.warn("[Firebase] Error detaching listener:", e);
    }
  });
  activeListeners = [];
}

/**
 * Safely subscribe to a Firebase Realtime Database path
 */
function subscribeToPath(path, onData, onError) {
  if (!isFirebaseInitialized || !firebaseDb) {
    console.warn(`[Firebase] Cannot subscribe to '${path}': Firebase is not initialized.`);
    return null;
  }

  try {
    const ref = firebaseDb.ref(path);
    const callback = (snapshot) => {
      const data = snapshot.val();
      onData(data);
    };

    const errCallback = (error) => {
      console.error(`[Firebase] Error reading path '${path}':`, error);
      if (onError) onError(error);
    };

    ref.on("value", callback, errCallback);
    activeListeners.push({ ref, eventType: "value", callback });
    return ref;
  } catch (error) {
    console.error(`[Firebase] Subscription error on '${path}':`, error);
    if (onError) onError(error);
    return null;
  }
}

/**
 * Save updated Firebase Config to localStorage and re-initialize
 */
function saveFirebaseConfig(newConfig) {
  localStorage.setItem("hth_firebase_config", JSON.stringify(newConfig));
  return initFirebase(newConfig);
}

/**
 * Helper to write a test reading to Firebase
 */
function pushTestReading(testData) {
  if (!isFirebaseInitialized || !firebaseDb) {
    throw new Error("Firebase is not initialized. Please configure credentials first.");
  }
  const timestamp = Date.now();
  const data = {
    ...testData,
    timestamp: timestamp
  };

  const updates = {};
  updates["powerMonitoring/realtime"] = data;
  updates["IndustrialMachine/voltage"] = data.voltage;
  updates["IndustrialMachine/current"] = data.current;
  updates["IndustrialMachine/power"] = data.realPower;
  updates["IndustrialMachine/apparentPower"] = data.apparentPower;
  updates["IndustrialMachine/powerFactor"] = data.powerFactor;
  updates["IndustrialMachine/normalPF"] = data.normalPF;
  updates["IndustrialMachine/pfLowLimit"] = data.pfLowLimit;
  updates["IndustrialMachine/pfHighLimit"] = data.pfHighLimit;
  updates["IndustrialMachine/connection"] = "ONLINE";
  updates["IndustrialMachine/machineStatus"] = "NORMAL";
  updates["IndustrialMachine/relayStatus"] = "ON";

  return firebaseDb.ref().update(updates);
}

// Export handles onto window for modular access
window.FirebaseClient = {
  defaultConfig: defaultFirebaseConfig,
  getConfig: getActiveFirebaseConfig,
  isConfigured,
  init: initFirebase,
  saveConfig: saveFirebaseConfig,
  subscribe: subscribeToPath,
  fetchNode,
  putNode,
  detachAll: detachAllListeners,
  pushTestReading,
  get isInitialized() { return isFirebaseInitialized; },
  get isConnected() { return isFirebaseConnected; }
};
