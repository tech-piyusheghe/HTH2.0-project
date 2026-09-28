#include <Arduino.h>
#include <math.h>
#include <WiFi.h>
#include <Firebase_ESP_Client.h>

// =====================================================
// FIREBASE
// =====================================================

#define WIFI_SSID       "Oppo"
#define WIFI_PASSWORD   "NTPC12345"

#define FIREBASE_API_KEY  "AIzaSyA6Ie1NnFx9hCSLSJ5dxuMIWFpiu4b2rjk"

#define DATABASE_URL \
"https://smart-energy-controller-4c6ed-default-rtdb.asia-southeast1.firebasedatabase.app"


// Firebase helper
#include "addons/TokenHelper.h"
#include "addons/RTDBHelper.h"

FirebaseData fbdo;
FirebaseAuth auth;
FirebaseConfig config;

bool firebaseReady = false;


// =====================================================
// PIN
// =====================================================

#define VOLTAGE_PIN 34
#define CURRENT_PIN 35
#define RELAY_PIN   26

// Change these if your SSR is active LOW
#define RELAY_ON  HIGH
#define RELAY_OFF LOW


// =====================================================
// SAMPLING
// =====================================================

#define SAMPLE_COUNT 2500

#define SAMPLE_DELAY_US 200


// =====================================================
// PF CHANGE LIMIT
// =====================================================

#define PF_TOLERANCE 0.15

// PF abnormal condition must remain this long
#define FAULT_TIME 2000


// =====================================================
// FIREBASE UPLOAD INTERVAL
// =====================================================

#define FIREBASE_INTERVAL 2000

unsigned long lastFirebaseUpload = 0;


// =====================================================
// CALIBRATION FACTORS
// =====================================================

float VOLTAGE_CAL = 1.0;
float CURRENT_CAL = 1.0;


// =====================================================
// VARIABLES
// =====================================================

float normalPF = 0.0;

bool relayTripped = false;

bool faultTimerRunning = false;

unsigned long faultStart = 0;


// =====================================================
// STRUCTURE
// =====================================================

struct Measurement
{
  float voltageRMS;
  float currentRMS;
  float realPower;
  float apparentPower;
  float powerFactor;
};


// =====================================================
// WIFI CONNECTION
// =====================================================

void connectWiFi()
{
  Serial.println();
  Serial.println("======================================");
  Serial.println("Connecting to WiFi...");
  Serial.println("======================================");

  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  int retry = 0;

  while (WiFi.status() != WL_CONNECTED && retry < 30)
  {
    delay(500);

    Serial.print(".");

    retry++;
  }

  Serial.println();

  if (WiFi.status() == WL_CONNECTED)
  {
    Serial.println("WiFi Connected!");

    Serial.print("IP Address: ");
    Serial.println(WiFi.localIP());
  }
  else
  {
    Serial.println("WiFi Connection FAILED");
  }
}


// =====================================================
// FIREBASE SETUP
// =====================================================

void setupFirebase()
{
  config.api_key = FIREBASE_API_KEY;

  config.database_url = DATABASE_URL;

  // Anonymous Firebase Authentication
  if (Firebase.signUp(&config, &auth, "", ""))
  {
    Serial.println("Firebase Anonymous Sign-In OK");
  }
  else
  {
    Serial.print("Firebase Sign-In Error: ");
    Serial.println(config.signer.signupError.message.c_str());
  }

  config.token_status_callback = tokenStatusCallback;

  Firebase.begin(&config, &auth);

  Firebase.reconnectWiFi(true);

  firebaseReady = true;

  Serial.println("Firebase Initialized");
}


// =====================================================
// GET DC OFFSET
// =====================================================

float getOffset(int pin)
{
  long total = 0;

  for (int i = 0; i < 1000; i++)
  {
    total += analogRead(pin);
  }

  return (float)total / 1000.0;
}


// =====================================================
// MEASURE V + I
// =====================================================

Measurement measureLoad()
{
  Measurement m;

  float voltageOffset = getOffset(VOLTAGE_PIN);
  float currentOffset = getOffset(CURRENT_PIN);

  double voltageSquareSum = 0;
  double currentSquareSum = 0;
  double powerSum = 0;

  for (int i = 0; i < SAMPLE_COUNT; i++)
  {
    float vADC = analogRead(VOLTAGE_PIN);
    float iADC = analogRead(CURRENT_PIN);

    float vAC = vADC - voltageOffset;
    float iAC = iADC - currentOffset;

    voltageSquareSum += vAC * vAC;

    currentSquareSum += iAC * iAC;

    powerSum += vAC * iAC;

    delayMicroseconds(SAMPLE_DELAY_US);
  }


  // ---------------------------------------------------
  // RMS
  // ---------------------------------------------------

  m.voltageRMS =
      sqrt(voltageSquareSum / SAMPLE_COUNT);

  m.currentRMS =
      sqrt(currentSquareSum / SAMPLE_COUNT);


  // ---------------------------------------------------
  // Real Power
  // ---------------------------------------------------

  m.realPower =
      powerSum / SAMPLE_COUNT;


  // ---------------------------------------------------
  // Apparent Power
  // ---------------------------------------------------

  m.apparentPower =
      m.voltageRMS * m.currentRMS;


  // ---------------------------------------------------
  // Power Factor
  // ---------------------------------------------------

  if (m.apparentPower > 0.001)
  {
    m.powerFactor =
        fabs(m.realPower / m.apparentPower);
  }
  else
  {
    m.powerFactor = 0;
  }


  // Limit PF
  if (m.powerFactor > 1.0)
    m.powerFactor = 1.0;

  if (m.powerFactor < 0.0)
    m.powerFactor = 0.0;


  return m;
}


// =====================================================
// LEARN NORMAL PF
// =====================================================

void learnNormalPF()
{
  Serial.println();
  Serial.println("======================================");
  Serial.println("       NORMAL PF CALIBRATION");
  Serial.println("======================================");

  Serial.println("Bulb ko NORMAL condition mein ON rakho.");
  Serial.println("Learning in 5 seconds...");

  delay(5000);

  float totalPF = 0;

  for (int i = 0; i < 5; i++)
  {
    Measurement m = measureLoad();

    Serial.print("PF Sample ");
    Serial.print(i + 1);
    Serial.print(" = ");

    Serial.println(m.powerFactor, 3);

    totalPF += m.powerFactor;

    delay(300);
  }

  normalPF = totalPF / 5.0;

  Serial.println();
  Serial.println("--------------------------------------");

  Serial.print("NORMAL PF = ");
  Serial.println(normalPF, 3);

  Serial.println("--------------------------------------");
}


// =====================================================
// FIREBASE SEND DATA
// =====================================================

void sendToFirebase(
    float voltage,
    float current,
    float power,
    float apparentPower,
    float powerFactor,
    float normalPFValue,
    float pfLow,
    float pfHigh,
    bool relayStatus,
    bool faultStatus
)
{
  if (!Firebase.ready())
  {
    Serial.println("Firebase not ready");

    return;
  }

  // ---------------------------------------------------
  // Main machine data
  // ---------------------------------------------------

  Firebase.RTDB.setFloat(
      &fbdo,
      "/IndustrialMachine/voltage",
      voltage
  );

  Firebase.RTDB.setFloat(
      &fbdo,
      "/IndustrialMachine/current",
      current
  );

  Firebase.RTDB.setFloat(
      &fbdo,
      "/IndustrialMachine/power",
      power
  );

  Firebase.RTDB.setFloat(
      &fbdo,
      "/IndustrialMachine/apparentPower",
      apparentPower
  );

  Firebase.RTDB.setFloat(
      &fbdo,
      "/IndustrialMachine/powerFactor",
      powerFactor
  );

  Firebase.RTDB.setFloat(
      &fbdo,
      "/IndustrialMachine/normalPF",
      normalPFValue
  );

  Firebase.RTDB.setFloat(
      &fbdo,
      "/IndustrialMachine/pfLowLimit",
      pfLow
  );

  Firebase.RTDB.setFloat(
      &fbdo,
      "/IndustrialMachine/pfHighLimit",
      pfHigh
  );


  // ---------------------------------------------------
  // Relay
  // ---------------------------------------------------

  if (relayStatus)
  {
    Firebase.RTDB.setString(
        &fbdo,
        "/IndustrialMachine/relayStatus",
        "ON"
    );
  }
  else
  {
    Firebase.RTDB.setString(
        &fbdo,
        "/IndustrialMachine/relayStatus",
        "OFF"
    );
  }


  // ---------------------------------------------------
  // Machine Status
  // ---------------------------------------------------

  if (faultStatus)
  {
    Firebase.RTDB.setString(
        &fbdo,
        "/IndustrialMachine/machineStatus",
        "FAULT"
    );
  }
  else
  {
    Firebase.RTDB.setString(
        &fbdo,
        "/IndustrialMachine/machineStatus",
        "NORMAL"
    );
  }


  // ---------------------------------------------------
  // Connection status
  // ---------------------------------------------------

  Firebase.RTDB.setString(
      &fbdo,
      "/IndustrialMachine/connection",
      "ONLINE"
  );


  // ---------------------------------------------------
  // Serial confirmation
  // ---------------------------------------------------

  Serial.println();
  Serial.println("---------- FIREBASE ----------");

  if (fbdo.httpCode() == 200)
  {
    Serial.println("Firebase Data Uploaded Successfully");
  }
  else
  {
    Serial.print("Firebase Error: ");
    Serial.println(fbdo.errorReason());
  }

  Serial.println("------------------------------");
}


// =====================================================
// SETUP
// =====================================================

void setup()
{
  Serial.begin(115200);

  delay(2000);

  analogReadResolution(12);


  // ---------------------------------------------------
  // Pins
  // ---------------------------------------------------

  pinMode(VOLTAGE_PIN, INPUT);

  pinMode(CURRENT_PIN, INPUT);

  pinMode(RELAY_PIN, OUTPUT);


  // Turn load ON initially
  digitalWrite(RELAY_PIN, RELAY_ON);


  // ---------------------------------------------------
  // System information
  // ---------------------------------------------------

  Serial.println();

  Serial.println("########################################");

  Serial.println("   ESP32 PF LOAD PROTECTION SYSTEM");

  Serial.println("########################################");

  Serial.println();

  Serial.println("Voltage Sensor : GPIO34");

  Serial.println("Current Sensor : GPIO35");

  Serial.println("Relay / SSR    : GPIO26");

  Serial.println();


  // ---------------------------------------------------
  // WiFi
  // ---------------------------------------------------

  connectWiFi();


  // ---------------------------------------------------
  // Firebase
  // ---------------------------------------------------

  if (WiFi.status() == WL_CONNECTED)
  {
    setupFirebase();
  }


  // ---------------------------------------------------
  // Learn normal PF
  // ---------------------------------------------------

  learnNormalPF();


  Serial.println();

  Serial.println("SYSTEM READY");

  Serial.println("RELAY = ON");

  Serial.println();
}


// =====================================================
// LOOP
// =====================================================

void loop()
{
  // ---------------------------------------------------
  // If already tripped
  // ---------------------------------------------------

  if (relayTripped)
  {
    digitalWrite(RELAY_PIN, RELAY_OFF);

    Serial.println();

    Serial.println("######################################");

    Serial.println("SYSTEM TRIPPED");

    Serial.println("RELAY = OFF");

    Serial.println("POWER CUT OFF");

    Serial.println("Restart ESP32 to reset");

    Serial.println("######################################");


    // -------------------------------------------------
    // Send FAULT status to Firebase
    // -------------------------------------------------

    if (Firebase.ready())
    {
      Firebase.RTDB.setString(
          &fbdo,
          "/IndustrialMachine/relayStatus",
          "OFF"
      );

      Firebase.RTDB.setString(
          &fbdo,
          "/IndustrialMachine/machineStatus",
          "FAULT"
      );
    }

    delay(2000);

    return;
  }


  // ---------------------------------------------------
  // Measure
  // ---------------------------------------------------

  Measurement m = measureLoad();


  // ---------------------------------------------------
  // Calibrated values
  // ---------------------------------------------------

  float voltage =
      m.voltageRMS * VOLTAGE_CAL;


  float current =
      m.currentRMS * CURRENT_CAL;


  float power =
      voltage * current * m.powerFactor;


  // ---------------------------------------------------
  // PF limits
  // ---------------------------------------------------

  float pfLow =
      normalPF - PF_TOLERANCE;


  float pfHigh =
      normalPF + PF_TOLERANCE;


  if (pfLow < 0)
    pfLow = 0;


  if (pfHigh > 1)
    pfHigh = 1;


  // ---------------------------------------------------
  // Display
  // ---------------------------------------------------

  Serial.println();

  Serial.println("======================================");


  Serial.print("Voltage RMS RAW : ");

  Serial.println(m.voltageRMS, 2);


  Serial.print("Current RMS RAW : ");

  Serial.println(m.currentRMS, 2);


  Serial.print("Voltage          : ");

  Serial.print(voltage, 2);

  Serial.println(" V");


  Serial.print("Current          : ");

  Serial.print(current, 3);

  Serial.println(" A");


  Serial.print("Real Power       : ");

  Serial.print(power, 2);

  Serial.println(" W");


  Serial.print("Apparent Power   : ");

  Serial.print(m.apparentPower, 2);

  Serial.println(" RAW");


  Serial.print("Power Factor     : ");

  Serial.println(m.powerFactor, 3);


  Serial.print("Normal PF        : ");

  Serial.println(normalPF, 3);


  Serial.print("PF LOW LIMIT     : ");

  Serial.println(pfLow, 3);


  Serial.print("PF HIGH LIMIT    : ");

  Serial.println(pfHigh, 3);


  // ---------------------------------------------------
  // Relay status
  // ---------------------------------------------------

  bool relayStatus =
      (digitalRead(RELAY_PIN) == RELAY_ON);


  Serial.print("RELAY STATUS     : ");


  if (relayStatus)
  {
    Serial.println("ON");
  }
  else
  {
    Serial.println("OFF");
  }


  // ---------------------------------------------------
  // PF CHANGE DETECTION
  // ---------------------------------------------------

  bool pfFault = false;


  if (m.powerFactor < pfLow)
  {
    pfFault = true;
  }


  if (m.powerFactor > pfHigh)
  {
    pfFault = true;
  }


  // ---------------------------------------------------
  // ABNORMAL PF
  // ---------------------------------------------------

  if (pfFault)
  {
    Serial.println();

    Serial.println("******** PF CHANGE DETECTED ********");


    if (m.powerFactor < pfLow)
    {
      Serial.println("PF BELOW NORMAL LIMIT");
    }


    if (m.powerFactor > pfHigh)
    {
      Serial.println("PF ABOVE NORMAL LIMIT");
    }


    // Start timer
    if (!faultTimerRunning)
    {
      faultTimerRunning = true;

      faultStart = millis();

      Serial.println("Checking for 2 seconds...");
    }


    // Confirm fault
    if (millis() - faultStart >= FAULT_TIME)
    {
      digitalWrite(RELAY_PIN, RELAY_OFF);

      relayTripped = true;

      Serial.println();

      Serial.println("######################################");

      Serial.println("      PF ABNORMAL - POWER CUT");

      Serial.println("      RELAY = OFF");

      Serial.println("######################################");
    }
  }


  // ---------------------------------------------------
  // NORMAL PF
  // ---------------------------------------------------

  else
  {
    faultTimerRunning = false;

    faultStart = 0;

    Serial.println("LOAD STATUS     : NORMAL");
  }


  // ===================================================
  // FIREBASE UPLOAD
  // ===================================================

  if (millis() - lastFirebaseUpload >= FIREBASE_INTERVAL)
  {
    lastFirebaseUpload = millis();

    bool currentRelayStatus =
        (digitalRead(RELAY_PIN) == RELAY_ON);

    sendToFirebase(
        voltage,
        current,
        power,
        m.apparentPower,
        m.powerFactor,
        normalPF,
        pfLow,
        pfHigh,
        currentRelayStatus,
        pfFault
    );
  }


  Serial.println("======================================");

  delay(300);
}
