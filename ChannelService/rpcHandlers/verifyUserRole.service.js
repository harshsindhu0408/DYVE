import { v4 as uuidv4 } from "uuid";
import amqp from "amqplib";

export const checkAdminPermission = async (workspaceId, userId) => {
  const connection = await amqp.connect(process.env.RABBITMQ_URL);
  const channel = await connection.createChannel();

  const correlationId = uuidv4();
  const replyQueue = await channel.assertQueue('', { exclusive: true });

  return new Promise((resolve, reject) => {
    channel.consume(replyQueue.queue, (msg) => {
      if (msg.properties.correlationId === correlationId) {
        const data = JSON.parse(msg.content.toString());
        resolve(data);
        setTimeout(() => {
          connection.close();
        }, 500);
      }
    }, { noAck: true });

    channel.sendToQueue("workspace_rpc_queue", Buffer.from(JSON.stringify({
      type: "CHECK_WORKSPACE_ROLE",
      payload: { workspaceId, userId }
    })), {
      correlationId,
      replyTo: replyQueue.queue,
    });
  });
};
