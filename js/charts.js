/**
 * ==============================================================================
 * SMART ELECTRICAL POWER MONITORING SYSTEM
 * Chart Engine (Chart.js implementation with real-time streaming)
 * ==============================================================================
 */

(function () {
  let charts = {
    voltage: null,
    current: null,
    realPower: null,
    apparentPower: null,
    powerFactor: null,
    powerComparison: null
  };

  // Time window in milliseconds (default: 5 minutes)
  let currentTimeRangeMs = 5 * 60 * 1000;

  // Master historical buffer (stores real data points from Firebase)
  const telemetryHistory = [];

  function getThemeColors() {
    const isDark = document.documentElement.getAttribute("data-theme") !== "light";
    return {
      textColor: isDark ? "#94a3b8" : "#64748b",
      headingColor: isDark ? "#f8fafc" : "#0f172a",
      gridColor: isDark ? "rgba(51, 65, 85, 0.35)" : "rgba(203, 213, 225, 0.45)",
      tooltipBg: isDark ? "#0f172a" : "#ffffff",
      tooltipBorder: isDark ? "#334155" : "#e2e8f0",
      tooltipText: isDark ? "#f8fafc" : "#0f172a",
      cyan: "#00d2ff",
      blue: "#3b82f6",
      purple: "#8b5cf6",
      amber: "#f59e0b",
      green: "#10b981",
      red: "#ef4444"
    };
  }

  function getBaseChartOptions(colors, unit = "") {
    return {
      responsive: true,
      maintainAspectRatio: false,
      animation: {
        duration: 300,
        easing: "easeOutQuart"
      },
      interaction: {
        mode: "index",
        intersect: false
      },
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          backgroundColor: colors.tooltipBg,
          titleColor: colors.tooltipText,
          bodyColor: colors.tooltipText,
          borderColor: colors.tooltipBorder,
          borderWidth: 1,
          padding: 10,
          cornerRadius: 8,
          displayColors: true,
          callbacks: {
            label: function (context) {
              const val = context.parsed.y !== null ? context.parsed.y.toFixed(3) : "--";
              return ` ${context.dataset.label || "Value"}: ${val} ${unit}`;
            }
          }
        }
      },
      scales: {
        x: {
          grid: {
            color: colors.gridColor,
            drawBorder: false
          },
          ticks: {
            color: colors.textColor,
            font: { family: "Inter, sans-serif", size: 11 },
            maxRotation: 0,
            autoSkip: true,
            maxTicksLimit: 6
          }
        },
        y: {
          grid: {
            color: colors.gridColor,
            drawBorder: false
          },
          ticks: {
            color: colors.textColor,
            font: { family: "Inter, sans-serif", size: 11 },
            callback: function (val) {
              return typeof val === "number" ? val.toFixed(1) : val;
            }
          }
        }
      }
    };
  }

  function initCharts() {
    const colors = getThemeColors();

    // 1. Voltage RMS Chart
    const ctxV = document.getElementById("chart-voltage");
    if (ctxV) {
      charts.voltage = new Chart(ctxV.getContext("2d"), {
        type: "line",
        data: {
          labels: [],
          datasets: [
            {
              label: "Voltage RMS",
              data: [],
              borderColor: colors.cyan,
              backgroundColor: "rgba(0, 210, 255, 0.08)",
              borderWidth: 2,
              fill: true,
              tension: 0.25,
              pointRadius: 2,
              pointHoverRadius: 5
            }
          ]
        },
        options: getBaseChartOptions(colors, "V")
      });
    }

    // 2. Current RMS Chart
    const ctxI = document.getElementById("chart-current");
    if (ctxI) {
      charts.current = new Chart(ctxI.getContext("2d"), {
        type: "line",
        data: {
          labels: [],
          datasets: [
            {
              label: "Current RMS",
              data: [],
              borderColor: colors.blue,
              backgroundColor: "rgba(59, 130, 246, 0.08)",
              borderWidth: 2,
              fill: true,
              tension: 0.25,
              pointRadius: 2,
              pointHoverRadius: 5
            }
          ]
        },
        options: getBaseChartOptions(colors, "A")
      });
    }

    // 3. Real Power Chart
    const ctxP = document.getElementById("chart-real-power");
    if (ctxP) {
      charts.realPower = new Chart(ctxP.getContext("2d"), {
        type: "line",
        data: {
          labels: [],
          datasets: [
            {
              label: "Real Power (P)",
              data: [],
              borderColor: colors.green,
              backgroundColor: "rgba(16, 185, 129, 0.08)",
              borderWidth: 2,
              fill: true,
              tension: 0.25,
              pointRadius: 2,
              pointHoverRadius: 5
            }
          ]
        },
        options: getBaseChartOptions(colors, "W")
      });
    }

    // 4. Apparent Power Chart
    const ctxS = document.getElementById("chart-apparent-power");
    if (ctxS) {
      charts.apparentPower = new Chart(ctxS.getContext("2d"), {
        type: "line",
        data: {
          labels: [],
          datasets: [
            {
              label: "Apparent Power (S)",
              data: [],
              borderColor: colors.purple,
              backgroundColor: "rgba(139, 92, 246, 0.08)",
              borderWidth: 2,
              fill: true,
              tension: 0.25,
              pointRadius: 2,
              pointHoverRadius: 5
            }
          ]
        },
        options: getBaseChartOptions(colors, "VA")
      });
    }

    // 5. Power Factor Chart
    const ctxPF = document.getElementById("chart-power-factor");
    if (ctxPF) {
      const pfOpts = getBaseChartOptions(colors, "");
      pfOpts.scales.y.suggestedMin = 0.0;
      pfOpts.scales.y.suggestedMax = 0.25;
      charts.powerFactor = new Chart(ctxPF.getContext("2d"), {
        type: "line",
        data: {
          labels: [],
          datasets: [
            {
              label: "Power Factor",
              data: [],
              borderColor: colors.amber,
              backgroundColor: "rgba(245, 158, 11, 0.08)",
              borderWidth: 2,
              fill: true,
              tension: 0.25,
              pointRadius: 2,
              pointHoverRadius: 5
            }
          ]
        },
        options: pfOpts
      });
    }

    // 6. Power Comparison Bar Chart (Real Power vs Apparent Power)
    const ctxComp = document.getElementById("chart-power-comparison");
    if (ctxComp) {
      charts.powerComparison = new Chart(ctxComp.getContext("2d"), {
        type: "bar",
        data: {
          labels: ["Real Power (W)", "Apparent Power (VA)"],
          datasets: [
            {
              label: "Power Analysis",
              data: [0, 0],
              backgroundColor: [colors.green, colors.purple],
              borderRadius: 6,
              barThickness: 38
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: { duration: 300 },
          plugins: {
            legend: { display: false },
            tooltip: {
              backgroundColor: colors.tooltipBg,
              titleColor: colors.tooltipText,
              bodyColor: colors.tooltipText,
              borderColor: colors.tooltipBorder,
              borderWidth: 1,
              padding: 10,
              cornerRadius: 8
            }
          },
          scales: {
            x: {
              grid: { display: false },
              ticks: { color: colors.textColor, font: { family: "Inter, sans-serif", size: 12 } }
            },
            y: {
              grid: { color: colors.gridColor, drawBorder: false },
              ticks: { color: colors.textColor, font: { family: "Inter, sans-serif", size: 11 } }
            }
          }
        }
      });
    }
  }

  function addDataPoint(data) {
    if (!data) return;

    const timestamp = data.timestamp ? new Date(data.timestamp).getTime() : Date.now();
    const timeLabel = new Date(timestamp).toLocaleTimeString("en-US", { hour12: false });

    // Store in history array
    telemetryHistory.push({
      timestamp,
      label: timeLabel,
      voltage: typeof data.voltage === "number" ? data.voltage : parseFloat(data.voltage) || null,
      current: typeof data.current === "number" ? data.current : parseFloat(data.current) || null,
      realPower: typeof data.realPower === "number" ? data.realPower : parseFloat(data.realPower) || null,
      apparentPower: typeof data.apparentPower === "number" ? data.apparentPower : parseFloat(data.apparentPower) || null,
      powerFactor: typeof data.powerFactor === "number" ? data.powerFactor : parseFloat(data.powerFactor) || null
    });

    // Keep history capped (last 2 hours max to prevent memory bloat)
    const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000;
    while (telemetryHistory.length > 0 && telemetryHistory[0].timestamp < twoHoursAgo) {
      telemetryHistory.shift();
    }

    renderChartsForTimeRange();

    // Update Real vs Apparent Power comparison chart
    if (charts.powerComparison) {
      const rp = typeof data.realPower === "number" ? data.realPower : parseFloat(data.realPower) || 0;
      const ap = typeof data.apparentPower === "number" ? data.apparentPower : parseFloat(data.apparentPower) || 0;
      charts.powerComparison.data.datasets[0].data = [rp, ap];
      charts.powerComparison.update("none");
    }
  }

  function ingestHistoricalData(historyObject) {
    if (!historyObject || typeof historyObject !== "object") return;
    
    // Convert object or list to sorted array
    const entries = Object.values(historyObject);
    entries.forEach((item) => {
      if (item) {
        const ts = item.timestamp ? new Date(item.timestamp).getTime() : Date.now();
        telemetryHistory.push({
          timestamp: ts,
          label: new Date(ts).toLocaleTimeString("en-US", { hour12: false }),
          voltage: typeof item.voltage === "number" ? item.voltage : parseFloat(item.voltage) || null,
          current: typeof item.current === "number" ? item.current : parseFloat(item.current) || null,
          realPower: typeof item.realPower === "number" ? item.realPower : parseFloat(item.realPower) || null,
          apparentPower: typeof item.apparentPower === "number" ? item.apparentPower : parseFloat(item.apparentPower) || null,
          powerFactor: typeof item.powerFactor === "number" ? item.powerFactor : parseFloat(item.powerFactor) || null
        });
      }
    });

    // Sort by timestamp
    telemetryHistory.sort((a, b) => a.timestamp - b.timestamp);
    renderChartsForTimeRange();
  }

  function renderChartsForTimeRange() {
    const now = Date.now();
    const cutoff = now - currentTimeRangeMs;

    const filtered = telemetryHistory.filter((item) => item.timestamp >= cutoff);
    const labels = filtered.map((d) => d.label);

    if (charts.voltage) {
      charts.voltage.data.labels = labels;
      charts.voltage.data.datasets[0].data = filtered.map((d) => d.voltage);
      charts.voltage.update("none");
    }

    if (charts.current) {
      charts.current.data.labels = labels;
      charts.current.data.datasets[0].data = filtered.map((d) => d.current);
      charts.current.update("none");
    }

    if (charts.realPower) {
      charts.realPower.data.labels = labels;
      charts.realPower.data.datasets[0].data = filtered.map((d) => d.realPower);
      charts.realPower.update("none");
    }

    if (charts.apparentPower) {
      charts.apparentPower.data.labels = labels;
      charts.apparentPower.data.datasets[0].data = filtered.map((d) => d.apparentPower);
      charts.apparentPower.update("none");
    }

    if (charts.powerFactor) {
      charts.powerFactor.data.labels = labels;
      charts.powerFactor.data.datasets[0].data = filtered.map((d) => d.powerFactor);
      charts.powerFactor.update("none");
    }
  }

  function setTimeRange(rangeMinutes) {
    currentTimeRangeMs = rangeMinutes * 60 * 1000;
    renderChartsForTimeRange();
  }

  function updateTheme() {
    const colors = getThemeColors();
    Object.values(charts).forEach((chart) => {
      if (!chart) return;
      if (chart.options.scales && chart.options.scales.x) {
        chart.options.scales.x.grid.color = colors.gridColor;
        chart.options.scales.x.ticks.color = colors.textColor;
      }
      if (chart.options.scales && chart.options.scales.y) {
        chart.options.scales.y.grid.color = colors.gridColor;
        chart.options.scales.y.ticks.color = colors.textColor;
      }
      if (chart.options.plugins && chart.options.plugins.tooltip) {
        chart.options.plugins.tooltip.backgroundColor = colors.tooltipBg;
        chart.options.plugins.tooltip.titleColor = colors.tooltipText;
        chart.options.plugins.tooltip.bodyColor = colors.tooltipText;
        chart.options.plugins.tooltip.borderColor = colors.tooltipBorder;
      }
      chart.update();
    });
  }

  // Listen for theme toggle events
  window.addEventListener("themeChanged", updateTheme);

  window.ChartManager = {
    init: initCharts,
    addPoint: addDataPoint,
    ingestHistory: ingestHistoricalData,
    setTimeRange: setTimeRange,
    updateTheme: updateTheme
  };
})();
