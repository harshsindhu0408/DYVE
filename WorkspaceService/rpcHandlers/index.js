import amqp from "amqplib";
import { 
  handleCheckWorkspaceRole,
  handleUpdateMemberRole,
  handleCheckOtherOwners
} from "./workspaceRpcHandlers.js";

export const startConsumer = async () => {
  try {
    const connection = await amqp.connect(process.env.RABBITMQ_URL);
    const channel = await connection.createChannel();

    await channel.assertQueue("workspace_rpc_queue", { 
      durable: true,
      arguments: {
        'x-message-ttl': 60000 // 1 minute TTL for RPC
      }
    });
    channel.prefetch(1); // Process one message at a time

    console.log("🔁 Workspace RPC Consumer running...");

    channel.consume("workspace_rpc_queue", async (msg) => {
      try {
        const { action, payload } = JSON.parse(msg.content.toString());
        
        const enrichedMsg = {
          payload,
          replyTo: msg.properties.replyTo,
          correlationId: msg.properties.correlationId,
        };

        let response;
        switch (action) {
          case "check_permissions":
            response = await handleCheckWorkspaceRole(channel, enrichedMsg);
            break;
          case "update_member_role":
            response = await handleUpdateMemberRole(channel, enrichedMsg);
            break;
          case "check_other_owners":
            response = await handleCheckOtherOwners(channel, enrichedMsg);
            break;
          default:
            console.warn(`❗ Unknown RPC action: ${action}`);
            response = { 
              error: { 
                code: "INVALID_ACTION", 
                message: "Unknown RPC action" 
              } 
            };
        }

        channel.sendToQueue(
          msg.properties.replyTo,
          Buffer.from(JSON.stringify(response)),
          { correlationId: msg.properties.correlationId }
        );
        channel.ack(msg);
      } catch (error) {
        console.error("RPC processing failed:", error);
        channel.nack(msg); // Reject message on error
      }
    });

    // Handle connection errors
    connection.on("close", () => {
      console.log("RabbitMQ connection closed, reconnecting...");
      setTimeout(startConsumer, 5000);
    });

  } catch (error) {
    console.error("Failed to start RPC consumer:", error);
    setTimeout(startConsumer, 5000); // Retry on failure
  }
};