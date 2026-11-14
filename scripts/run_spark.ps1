docker exec spark-master /opt/spark/bin/spark-submit `
  --master spark://10.77.120.200:7077 `
  --driver-memory 1g `
  --executor-memory 1500m `
  --conf spark.driver.host=10.77.120.200 `
  --conf spark.driver.bindAddress=0.0.0.0 `
  --conf spark.driver.port=7078 `
  --conf spark.blockManager.port=7079 `
  --conf spark.hadoop.dfs.client.use.datanode.hostname=true `
  --conf spark.jars.ivy=/tmp/.ivy2 `
  --packages org.mongodb.spark:mongo-spark-connector_2.12:10.4.0 `
  /scripts/a.py
