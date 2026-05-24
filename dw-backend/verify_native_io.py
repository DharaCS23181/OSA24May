import os
import sys

# Add backend to path
sys.path.append(os.getcwd())

from app.services.spark_service import spark_service
from dotenv import load_dotenv

# Force load latest .env
load_dotenv(override=True)

print("Attempting to initialize Spark with JAVA_HOME:", os.getenv("JAVA_HOME"))
print("Attempting to initialize Spark with HADOOP_HOME:", os.getenv("HADOOP_HOME"))

try:
    spark = spark_service.spark
    if spark:
        print("SUCCESS: SparkSession initialized successfully!")
        
        # Try a simple "saveAsTable" to verify NativeIO/Hadoop.dll
        print("Testing NativeIO (saveAsTable)...")
        df = spark.createDataFrame([(1, "test")], ["id", "val"])
        df.write.mode("overwrite").saveAsTable("test_native_io")
        print("SUCCESS: NativeIO verified! saveAsTable worked.")
        
    else:
        print("FAILED: SparkSession is None.")
except Exception as e:
    print(f"CRITICAL FAILURE: {e}")
finally:
    spark_service.stop()
