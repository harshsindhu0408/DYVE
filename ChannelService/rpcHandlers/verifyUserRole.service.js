import { v4 as uuidv4 } from "uuid";
import amqp from "amqplib";

export const checkAdminPermission = async (workspaceId, userId) => {
  const connection = await amqp.connect(process.env.RABBITMQ_URL, {
    heartbeat: 30,
    connectionTimeout: 10000,
  });

  connection.on("error", (err) => {
    console.error("RabbitMQ connection error:", err);
    if (!err.isOperational) {
      process.exit(1);
    }
  });
  const channel = await connection.createChannel();

  const correlationId = uuidv4();
  const replyQueue = await channel.assertQueue("", { exclusive: true });

  return new Promise((resolve, reject) => {
    // Add timeout handler
    const timeout = setTimeout(() => {
      connection.close();
      reject(new Error("RPC request timed out"));
    }, 5000);

    channel.consume(
      replyQueue.queue,
      (msg) => {
        if (msg.properties.correlationId === correlationId) {
          clearTimeout(timeout);
          const data = JSON.parse(msg.content.toString());
          resolve(data);
          setTimeout(() => {
            connection.close();
          }, 500);
        }
      },
      { noAck: true }
    );

    channel.sendToQueue(
      "workspace_rpc_queue",
      Buffer.from(
        JSON.stringify({
          action: "check_permissions", // Changed from 'type' to 'action'
          payload: { workspaceId, userId },
        })
      ),
      {
        correlationId,
        replyTo: replyQueue.queue,
      }
    );
  });
};
