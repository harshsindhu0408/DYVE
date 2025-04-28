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
      });

      // Create channel
      this.channel = await this.connection.createChannel();
      await this.channel.prefetch(1);

      // Setup event handlers
      this.connection.on("close", () => this.handleConnectionClose());
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
    // Store subscription
    this.subscriptions.push({ exchange, queue, routingKey, handler });

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
    await this.channel.assertExchange(exchange, "topic", { durable: true });

    const q = await this.channel.assertQueue(queue, {
      durable: true,
      arguments: {
        "x-dead-letter-exchange": `${exchange}.dead`,
        "x-dead-letter-routing-key": routingKey,
      },
    });

    await this.channel.bindQueue(q.queue, exchange, routingKey);

    this.channel.consume(q.queue, async (msg) => {
      try {
        const data = JSON.parse(msg.content.toString());
        await handler(data);
        this.channel.ack(msg);
      } catch (error) {
        console.error("Message processing failed:", error);
        if (this.channel) {
          this.channel.nack(msg, false, false);
        }
      }
    });

    console.log(`Subscribed to ${exchange}:${routingKey}`);
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
}

export const eventBus = new EventBus();
