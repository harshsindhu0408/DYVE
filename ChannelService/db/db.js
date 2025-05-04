import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config();


const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URL);

    console.log(`MongoDB Connected: ${conn.connection.host}`);

    // Event listeners for connection health
    mongoose.connection.on("connected", () => {
      console.log("Mongoose default connection open");
    });

    mongoose.connection.on("error", (err) => {
      console.error("Mongoose connection error:", err);
    });

    mongoose.connection.on("disconnected", () => {
      console.warn("Mongoose connection disconnected");
    });
  } catch (err) {
    console.error("MongoDB connection error:", err.message);

    // Implement retry logic if needed
    setTimeout(connectDB, 50000); // Retry after 5 seconds
  }
};

export default connectDB;
