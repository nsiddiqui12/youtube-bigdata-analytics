import express from "express";
import mongoose from "mongoose";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json());

// Connects directly to MongoDB running in Docker on Vineet's laptop
const MONGO_URI = "mongodb://127.0.0.1:27017/youtube_stats";

mongoose
  .connect(MONGO_URI)
  .then(() => console.log("Connected to MongoDB: youtube_stats"))
  .catch((err) => console.error("MongoDB connection error:", err));

// Generic read-only models mapped to your 4 PySpark output collections
const genericSchema = new mongoose.Schema({}, { strict: false });
const CategoryStats = mongoose.model("CategoryStats", genericSchema, "category_stats");
const HourlyTrends = mongoose.model("HourlyTrends", genericSchema, "hourly_trends");
const TopVideos = mongoose.model("TopVideos", genericSchema, "top_videos");
const ChannelLeaderboard = mongoose.model("ChannelLeaderboard", genericSchema, "channel_leaderboard");

app.get("/api/categories", async (req, res) => {
  const filter = req.query.country ? { country: req.query.country } : {};
  const data = await CategoryStats.find(filter).sort({ total_views: -1 }).lean();
  res.json(data);
});

app.get("/api/trends", async (req, res) => {
  const filter = req.query.country ? { country: req.query.country } : {};
  const data = await HourlyTrends.find(filter).sort({ publish_hour: 1 }).lean();
  res.json(data);
});

app.get("/api/top-videos", async (req, res) => {
  const filter = req.query.country ? { country: req.query.country } : {};
  const data = await TopVideos.find(filter).sort({ peak_engagement_rate: -1 }).limit(20).lean();
  res.json(data);
});

app.get("/api/channels", async (req, res) => {
  const filter = req.query.country ? { country: req.query.country } : {};
  const data = await ChannelLeaderboard.find(filter).sort({ cumulative_views: -1 }).limit(15).lean();
  res.json(data);
});

app.listen(5000, "0.0.0.0", () => {
  console.log("API server running on http://localhost:5000");
});