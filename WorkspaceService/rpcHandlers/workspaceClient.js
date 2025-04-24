import amqp from "amqplib";

const WORKSPACE_SERVICE_QUEUE = "workspace_service_queue";
let channel;

// Initialize RabbitMQ connection
export async function initWorkspaceRpcClient() {
  const connection = await amqp.connect(process.env.RABBITMQ_URL);
  channel = await connection.createChannel();
  await channel.assertQueue(WORKSPACE_SERVICE_QUEUE);
}

// RPC call to check permissions
export async function rpcCheckWorkspacePermissions(workspaceId, userId) {
  return rpcCall("check_permissions", { workspaceId, userId });
}

// RPC call to check for other owners
export async function rpcCheckOtherOwners(workspaceId, excludeUserId) {
  return rpcCall("check_other_owners", { workspaceId, excludeUserId });
}

// RPC call to update member role
export async function rpcUpdateWorkspaceMemberRole(
  workspaceId,
  userId,
  role,
  changedBy
) {
  return rpcCall("update_member_role", {
    workspaceId,
    userId,
    role,
    changedBy,
  });
}

// Generic RPC caller
async function rpcCall(action, payload) {
  const correlationId = generateUuid();
  const replyQueue = await channel.assertQueue("", { exclusive: true });

  return new Promise((resolve, reject) => {
    // Response handler
    channel.consume(
      replyQueue.queue,
      (msg) => {
        if (msg.properties.correlationId === correlationId) {
          const response = JSON.parse(msg.content.toString());
          if (response.error) {
            const err = new Error(response.error.message);
            err.isRpcError = true;
            err.code = response.error.code;
            err.status = response.error.status;
            reject(err);
          } else {
            resolve(response.data);
          }
        }
      },
      { noAck: true }
    );

    // Send request
    channel.sendToQueue(
      WORKSPACE_SERVICE_QUEUE,
      Buffer.from(JSON.stringify({ action, payload })),
      {
        correlationId,
        replyTo: replyQueue.queue,
      }
    );

    // Timeout after 5 seconds
    setTimeout(() => {
      const err = new Error("Workspace service timeout");
      err.isRpcError = true;
      err.code = "RPC_TIMEOUT";
      err.status = 504;
      reject(err);
    }, 5000);
  });
}

function generateUuid() {
  return (
    Math.random().toString() +
    Math.random().toString() +
    Math.random().toString()
  );
}
