import amqplib from "amqplib";
import { User } from "../models/user.model.js";
import dotenv from "dotenv";
dotenv.config();
export const startUserRpcHandler = async () => {
  const connection = await amqplib.connect(process.env.RABBITMQ_URL);
  const channel = await connection.createChannel();

  await channel.assertQueue("get_user_info", { durable: false });

  channel.consume("get_user_info", async (msg) => {
    const { userId } = JSON.parse(msg.content.toString());
    const user = await User.findById(userId);

    const userData = {
      name: user?.name || null,
      avatar: user?.avatar || null,
      email: user?.email || null,
    };

    channel.sendToQueue(
      msg.properties.replyTo,
      Buffer.from(JSON.stringify(userData)),
      { correlationId: msg.properties.correlationId }
    );

    channel.ack(msg);
  });

  console.log("📡 User RPC handler ready");
};
startUserRpcHandler().catch((error) => {
  console.error("❌ Failed to start User RPC handler:", error);
});