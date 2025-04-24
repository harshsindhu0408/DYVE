import { v4 as uuidv4 } from "uuid";
import amqp from "amqplib";
import { config } from "../config/config.js";

let channel;

export async function setupRabbit() {
  const connection = await amqp.connect(config.rabbitmqUrl);
  channel = await connection.createChannel();
}

export async function rpcGetUserData(userId) {
  return new Promise(async (resolve, reject) => {
    const correlationId = uuidv4();
    const replyQueue = await channel.assertQueue("", { exclusive: true });

    channel.consume(
      replyQueue.queue,
      (msg) => {
        if (msg.properties.correlationId === correlationId) {
          const data = JSON.parse(msg.content.toString());
          resolve(data);
        }
      },
      { noAck: true }
    );

    channel.sendToQueue(
      "get_user_info",
      Buffer.from(JSON.stringify({ userId })),
      {
        correlationId,
        replyTo: replyQueue.queue,
      }
    );

    setTimeout(() => reject(new Error("User info RPC timeout")), 5000);
  });
}
