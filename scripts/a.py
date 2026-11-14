from pyspark.sql import SparkSession
from pyspark.sql import functions as F
from pyspark.sql.types import LongType, IntegerType

# Replace with Friend 1's Master LAN IP
MASTER_IP = "10.77.120.200"
HDFS_INPUT_PATH = f"hdfs://{MASTER_IP}:9000/youtube/raw/*.csv"
MONGO_URI = f"mongodb://{MASTER_IP}:27017/youtube_stats"

# Standard YouTube Category ID mapping
CATEGORY_MAP = {
    1: "Film & Animation",
    2: "Autos & Vehicles",
    10: "Music",
    15: "Pets & Animals",
    17: "Sports",
    19: "Travel & Events",
    20: "Gaming",
    22: "People & Blogs",
    23: "Comedy",
    24: "Entertainment",
    25: "News & Politics",
    26: "Howto & Style",
    27: "Education",
    28: "Science & Technology",
    29: "Nonprofits & Activism",
}


def main():
    spark = (
        SparkSession.builder.appName("YouTubeVideoStatistics")
        .config("spark.mongodb.write.connection.uri", MONGO_URI)
        .getOrCreate()
    )
    spark.sparkContext.setLogLevel("WARN")

    print(">>> 1. Reading raw CSVs from HDFS...")
    raw_df = (
        spark.read.option("header", "true")
        .option("multiLine", "true")
        .option("escape", '"')
        .csv(HDFS_INPUT_PATH)
    )

    # Extract country code from filename (e.g., INvideos.csv -> IN, USvideos.csv -> US)
    df_with_country = raw_df.withColumn(
        "country",
        F.regexp_extract(F.input_file_name(), r"([A-Z]{2})videos\.csv", 1),
    ).withColumn(
        "country",
        F.when(F.col("country") == "", "GLOBAL").otherwise(F.col("country")),
    )

    print(">>> 2. Cleaning data and casting numeric columns...")
    cleaned_df = (
        df_with_country.filter(
            F.col("video_id").isNotNull() & (F.col("video_id") != "#NAME?")
        )
        .withColumn("views", F.col("views").cast(LongType()))
        .withColumn("likes", F.col("likes").cast(LongType()))
        .withColumn("dislikes", F.col("dislikes").cast(LongType()))
        .withColumn("comment_count", F.col("comment_count").cast(LongType()))
        .withColumn("category_id", F.col("category_id").cast(IntegerType()))
        .na.fill(
            {
                "views": 0,
                "likes": 0,
                "dislikes": 0,
                "comment_count": 0,
                "category_id": 0,
            }
        )
        .filter(F.col("views") > 0)
        .dropDuplicates(["video_id", "trending_date", "country"])
    )

    # Map numeric category_id to readable category names
    mapping_expr = F.create_map(
        [F.lit(x) for pair in CATEGORY_MAP.items() for x in pair]
    )
    enriched_df = cleaned_df.withColumn(
        "category_name",
        F.coalesce(mapping_expr[F.col("category_id")], F.lit("Other")),
    ).withColumn(
        "engagement_rate",
        F.round(
            ((F.col("likes") + F.col("comment_count")) / F.col("views")) * 100,
            2,
        ),
    )

    # Cache enriched DataFrame across Worker Nodes since we run 4 aggregations on it
    enriched_df.cache()

    print(">>> 3. Computing Category Statistics...")
    category_stats = (
        enriched_df.groupBy("country", "category_name")
        .agg(
            F.count("video_id").alias("total_trending_entries"),
            F.countDistinct("video_id").alias("unique_videos"),
            F.sum("views").alias("total_views"),
            F.round(F.avg("views"), 0).alias("avg_views"),
            F.sum("likes").alias("total_likes"),
            F.round(F.avg("likes"), 0).alias("avg_likes"),
            F.sum("comment_count").alias("total_comments"),
            F.round(F.avg("engagement_rate"), 2).alias("avg_engagement_rate"),
        )
        .orderBy(F.desc("total_views"))
    )

    print(">>> 4. Computing Time-Series / Publish Hour Trends...")
    hourly_trends = (
        enriched_df.withColumn(
            "publish_hour", F.hour(F.to_timestamp("publish_time"))
        )
        .filter(F.col("publish_hour").isNotNull())
        .groupBy("country", "publish_hour")
        .agg(
            F.count("video_id").alias("video_count"),
            F.round(F.avg("views"), 0).alias("avg_views"),
            F.round(F.avg("engagement_rate"), 2).alias("avg_engagement_rate"),
        )
        .orderBy("country", "publish_hour")
    )

    print(">>> 5. Extracting Top 100 Most Engaging Videos...")
    # Deduplicate by video_id keeping peak stats per country
    peak_videos = enriched_df.groupBy("country", "video_id").agg(
        F.first("title").alias("title"),
        F.first("channel_title").alias("channel_title"),
        F.first("category_name").alias("category_name"),
        F.max("views").alias("max_views"),
        F.max("likes").alias("max_likes"),
        F.max("comment_count").alias("max_comments"),
        F.round(
            ((F.max("likes") + F.max("comment_count")) / F.max("views")) * 100,
            2,
        ).alias("peak_engagement_rate"),
    )

    top_videos = (
        peak_videos.filter(F.col("max_views") >= 100000)
        .orderBy(F.desc("peak_engagement_rate"))
        .limit(100)
    )

    print(">>> 6. Computing Top Channels Leaderboard...")
    channel_leaderboard = (
        peak_videos.groupBy("country", "channel_title")
        .agg(
            F.count("video_id").alias("trending_videos_count"),
            F.sum("max_views").alias("cumulative_views"),
            F.sum("max_likes").alias("cumulative_likes"),
            F.round(F.avg("peak_engagement_rate"), 2).alias(
                "avg_engagement_rate"
            ),
        )
        .orderBy(F.desc("cumulative_views"))
        .limit(50)
    )

    print(">>> 7. Writing aggregated collections to MongoDB...")
    collections = {
        "category_stats": category_stats,
        "hourly_trends": hourly_trends,
        "top_videos": top_videos,
        "channel_leaderboard": channel_leaderboard,
    }

    for col_name, df in collections.items():
        (
            df.write.format("mongodb")
            .mode("overwrite")
            .option("collection", col_name)
            .save()
        )
        print(f"    Saved collection: {col_name} ({df.count()} records)")

    enriched_df.unpersist()
    spark.stop()
    print(">>> Pipeline completed successfully!")


if __name__ == "__main__":
    main()