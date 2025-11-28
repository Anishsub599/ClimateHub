import React, { useEffect, useRef, useState } from "react";
import {
  Activity,
  Wind,
  Droplets,
  Gauge,
  Thermometer,
  Cloud,
} from "lucide-react";

type ApiResponse = {
  device_id: string;
  timestamp: string;
  AQI: number | string;
  humidity: number | string;
  MQ: number | string;
  PM1: number | string;
  PM10: number | string;
  PM25: number | string;
  PPM: number | string;
  Pressure: number | string;
  Temp: number | string;
};

type SensorData = {
  device_id: string;
  timestamp: string; // ISO string
  AQIValue: number; // numeric used for color/status
  AQIText: string; // original text/label if present
  humidity: number;
  MQ: number;
  PM1: number;
  PM10: number;
  PM25: number;
  PPM: number;
  Pressure: number;
  Temp: number;
};

const API_URL =
  "https://eg6cwvcdo4.execute-api.us-east-1.amazonaws.com/data?device_id=ESP32_01";

const toNumber = (v: unknown, fallback = 0): number => {
  if (v === null || v === undefined) return fallback;
  if (typeof v === "number") return Number.isFinite(v) ? v : fallback;
  const n = Number(String(v).trim());
  return Number.isFinite(n) ? n : fallback;
};

const mapAQIStringToNumber = (s: string): number => {
  const normalized = s.trim().toLowerCase();
  if (normalized.includes("good")) return 25;
  if (normalized.includes("moderate")) return 75;
  if (
    normalized.includes("unhealthy for sensitive") ||
    normalized.includes("sensitive")
  )
    return 125;
  if (normalized.includes("unhealthy")) return 175;
  if (normalized.includes("very") || normalized.includes("hazardous"))
    return 250;

  const n = Number(s);
  if (Number.isFinite(n)) return n;
  return 0;
};

const getAQIColor = (aqi: number) => {
  if (aqi <= 50) return "from-green-400 to-emerald-500";
  if (aqi <= 100) return "from-yellow-400 to-amber-500";
  if (aqi <= 150) return "from-orange-400 to-orange-600";
  if (aqi <= 200) return "from-red-400 to-red-600";
  return "from-purple-500 to-purple-700";
};

const getAQIStatus = (aqi: number) => {
  if (aqi <= 50) return "Good";
  if (aqi <= 100) return "Moderate";
  if (aqi <= 150) return "Unhealthy for Sensitive";
  if (aqi <= 200) return "Unhealthy";
  return "Very Unhealthy";
};

type MetricCardProps = {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number | string;
  unit?: string;
  color?: string;
};

const MetricCard: React.FC<MetricCardProps> = React.memo(
  ({ icon: Icon, label, value, unit, color }) => {
    const display =
      typeof value === "number" ? Number(value).toFixed(1) : String(value);
    return (
      <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 border border-white/15 hover:bg-white/15 transition-transform duration-200 hover:translate-y-[-4px]">
        <div className="flex items-center justify-between mb-3">
          <Icon className={`w-8 h-8 ${color ?? "text-white/90"}`} />
          <span className="text-sm text-white/70 font-medium">{label}</span>
        </div>
        <div className="text-3xl font-bold text-white mb-1">{display}</div>
        {unit && <div className="text-sm text-white/60">{unit}</div>}
      </div>
    );
  }
);

const DEFAULT_DATA: SensorData = {
  device_id: "ESP32_01",
  timestamp: new Date().toISOString(),
  AQIValue: 0,
  AQIText: "Unknown",
  humidity: 0,
  MQ: 0,
  PM1: 0,
  PM10: 0,
  PM25: 0,
  PPM: 0,
  Pressure: 0,
  Temp: 0,
};

const POLL_INTERVAL_MS = 10_000;

const App: React.FC = () => {
  const [data, setData] = useState<SensorData>(DEFAULT_DATA);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef<boolean>(true);

  const normalizeApiResponse = (raw: ApiResponse): SensorData => {
    const AQIText =
      typeof raw.AQI === "string"
        ? raw.AQI
        : typeof raw.AQI === "number"
        ? String(raw.AQI)
        : "Unknown";

    const AQIValue =
      typeof raw.AQI === "number"
        ? raw.AQI
        : typeof raw.AQI === "string"
        ? (Number.isFinite(Number(raw.AQI))
            ? Number(raw.AQI)
            : mapAQIStringToNumber(raw.AQI))
        : 0;

    return {
      device_id: raw.device_id ?? DEFAULT_DATA.device_id,
      timestamp: raw.timestamp ?? new Date().toISOString(),
      AQIValue: toNumber(AQIValue, 0),
      AQIText,
      humidity: toNumber(raw.humidity, 0),
      MQ: toNumber(raw.MQ, 0),
      PM1: toNumber(raw.PM1, 0),
      PM10: toNumber(raw.PM10, 0),
      PM25: toNumber(raw.PM25, 0),
      PPM: toNumber(raw.PPM, 0),
      Pressure: toNumber(raw.Pressure, 0),
      Temp: toNumber(raw.Temp, 0),
    };
  };

  const fetchData = async (signal?: AbortSignal) => {
    try {
      setError(null);
      setLoading(true);

      const controller = new AbortController();
      abortRef.current = controller;
      const combinedSignal = signal ?? controller.signal;

      const res = await fetch(API_URL, { signal: combinedSignal });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} ${res.statusText}`);
      }
      const json = (await res.json()) as ApiResponse;
      const normalized = normalizeApiResponse(json);

      if (!mountedRef.current) return;
      setData(normalized);
    } catch (err: any) {
      if (err?.name === "AbortError") {
        return;
      }
      console.error("fetchData error:", err);
      setError(err?.message ?? "Unknown error");
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  };

  useEffect(() => {
    mountedRef.current = true;
    const controller = new AbortController();
    fetchData(controller.signal);

    const id = setInterval(() => {
      fetchData();
    }, POLL_INTERVAL_MS);

    return () => {
      mountedRef.current = false;
      clearInterval(id);
      abortRef.current?.abort();
      controller.abort();
    };
  }, []);

  const aqiColor = getAQIColor(data.AQIValue);
  const aqiStatus = getAQIStatus(data.AQIValue);

  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-emerald-900 via-teal-800 to-cyan-900">
      {/* Outer padding responsive: small on mobile, bigger on desktop */}
      <div className="mx-auto px-4 sm:px-6 lg:px-10 py-6 sm:py-8 lg:py-10">
        {/* Header */}
        <header className="text-center mb-6 sm:mb-8">
          <div className="inline-flex items-center gap-3 mb-3 sm:mb-4 justify-center">
            <div className="w-10 h-10 sm:w-12 sm:h-12 bg-gradient-to-br from-green-400 to-emerald-500 rounded-full flex items-center justify-center animate-pulse">
              <Activity className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
            </div>
            <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold text-white">
              Climate Monitor
            </h1>
          </div>
          <p className="text-base sm:text-lg text-white/80 mb-1 sm:mb-2">
            Real-time Environmental Data — Device:{" "}
            <span className="font-medium text-white">{data.device_id}</span>
          </p>
          <p className="text-xs sm:text-sm text-white/60">
            Last Update:{" "}
            <span className="font-medium text-white">
              {new Date(data.timestamp).toLocaleString()}
            </span>
            {loading && (
              <span className="ml-2 text-yellow-300" aria-hidden>
                ⟳ Loading...
              </span>
            )}
            {error && (
              <span className="ml-2 text-red-300" role="alert">
                ⚠ {error}
              </span>
            )}
          </p>
        </header>

        {/* Main content – stacked layout, full-width cards on small screens */}
        <main className="space-y-8 sm:space-y-10 pb-4">
          {/* AQI Hero Card */}
          <section
            className={`bg-gradient-to-r ${aqiColor} rounded-3xl p-6 sm:p-8 shadow-2xl`}
            aria-labelledby="aqi-heading"
          >
            <div className="flex flex-col md:flex-row items-center justify-between gap-6">
              <div className="text-center md:text-left">
                <h2
                  id="aqi-heading"
                  className="text-white/90 text-lg font-medium mb-2"
                >
                  Air Quality Index
                </h2>
                <div className="flex flex-col sm:flex-row items-center sm:items-end gap-2 sm:gap-4">
                  <div className="text-5xl sm:text-6xl md:text-7xl font-extrabold text-white leading-none">
                    {typeof data.AQIText === "string" &&
                    data.AQIText.trim().length > 0 &&
                    isNaN(Number(data.AQIText))
                      ? data.AQIText
                      : Math.round(data.AQIValue)}
                  </div>
                  <div className="text-xl sm:text-2xl text-white/90 font-semibold">
                    {aqiStatus}
                  </div>
                </div>
                <div className="mt-2 text-white/80 text-xs sm:text-sm">
                  Numeric AQI: {Math.round(data.AQIValue)}
                </div>
              </div>
              <div className="text-white/20">
                <Wind className="w-24 h-24 sm:w-32 sm:h-32 md:w-36 md:h-36" />
              </div>
            </div>
          </section>

          {/* Particulate Matter */}
          <section>
            <h3 className="text-xl sm:text-2xl font-bold text-white mb-4 flex items-center gap-2">
              <Cloud className="w-6 h-6 text-emerald-300" />
              Particulate Matter
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 sm:gap-6">
              <MetricCard
                icon={Activity}
                label="PM1.0"
                value={data.PM1}
                unit="μg/m³"
                color="text-cyan-100"
              />
              <MetricCard
                icon={Activity}
                label="PM2.5"
                value={data.PM25}
                unit="μg/m³"
                color="text-blue-100"
              />
              <MetricCard
                icon={Activity}
                label="PM10"
                value={data.PM10}
                unit="μg/m³"
                color="text-purple-100"
              />
            </div>
          </section>

          {/* Environmental Conditions */}
          <section>
            <h3 className="text-xl sm:text-2xl font-bold text-white mb-4 flex items-center gap-2">
              <Thermometer className="w-6 h-6 text-emerald-300" />
              Environmental Conditions
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 sm:gap-6">
              <MetricCard
                icon={Thermometer}
                label="Temperature"
                value={data.Temp}
                unit="°C"
                color="text-orange-100"
              />
              <MetricCard
                icon={Droplets}
                label="Humidity"
                value={data.humidity}
                unit="%"
                color="text-blue-100"
              />
              <MetricCard
                icon={Gauge}
                label="Pressure"
                value={data.Pressure}
                unit="hPa"
                color="text-indigo-100"
              />
            </div>
          </section>

          {/* Gas Sensors */}
          <section>
            <h3 className="text-xl sm:text-2xl font-bold text-white mb-4 flex items-center gap-2">
              <Wind className="w-6 h-6 text-emerald-300" />
              Gas Sensors
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
              <MetricCard
                icon={Activity}
                label="MQ Sensor"
                value={data.MQ}
                unit="units"
                color="text-yellow-100"
              />
              <MetricCard
                icon={Cloud}
                label="CO₂ Level"
                value={data.PPM}
                unit="ppm"
                color="text-green-100"
              />
            </div>
          </section>

          {/* Footer */}
          <section className="pt-2 pb-4 text-center">
            <div className="inline-block bg-white/10 backdrop-blur-lg rounded-full px-5 sm:px-6 py-3 border border-white/15">
              <p className="text-white/90 text-sm sm:text-base font-medium">
                🌍 Together for a Cleaner Planet 🌱
              </p>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
};

export default App;
