/**
 * ==============================================================================
 * SMART ELECTRICAL POWER MONITORING SYSTEM
 * Firebase Configuration & Realtime Database Client
 * ==============================================================================
 * 
 * Replace the placeholder credentials below with your actual Firebase project
 * credentials from the Firebase Console (Project Settings > General > Your apps).
 *
 * Firebase Realtime Database Path expected:
 *   - powerMonitoring/realtime/
 *   - powerMonitoring/history/
 *   - powerMonitoring/system/
 *   - powerMonitoring/alerts/
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

// Check if credentials exist in localStorage (configured via Settings modal), else use default
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
 * Initialize Firebase Application & Database Service
 */
function initFirebase(customConfig = null) {
  const configToUse = customConfig || getActiveFirebaseConfig();

  // Clean up any existing listeners before re-initializing
  detachAllListeners();

  if (!isConfigured(configToUse)) {
    console.warn("[Firebase] Credentials not configured yet. Awaiting valid configuration.");
    isFirebaseInitialized = false;
    isFirebaseConnected = false;
    if (window.onFirebaseStatusChange) {
      window.onFirebaseStatusChange(false, "API Not Configured");
    }
    return false;
  }

  try {
    // If an app already exists, delete/re-initialize
    if (firebase.apps && firebase.apps.length > 0) {
      firebaseApp = firebase.app();
    } else {
      firebaseApp = firebase.initializeApp(configToUse);
    }

    firebaseDb = firebase.database();
    isFirebaseInitialized = true;
    console.log("[Firebase] Initialized successfully with database URL:", configToUse.databaseURL);

    // Monitor Firebase connection state (.info/connected)
    const connectedRef = firebaseDb.ref(".info/connected");
    connectedRef.on("value", (snap) => {
      isFirebaseConnected = snap.val() === true;
      if (isFirebaseConnected) {
        console.log("Firebase connected");
      }
      console.log("[Firebase] Connection status:", isFirebaseConnected ? "CONNECTED" : "DISCONNECTED");
      if (window.onFirebaseStatusChange) {
        window.onFirebaseStatusChange(isFirebaseConnected, isFirebaseConnected ? "Connected" : "Disconnected");
      }
    });

    return true;
  } catch (error) {
    console.error("[Firebase] Initialization failed:", error);
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
 * Helper to write a test reading to Firebase (if authenticated/allowed by rules)
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

  // Update realtime node
  const updates = {};
  updates["powerMonitoring/realtime"] = data;
  updates[`powerMonitoring/history/${timestamp}`] = data;
  updates["powerMonitoring/system/lastUpdated"] = new Date().toISOString();
  updates["powerMonitoring/system/online"] = true;

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
  detachAll: detachAllListeners,
  pushTestReading,
  get isInitialized() { return isFirebaseInitialized; },
  get isConnected() { return isFirebaseConnected; }
};
