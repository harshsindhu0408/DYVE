import amqplib from "amqplib";

class EventBus {
  constructor() {
    this.connection = null;
    this.channel = null;
    this.retryCount = 0;
    this.maxRetries = 5;
    this.isConnected = false;
    this.connecting = false;
    this.connectionPromise = null;
    this.subscriptions = [];
    this.publishQueue = [];
    this.isReplaying = false;
  }

  async ensureConnection() {
    if (this.isConnected && this.channel) return true;
    if (this.connecting) return this.connectionPromise;

    this.connecting = true;
    this.connectionPromise = this.connect()
      .then(() => {
        this.isConnected = true;
        this.connecting = false;
        return true;
      })
      .catch((err) => {
        this.connecting = false;
        throw err;
      });

    return this.connectionPromise;
  }

  async connect() {
    try {
      // Clean up any existing connection
      await this.cleanup();

      // Establish new connection
      this.connection = await amqplib.connect(process.env.RABBITMQ_URL, {
        heartbeat: 30,
        timeout: 5000, // Add connection timeout
      });

      this.channel = await this.connection.createConfirmChannel(); // Use confirm channel
      await this.channel.prefetch(10); // Slightly higher prefetch

      // Add these event handlers
      this.channel.on("error", (err) => {
        console.error("Channel error:", err);
        this.handleConnectionError(err);
      });

      this.channel.on("close", () => {
        console.log("Channel closed");
        this.handleConnectionClose();
      });
      this.connection.on("error", (err) => this.handleConnectionError(err));

      console.log("✅ Connected to RabbitMQ");
      this.retryCount = 0;
      this.isConnected = true;

      // Replay any pending operations
      await this.replayOperations();

      return true;
    } catch (error) {
      await this.handleConnectionFailure(error);
      throw error;
    }
  }

  async cleanup() {
    try {
      if (this.channel) {
        await this.channel.close();
        this.channel = null;
      }
      if (this.connection) {
        await this.connection.close();
        this.connection = null;
      }
    } catch (e) {
      console.warn("Cleanup error:", e);
    } finally {
      this.isConnected = false;
    }
  }

  handleConnectionClose() {
    console.log("RabbitMQ connection closed, reconnecting...");
    this.isConnected = false;
    this.retryConnect();
  }

  handleConnectionError(err) {
    console.error("RabbitMQ connection error:", err);
    this.isConnected = false;
  }

  async handleConnectionFailure(error) {
    console.error("❌ RabbitMQ connection failed:", error);
    await this.cleanup();
    this.retryConnect();
  }

  async retryConnect() {
    if (this.retryCount >= this.maxRetries) {
      console.error("Max connection retries reached");
      return;
    }

    this.retryCount++;
    const delay = Math.min(5000, this.retryCount * 1000);

    console.log(
      `Retrying connection in ${delay}ms (attempt ${this.retryCount})`
    );
    setTimeout(() => this.connect(), delay);
  }

  async publish(exchange, routingKey, message, options = {}) {
    try {
      await this.ensureConnection(); // Ensure connection is established

      if (!this.channel) {
        console.error(
          "Error: RabbitMQ channel is not available after ensureConnection."
        );
        throw new Error("RabbitMQ channel not available");
      }

      await this.channel.assertExchange(exchange, "topic", { durable: true });
      return this.channel.publish(
        exchange,
        routingKey,
        Buffer.from(JSON.stringify(message)),
        {
          persistent: true,
          ...options,
        }
      );
    } catch (error) {
      console.error("Publish failed:", error);
      throw error;
    }
  }

  async subscribe(exchange, queue, routingKey, handler) {
    if (!exchange || !queue || !routingKey || !handler) {
      throw new Error("Missing required subscription parameters");
    }

    // Store subscription before attempting
    const subscription = { exchange, queue, routingKey, handler };
    this.subscriptions.push(subscription);

    try {
      await this.ensureConnection();

      if (!this.channel) {
        throw new Error("RabbitMQ channel not available");
      }

      await this.setupSubscription(exchange, queue, routingKey, handler);
    } catch (error) {
      console.error("Subscription failed:", error);
      throw error;
    }
  }

  async setupSubscription(exchange, queue, routingKey, handler) {
    try {
      await this.channel.assertExchange(exchange, "topic", { durable: true });

      const COMMON_QUEUE_PARAMS = {
        durable: true,
        arguments: {
          "x-dead-letter-exchange": "dead_letters",
          "x-message-ttl": 3600000, // 1 hour TTL example
        },
      };

      // Store the queue assertion result
      const queueAssertion = await this.channel.assertQueue(
        queue,
        COMMON_QUEUE_PARAMS
      );

      await this.channel.bindQueue(queueAssertion.queue, exchange, routingKey);

      this.channel.consume(queueAssertion.queue, async (msg) => {
        if (!msg) return; // Handle null messages

        try {
          const data = JSON.parse(msg.content.toString());
          await handler(data);
          this.channel.ack(msg);
        } catch (error) {
          console.error("Message processing failed:", error);
          if (this.channel) {
            // Reject message without requeue
            this.channel.nack(msg, false, false);
          }
        }
      });

      console.log(`Subscribed to ${exchange}:${routingKey} (queue: ${queue})`);
    } catch (error) {
      console.error(
        `Failed to setup subscription for ${exchange}:${routingKey}`,
        error
      );
      throw error;
    }
  }

  async replayOperations() {
    if (this.isReplaying || !this.channel) return;

    this.isReplaying = true;
    console.log("Replaying pending operations...");

    try {
      // Replay subscriptions
      for (const sub of this.subscriptions) {
        try {
          await this.setupSubscription(
            sub.exchange,
            sub.queue,
            sub.routingKey,
            sub.handler
          );
        } catch (err) {
          console.error("Failed to replay subscription:", err);
        }
      }

      // Replay queued messages
      while (this.publishQueue.length > 0) {
        const msg = this.publishQueue.shift();
        try {
          await this.publish(
            msg.exchange,
            msg.routingKey,
            msg.message,
            msg.options
          );
        } catch (err) {
          console.error("Failed to replay message:", err);
          // Re-queue if still failing
          this.publishQueue.unshift(msg);
          break;
        }
      }
    } finally {
      this.isReplaying = false;
    }
  }

  async unsubscribe(queue) {
    const subscriptionIndex = this.subscriptions.findIndex(
      (sub) => sub.queue === queue
    );

    if (subscriptionIndex !== -1) {
      const subscription = this.subscriptions[subscriptionIndex];

      this.subscriptions.splice(subscriptionIndex, 1);

      try {
        await this.ensureConnection();
        if (this.channel) {
          await this.channel.cancel(queue);
          console.log(`Unsubscribed from queue: ${queue}`);
        }
      } catch (error) {
        console.error("Error during unsubscribe:", error);
      }
    } else {
      console.log(`No active subscription for queue: ${queue}`);
    }
  }

  async deleteQueue(queue) {
    try {
      await this.ensureConnection();
      if (!this.channel) {
        throw new Error("RabbitMQ channel not available");
      }

      // Delete the queue if it exists
      await this.channel.deleteQueue(queue);
      console.log(`Queue ${queue} deleted successfully`);
      return true;
    } catch (error) {
      // If queue doesn't exist, we can ignore the error
      if (error.message.includes("NOT_FOUND")) {
        console.log(`Queue ${queue} not found, nothing to delete`);
        return true;
      }
      console.error(`Error deleting queue ${queue}:`, error);
      throw error;
    }
  }

  // In your rabbit.js (EventBus class)
  async request(exchange, routingKey, message, options = {}) {
    const correlationId = generateCorrelationId();
    const responseQueue = `temp_res_${correlationId}`;

    return new Promise(async (resolve, reject) => {
      try {
        await this.channel.assertQueue(responseQueue, {
          exclusive: true,
          autoDelete: true,
          durable: false,
        });

        // Store the consumer tag properly
        const { consumerTag } = await this.channel.consume(
          responseQueue,
          (msg) => {
            if (!msg) return;

            try {
              const content = JSON.parse(msg.content.toString());
              if (content.correlationId === correlationId) {
                this.channel.ack(msg);
                clearTimeout(timeout);
                resolve(content.data);
              }
            } catch (error) {
              this.channel.nack(msg, false, false);
              reject(error);
            }
          },
          { noAck: false }
        );

        const timeout = setTimeout(() => {
          this.channel.cancel(consumerTag.toString()); // Ensure consumerTag is string
          reject(new Error("Request timeout"));
        }, options.timeout || 5000);

        await this.publish(exchange, routingKey, {
          ...message,
          correlationId,
          replyTo: responseQueue,
        });
      } catch (error) {
        reject(error);
      }
    });
  }
}

export const eventBus = new EventBus();

function generateCorrelationId() {
  return crypto.randomUUID();
}
