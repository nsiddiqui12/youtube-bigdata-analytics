import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend,
} from "chart.js";
import { Bar, Line } from "react-chartjs-2";
import "./App.css";

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend
);

const API_BASE = "http://localhost:5000/api";

const COUNTRIES = [
  { code: "IN", name: "India", flag: "🇮🇳" },
  { code: "US", name: "United States", flag: "🇺🇸" },
  { code: "GB", name: "United Kingdom", flag: "🇬🇧" },
  { code: "CA", name: "Canada", flag: "🇨🇦" },
];

/* ---------- formatting helpers ---------- */
const compact = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });
const full = new Intl.NumberFormat("en");
const fmtCompact = (n) => compact.format(Number(n) || 0);
const fmtFull = (n) => full.format(Number(n) || 0);
const fmtHour = (h) => `${String(h).padStart(2, "0")}:00`;

// Titles in the dataset were stored as UTF-8 bytes read as Windows-1252
// (e.g. "ðŸ”¥" instead of "🔥"). Re-encode to bytes and decode as UTF-8.
const CP1252 = {
  0x20ac: 0x80, 0x201a: 0x82, 0x0192: 0x83, 0x201e: 0x84, 0x2026: 0x85, 0x2020: 0x86,
  0x2021: 0x87, 0x02c6: 0x88, 0x2030: 0x89, 0x0160: 0x8a, 0x2039: 0x8b, 0x0152: 0x8c,
  0x017d: 0x8e, 0x2018: 0x91, 0x2019: 0x92, 0x201c: 0x93, 0x201d: 0x94, 0x2022: 0x95,
  0x2013: 0x96, 0x2014: 0x97, 0x02dc: 0x98, 0x2122: 0x99, 0x0161: 0x9a, 0x203a: 0x9b,
  0x0153: 0x9c, 0x017e: 0x9e, 0x0178: 0x9f,
};
const utf8Decoder = new TextDecoder("utf-8", { fatal: true });
function fixText(s) {
  if (!s || !/[À-ÿ]/.test(s)) return s;
  const bytes = [];
  for (const ch of s) {
    const c = ch.codePointAt(0);
    if (c < 256) bytes.push(c);
    else if (CP1252[c] !== undefined) bytes.push(CP1252[c]);
    else return s;
  }
  try {
    return utf8Decoder.decode(new Uint8Array(bytes));
  } catch {
    return s;
  }
}

/* ---------- chart theme ---------- */
ChartJS.defaults.color = "#9aa4b2";
ChartJS.defaults.font.family = "Inter, system-ui, 'Segoe UI', Roboto, sans-serif";
ChartJS.defaults.borderColor = "rgba(255,255,255,0.06)";

const tooltipStyle = {
  backgroundColor: "rgba(15, 18, 26, 0.92)",
  borderColor: "rgba(255,255,255,0.14)",
  borderWidth: 1,
  titleColor: "#f1f5f9",
  bodyColor: "#cbd5e1",
  padding: 12,
  cornerRadius: 10,
  displayColors: false,
};

function verticalGradient(context, stops) {
  const { chart } = context;
  const { ctx, chartArea } = chart;
  if (!chartArea) return stops[0][1];
  const g = ctx.createLinearGradient(0, chartArea.bottom, 0, chartArea.top);
  stops.forEach(([pos, color]) => g.addColorStop(pos, color));
  return g;
}

function horizontalGradient(context, stops) {
  const { chart } = context;
  const { ctx, chartArea } = chart;
  if (!chartArea) return stops[0][1];
  const g = ctx.createLinearGradient(chartArea.left, 0, chartArea.right, 0);
  stops.forEach(([pos, color]) => g.addColorStop(pos, color));
  return g;
}

/* ---------- small components ---------- */
function Card({ title, subtitle, children, className = "" }) {
  return (
    <section className={`glass card ${className}`}>
      {(title || subtitle) && (
        <header className="card-head">
          {title && <h2>{title}</h2>}
          {subtitle && <p>{subtitle}</p>}
        </header>
      )}
      {children}
    </section>
  );
}

function Kpi({ label, value, hint, icon }) {
  return (
    <div className="glass kpi">
      <div className="kpi-icon" aria-hidden="true">{icon}</div>
      <div className="kpi-body">
        <span className="kpi-label">{label}</span>
        <span className="kpi-value metal-text">{value}</span>
        {hint && <span className="kpi-hint">{hint}</span>}
      </div>
    </div>
  );
}

function Skeleton({ height = 280 }) {
  return <div className="skeleton" style={{ height }} />;
}

/* ---------- app ---------- */
export default function App() {
  const [country, setCountry] = useState("IN");
  const [categories, setCategories] = useState([]);
  const [trends, setTrends] = useState([]);
  const [topVideos, setTopVideos] = useState([]);
  const [channels, setChannels] = useState([]);
  const [status, setStatus] = useState("loading"); // loading | ready | error
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const q = `?country=${country}`;
    Promise.all([
      axios.get(`${API_BASE}/categories${q}`),
      axios.get(`${API_BASE}/trends${q}`),
      axios.get(`${API_BASE}/top-videos${q}`),
      axios.get(`${API_BASE}/channels${q}`),
    ])
      .then(([catRes, trendRes, vidRes, chanRes]) => {
        if (cancelled) return;
        setCategories(catRes.data);
        setTrends(trendRes.data);
        setTopVideos(vidRes.data);
        setChannels(chanRes.data);
        setStatus("ready");
      })
      .catch(() => !cancelled && setStatus("error"));
    return () => {
      cancelled = true;
    };
  }, [country, reloadKey]);

  const selectCountry = (code) => {
    if (code === country) return;
    setStatus("loading");
    setCountry(code);
  };

  const retry = () => {
    setStatus("loading");
    setReloadKey((k) => k + 1);
  };

  const kpis = useMemo(() => {
    const totalViews = categories.reduce((s, c) => s + (c.total_views || 0), 0);
    const totalLikes = categories.reduce((s, c) => s + (c.total_likes || 0), 0);
    const totalComments = categories.reduce((s, c) => s + (c.total_comments || 0), 0);
    const uniqueVideos = categories.reduce((s, c) => s + (c.unique_videos || 0), 0);
    const engagement = totalViews ? ((totalLikes + totalComments) / totalViews) * 100 : 0;
    const peak = trends.reduce((best, t) => (!best || t.avg_views > best.avg_views ? t : best), null);
    const topCat = categories[0];
    return { totalViews, uniqueVideos, engagement, peak, topCat };
  }, [categories, trends]);

  const topCategories = categories.slice(0, 10);

  const categoryChart = {
    labels: topCategories.map((c) => c.category_name),
    datasets: [
      {
        label: "Total views",
        data: topCategories.map((c) => c.total_views),
        backgroundColor: (ctx) =>
          horizontalGradient(ctx, [
            [0, "rgba(148, 163, 184, 0.35)"],
            [0.55, "rgba(226, 232, 240, 0.75)"],
            [1, "rgba(255, 77, 94, 0.95)"],
          ]),
        borderRadius: 8,
        borderSkipped: false,
        barThickness: "flex",
        maxBarThickness: 22,
      },
    ],
  };

  const categoryOptions = {
    indexAxis: "y",
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: { ...tooltipStyle, callbacks: { label: (c) => `${fmtFull(c.raw)} views` } },
    },
    scales: {
      x: { grid: { color: "rgba(255,255,255,0.05)" }, ticks: { callback: (v) => fmtCompact(v) } },
      y: { grid: { display: false }, ticks: { color: "#cbd5e1" } },
    },
  };

  const trendChart = {
    labels: trends.map((t) => fmtHour(t.publish_hour)),
    datasets: [
      {
        label: "Average views",
        data: trends.map((t) => t.avg_views),
        borderColor: "#e2e8f0",
        borderWidth: 2.5,
        pointRadius: 0,
        pointHoverRadius: 6,
        pointHoverBackgroundColor: "#ff4d5e",
        pointHoverBorderColor: "#fff",
        fill: true,
        tension: 0.4,
        backgroundColor: (ctx) =>
          verticalGradient(ctx, [
            [0, "rgba(125, 211, 252, 0)"],
            [1, "rgba(125, 211, 252, 0.28)"],
          ]),
      },
    ],
  };

  const trendOptions = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: "index", intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: {
        ...tooltipStyle,
        callbacks: {
          title: (items) => `Published at ${items[0].label} UTC`,
          label: (c) => `${fmtFull(c.raw)} avg views`,
        },
      },
    },
    scales: {
      x: { grid: { display: false }, ticks: { maxRotation: 0, autoSkipPadding: 12 } },
      y: { grid: { color: "rgba(255,255,255,0.05)" }, ticks: { callback: (v) => fmtCompact(v) } },
    },
  };

  const maxEngagement = Math.max(1, ...topVideos.map((v) => v.peak_engagement_rate || 0));
  const maxChannelViews = Math.max(1, ...channels.map((c) => c.cumulative_views || 0));
  const loading = status === "loading";
  const activeCountry = COUNTRIES.find((c) => c.code === country);

  return (
    <div className="app">
      <div className="bg-orb orb-1" aria-hidden="true" />
      <div className="bg-orb orb-2" aria-hidden="true" />
      <div className="bg-orb orb-3" aria-hidden="true" />

      <header className="glass topbar">
        <div className="brand">
          <div className="logo" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="22" height="22">
              <path d="M8 5.5v13l11-6.5z" fill="currentColor" />
            </svg>
          </div>
          <div>
            <h1 className="metal-text">YouTube Trending Analytics</h1>
            <p className="tagline">
              <span className="pill">PySpark</span>
              <span className="pill">Hadoop HDFS</span>
              <span className="pill">MongoDB</span>
            </p>
          </div>
        </div>

        <nav className="segmented" aria-label="Select country">
          {COUNTRIES.map((c) => (
            <button
              key={c.code}
              type="button"
              className={c.code === country ? "active" : ""}
              aria-pressed={c.code === country}
              onClick={() => selectCountry(c.code)}
              title={c.name}
            >
              <span className="flag" aria-hidden="true">{c.flag}</span>
              <span className="code">{c.code}</span>
            </button>
          ))}
        </nav>
      </header>

      {status === "error" ? (
        <div className="glass error-box" role="alert">
          <h2>Can't reach the analytics API</h2>
          <p>
            Make sure the backend is running on <code>localhost:5000</code> and MongoDB is up.
          </p>
          <button type="button" className="btn-metal" onClick={retry}>
            Retry
          </button>
        </div>
      ) : (
        <main className="grid">
          <div className="kpis">
            <Kpi
              label="Total views"
              value={loading ? "—" : fmtCompact(kpis.totalViews)}
              hint={`Trending in ${activeCountry?.name}`}
              icon="👁"
            />
            <Kpi
              label="Unique videos"
              value={loading ? "—" : fmtCompact(kpis.uniqueVideos)}
              hint="Across all categories"
              icon="▶"
            />
            <Kpi
              label="Engagement rate"
              value={loading ? "—" : `${kpis.engagement.toFixed(2)}%`}
              hint="(Likes + comments) / views"
              icon="⚡"
            />
            <Kpi
              label="Best publish hour"
              value={loading || !kpis.peak ? "—" : fmtHour(kpis.peak.publish_hour)}
              hint={kpis.peak ? `${fmtCompact(kpis.peak.avg_views)} avg views · UTC` : "UTC"}
              icon="⏱"
            />
          </div>

          <Card
            title="Top categories"
            subtitle={kpis.topCat ? `${kpis.topCat.category_name} leads with ${fmtCompact(kpis.topCat.total_views)} views` : "By total views"}
            className="span-7"
          >
            <div className="chart-wrap tall">
              {loading ? <Skeleton height="100%" /> : <Bar data={categoryChart} options={categoryOptions} />}
            </div>
          </Card>

          <Card title="Publish hour vs. views" subtitle="Average views by upload hour (UTC)" className="span-5">
            <div className="chart-wrap tall">
              {loading ? <Skeleton height="100%" /> : <Line data={trendChart} options={trendOptions} />}
            </div>
          </Card>

          <Card title="Channel leaderboard" subtitle="Cumulative views of trending videos" className="span-5">
            {loading ? (
              <Skeleton />
            ) : (
              <ol className="leaderboard">
                {channels.slice(0, 10).map((ch, i) => (
                  <li key={ch._id || i}>
                    <span className={`rank rank-${i + 1}`}>{i + 1}</span>
                    <div className="lb-main">
                      <div className="lb-row">
                        <span className="lb-name" title={fixText(ch.channel_title)}>
                          {fixText(ch.channel_title)}
                        </span>
                        <span className="lb-value">{fmtCompact(ch.cumulative_views)}</span>
                      </div>
                      <div className="meter" aria-hidden="true">
                        <span style={{ width: `${(ch.cumulative_views / maxChannelViews) * 100}%` }} />
                      </div>
                      <span className="lb-meta">
                        {ch.trending_videos_count} trending videos · {ch.avg_engagement_rate}% engagement
                      </span>
                    </div>
                  </li>
                ))}
                {channels.length === 0 && <li className="empty">No channel data for this country.</li>}
              </ol>
            )}
          </Card>

          <Card title="Highest engagement videos" subtitle="Videos with 100K+ views, ranked by peak engagement" className="span-7">
            {loading ? (
              <Skeleton />
            ) : (
              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Video</th>
                      <th className="num hide-sm">Views</th>
                      <th className="num">Engagement</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topVideos.slice(0, 10).map((v, i) => (
                      <tr key={v._id || i}>
                        <td className="muted">{i + 1}</td>
                        <td className="video-cell">
                          <a
                            href={`https://www.youtube.com/watch?v=${v.video_id}`}
                            target="_blank"
                            rel="noreferrer"
                            className="video-title"
                            title={fixText(v.title)}
                          >
                            {fixText(v.title)}
                          </a>
                          <span className="video-meta">
                            {fixText(v.channel_title)} · {v.category_name}
                          </span>
                        </td>
                        <td className="num hide-sm">{fmtCompact(v.max_views)}</td>
                        <td className="num">
                          <div className="eng">
                            <span>{v.peak_engagement_rate}%</span>
                            <div className="meter small" aria-hidden="true">
                              <span style={{ width: `${(v.peak_engagement_rate / maxEngagement) * 100}%` }} />
                            </div>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {topVideos.length === 0 && (
                      <tr>
                        <td colSpan={4} className="empty">No video data for this country.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </main>
      )}

      <footer className="footer">
        Distributed pipeline · HDFS → Spark cluster → MongoDB → Express → React
      </footer>
    </div>
  );
}
